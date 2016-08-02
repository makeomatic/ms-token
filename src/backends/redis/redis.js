const mapValues = require('lodash/mapValues');
const filter = require('lodash/filter');
const get = require('lodash/get');
const omit = require('lodash/omit');
const compact = require('lodash/compact');
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
    return uid && this.key('-', '-', 'uid', uid);
  }

  secret(action, id, secret) {
    return secret && this.key(action, id, 'secret', secret);
  }

  throttle(action, id) {
    return this.key(action, id, 'throttle');
  }

  generateKey({ uid, id, action, token }) {
    if (uid) {
      return this.uid(uid);
    } else if (token) {
      return this.secret(action, id, token);
    }

    return this.key(action, id);
  }

  // public API
  create(settings) {
    // we need to define proper data structure for retrieval
    const { action, id, uid, ttl, throttle, metadata } = settings;

    // reasonable defaults
    const secret = get(settings, 'secret.token', null);
    const secretSettings = RedisBackend.serialize(settings.secret && omit(settings.secret, 'token'));
    const serializedMetadata = RedisBackend.serialize(metadata || {});

    // generate keys
    const idKey = this.key(action, id);
    const uidKey = this.uid(uid) || idKey;
    const secretKey = this.secret(action, id, secret) || idKey;
    const throttleKey = this.throttle(action, id);

    return this
      .redis
      .msTokenCreate(
        4, idKey, uidKey, secretKey, throttleKey,
        id, action, uid, ttl, throttle, secret, secretSettings, serializedMetadata
      );
  }

  regenerate(opts, updateSecret) {
    const key = this.generateKey(opts);

    return this
      .redis
      .hgetall(key)
      .then(data => {
        // missing
        if (!data.settings || !data.secret) {
          throw new Error(404);
        }

        // definitions
        const id = data.id;
        const action = data.action;
        const uid = data.uid;
        const secretSettings = RedisBackend.deserialize(data.settings);
        const oldSecret = data.secret;
        const newSecret = updateSecret(id, action, uid, secretSettings);

        // redis keys
        const idKey = this.key(action, id);

        // this is always present in case of regenerate
        const uidKey = this.uid(uid);
        const oldSecretKey = this.secret(action, id, oldSecret);
        const newSecretKey = this.secret(action, id, newSecret);

        return this.redis
          .msTokenRegenerate(4, idKey, uidKey, oldSecretKey, newSecretKey, oldSecret, newSecret)
          .return(newSecret);
      });
  }

  info(opts) {
    const key = this.generateKey(opts);
    let length = 0;

    return this
      .redis
      .hgetall(key)
      .then(output => mapValues(output, (value, prop) => {
        ++length;
        if (RedisBackend.RESERVED_PROPS[prop]) {
          return value;
        }

        return RedisBackend.deserialize(value);
      }))
      .tap(() => {
        if (length === 0) {
          throw new Error(404);
        }
      });
  }

  remove(opts) {
    const key = this.generateKey(opts);

    // get data first
    return this
      .redis
      .hgetall(key)
      .then(data => {
        // dummy data check
        if (!data.id) {
          throw new Error(404);
        }

        // required data
        const { action, id, uid, secret } = data;

        // generate keys
        const keys = compact([
          this.key(action, id),
          this.uid(uid),
          this.secret(action, id, secret),
          this.throttle(action, id),
        ]);

        return this.redis.msTokenRemove(keys.length, keys, secret);
      });
  }
}

module.exports = RedisBackend;
