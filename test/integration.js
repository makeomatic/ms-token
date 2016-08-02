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
    });
  });
});
