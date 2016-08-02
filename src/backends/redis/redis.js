const reduce = require('lodash/reduce');
const mapValues = require('lodash/mapValues');
const filter = require('lodash/filter');
const get = require('lodash/get');
const glob = require('glob');
const fs = require('fs');
const path = require('path');

/**
 * @class RedisBackend
 *
 * KV store requires us to follow a pretty-specific data structure
 * We need the following access patterns:
 *
 * 1. read by `id` & `action`
 * 2. read by `uid`
 * 3. remove by `id` & `action`
 * 4. remove by `uid`
 * 5. new secret by `uid`
 */
class RedisBackend {
  constructor(opts) {
    this.redis = opts.connection;
    this.prefix = opts.prefix;

    // load scripts
    const cwd = path.join(__dirname, 'lua');
    glob
      .sync('*.lua', { cwd })
      .forEach(script => {
        const name = path.basename(script, '.lua');
        const lua = fs.readFileSync(path.join(cwd, script), 'utf8');
        this.redis.defineCommand(name, { lua });
      });
  }

  static RESERVED_PROPS = {
    id: String,
    action: String,
    secret: String,
    uid: String,
  };

  // quick helpers
  static serialize = data => JSON.stringify(data);

  static deserialize = data => JSON.parse(data);

  // redis key helpers
  key(...args) {
    return this.prefix + filter(args, Boolean).join('!');
  }

  uid(uid) {
    return this.key('-', '-', 'uid', uid);
  }

  secret(action, id, secret) {
    return this.key(action, id, 'secret', secret);
  }

  throttle(action, id) {
    return this.key(action, id, 'throttle');
  }

  // public API
  create(settings) {
    // we need to define proper data structure for retrieval
    const { action, id, uid, ttl, throttle, metadata } = settings;

    // reasonable defaults
    const secret = get(settings, 'secret.token', null);
    const serializedMetadata = JSON.stringify(mapValues(metadata || {}, RedisBackend.serialize));

    // generate keys
    const idKey = this.key(action, id);
    const uidKey = (uid && this.uid(uid)) || idKey;
    const secretKey = this.secret(action, id, secret);
    const throttleKey = this.throttle(action, id);

    return this
      .redis
      .msTokenCreate(
        4, idKey, uidKey, secretKey, throttleKey,
        id, action, uid, ttl, throttle, secret, serializedMetadata
      );
  }

  info({ uid, id, action, token }) {
    let key;
    if (uid) {
      key = this.uid(uid);
    } else if (token) {
      key = this.secret(action, id, token);
    } else {
      key = this.key(action, id);
    }

    let length = 0;

    return this
      .redis
      .hgetall(key)
      .then(output => reduce(output, (acc, value, prop) => {
        if (RedisBackend.RESERVED_PROPS[prop]) {
          acc[prop] = value;
        } else {
          acc.metadata[prop] = RedisBackend.deserialize(value);
        }

        ++length;
        return acc;
      }, { metadata: {} }))
      .tap(() => {
        if (length === 0) {
          throw new Error(404);
        }
      });
  }
}

module.exports = RedisBackend;
