const mapValues = require('lodash/mapValues');
const filter = require('lodash/filter');
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

  key(...args) {
    return this.prefix + filter(args, Boolean).join('!');
  }

  create(settings) {
    // we need to define proper data structure for retrieval
    const { action, id, uid, ttl, throttle, metadata } = settings;

    // reasonable defaults
    const secret = settings.secret.token || null;

    // generate keys
    const idKey = this.key(action, id);
    const uidKey = (uid && this.key(uid)) || idKey;
    const secretKey = this.key(action, id, secret);
    const throttleKey = this.key(action, id, 'throttle');

    return this
      .redis
      .msTokenCreate(
        4,
        idKey,
        uidKey,
        secretKey,
        throttleKey,
        id,
        action,
        uid,
        ttl,
        throttle,
        secret,
        JSON.stringify(mapValues(metadata || {}, RedisBackend.serialize))
      );
  }

  info({ uid, id, action, token }) {
    let key;
    if (uid) {
      key = this.key(uid);
    } else if (token) {
      key = this.key(action, id, token);
    } else {
      key = this.key(action, id);
    }

    let length = 0;

    return this
      .redis
      .hgetall(key)
      .then(output => mapValues(output, (value, prop) => {
        ++length;
        return RedisBackend.RESERVED_PROPS[prop] ? value : RedisBackend.deserialize(value);
      }))
      .tap(() => {
        if (length === 0) {
          throw new Error(404);
        }
      });
  }
}

module.exports = RedisBackend;
