const assert = require('assert');
const Redis = require('ioredis');

describe('TokenManager', () => {
  const TokenManager = require('../src');

  describe('#Redis', () => {
    const redis = new Redis({
      host: 'redis',
      port: 6379,
    });

    const opts = {
      backend: {
        name: 'redis',
        connection: redis,
      },
      encrypt: {
        algorithm: 'aes256',
        sharedSecret: '123456789012345678901234',
      },
    };

    const ACTION = 'register';
    const ID = 'v@example.com';

    // created instance
    let manager;

    before('creates redis-backend instance', () => {
      manager = new TokenManager(opts);
    });

    beforeEach('cleans db', () => redis.flushdb());

    describe('#create', () => {
      it('throw when id is not specified', () => manager
        .create({
          action: ACTION,
        })
        .reflect()
        .then(inspectPromise(false))
        .then(rejection => {
          assert.equal(rejection.name, 'ValidationError');
          assert(/\[1\] "id" is required/.test(rejection.toString()));
        })
      );

      it('throw when action is not specified', () => manager
        .create({
          id: ID,
        })
        .reflect()
        .then(inspectPromise(false))
        .then(rejection => {
          assert.equal(rejection.name, 'ValidationError');
          assert(/\[1\] "action" is required/.test(rejection.toString()));
        })
      );

      it('creates timeless token for supplied id/action', () => manager
        .create({
          id: ID,
          action: ACTION,
        })
        .reflect()
        .then(inspectPromise())
        .tap(result => {
          assert.equal(result.id, ID);
          assert.equal(result.action, ACTION);
          assert.ok(result.secret);
          assert.ifError(result.uid);
        })
        .then(result => manager.info({ secret: result.secret, encrypt: true }))
        .tap(response => {
          assert.equal(response.id, ID);
          assert.equal(response.action, ACTION);
          // secret should've been saved
          assert.ok(response.secret);
          // uid should be falsy
          assert.ifError(response.uid);
        })
      );

      it('creates timed token for supplied id/action, expires as required', () => manager
        .create({
          id: ID,
          action: ACTION,
          ttl: 3,
        })
        .reflect()
        .then(inspectPromise())
        .tap(result => {
          assert.equal(result.id, ID);
          assert.equal(result.action, ACTION);
          assert.ok(result.secret);
        })
        .then(result => manager
          .info({ secret: result.secret, encrypt: true })
          .reflect()
          .tap(inspectPromise())
          .delay(3000)
          .then(() => manager.info({ secret: result.secret, encrypt: true }))
          .reflect()
          .then(inspectPromise(false))
          .then(error => {
            assert.equal(error.message, 404);
          })
        )
      );

      it('does not allow throttling to be set higher than ttl', () => manager
        .create({
          id: ID,
          action: ACTION,
          ttl: 3,
          throttle: 10,
        })
        .reflect()
        .then(inspectPromise(false))
        .tap(rejection => {
          assert.equal(rejection.name, 'ValidationError');
          assert(/\[1\] "throttle" must be less than or equal to 3/.test(rejection.toString()));
          assert(/\[2\] "throttle" must be a boolean/.test(rejection.toString()));
        })
      );

      it('does not allow recreating same token during throttling', () => manager
        .create({
          id: ID,
          action: ACTION,
          ttl: 10,
          throttle: true,
        })
        .reflect()
        .then(inspectPromise())
        .then(() => manager.create({ id: ID, action: ACTION }))
        .reflect()
        .then(inspectPromise(false))
        .then(error => {
          assert.equal(error.message, '429');
        })
      );

      it('allows to recreate token after throttle expired', () => manager
        .create({
          id: ID,
          action: ACTION,
          ttl: 3,
          throttle: 1,
        })
        .reflect()
        .then(inspectPromise())
        .delay(1000)
        .then(() => manager.create({ id: ID, action: ACTION }))
        .reflect()
        .then(inspectPromise())
        .then(result => {
          assert.equal(result.id, ID);
          assert.equal(result.action, ACTION);
          assert.ok(result.secret);
          assert.ifError(result.uid);
        })
      );

      it('if regenerate is supplied, uid is generated', () => manager
        .create({
          id: ID,
          action: ACTION,
          regenerate: true,
        })
        .reflect()
        .then(inspectPromise())
        .then(result => {
          assert.equal(result.id, ID);
          assert.equal(result.action, ACTION);
          assert.ok(result.secret);
          assert.ok(result.uid);
        })
      );

      it('if metadata is supplied, it is saved and then restored', () => manager
        .create({
          id: ID,
          action: ACTION,
          metadata: {
            random: ['10', 20, {}],
            bool: true,
            num: 32,
            arr: [],
            obj: { coarse: true },
          },
        })
        .reflect()
        .then(inspectPromise())
        .then(result => {
          assert.equal(result.id, ID);
          assert.equal(result.action, ACTION);
          assert.ok(result.secret);
          assert.ifError(result.uid);
          return manager.info({ id: result.id, action: result.action });
        })
        .then(result => {
          assert.deepEqual(result.metadata, {
            random: ['10', 20, {}],
            bool: true,
            num: 32,
            arr: [],
            obj: { coarse: true },
          });
        })
      );

      it('generates custom secret, type alphabet', () => manager
        .create({
          action: ACTION,
          id: ID,
          secret: {
            type: 'alphabet',
            alphabet: 'abcd',
            length: 10,
          },
        })
        .reflect()
        .then(inspectPromise())
        .then(result => {
          assert.equal(result.id, ID);
          assert.equal(result.action, ACTION);
          assert.ok(result.secret);
          assert.ifError(result.uid);
          assert.equal(result.secret.length, 10);

          // make sure that secret consists only of passed alphabet
          const chars = 'abcd'.split('');
          result.secret.split('').forEach(char => {
            assert(chars.includes(char));
          });
        })
      );

      it('generates custom secret, type number', () => manager
        .create({
          action: ACTION,
          id: ID,
          secret: {
            type: 'number',
            length: 6,
          },
        })
        .reflect()
        .then(inspectPromise())
        .then(result => {
          assert.equal(result.id, ID);
          assert.equal(result.action, ACTION);
          assert.ifError(result.uid);

          // contains only numbers
          assert.ok(/^[0-9]{6}$/.test(result.secret));
        })
      );

      it('does not generate secret', () => manager
        .create({
          action: ACTION,
          id: ID,
          secret: false,
        })
        .reflect()
        .then(inspectPromise())
        .then(result => {
          assert.equal(result.id, ID);
          assert.equal(result.action, ACTION);
          assert.ifError(result.secret);
        })
      );

      it('able to get info via unencrypted secret', () => manager
        .create({
          action: ACTION,
          id: ID,
          secret: {
            type: 'uuid',
            encrypt: false,
          },
        })
        .reflect()
        .then(inspectPromise())
        .then(result => {
          assert.equal(result.id, ID);
          assert.equal(result.action, ACTION);
          assert.ok(result.secret);
          return manager.info({ id: ID, action: ACTION, secret: result.secret, encrypt: false });
        })
        .reflect()
        .then(inspectPromise())
        .then(result => {
          assert.equal(result.id, ID);
          assert.equal(result.action, ACTION);
          assert.ok(result.secret);
        })
      );

      it('uses all options, combined', () => manager
        .create({
          action: ACTION,
          id: ID,
          ttl: 3,
          throttle: 2,
          metadata: {
            encrypt: 'me',
          },
          secret: {
            type: 'uuid',
            encrypt: false,
          },
          regenerate: true,
        })
        .reflect()
        .then(inspectPromise())
        .then(result => {
          assert.equal(result.id, ID);
          assert.equal(result.action, ACTION);
          assert.ok(result.uid);
          assert.ok(result.secret);

          // unencrypted uuid.v4
          assert.ok(/^[0-9A-F]{8}-[0-9A-F]{4}-4[0-9A-F]{3}-[89AB][0-9A-F]{3}-[0-9A-F]{12}$/i.test(result.secret));
          return manager.info({ uid: result.uid });
        })
        .reflect()
        .then(inspectPromise())
        .then(result => {
          assert.equal(result.id, ID);
          assert.equal(result.action, ACTION);
          assert.ok(result.uid);
          assert.ok(result.secret);
          assert.ok(/^[0-9A-F]{8}-[0-9A-F]{4}-4[0-9A-F]{3}-[89AB][0-9A-F]{3}-[0-9A-F]{12}$/i.test(result.secret));
          assert.deepEqual(result.metadata, {
            encrypt: 'me',
          });
        })
      );
    });
  });
});
