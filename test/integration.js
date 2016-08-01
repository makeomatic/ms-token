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
    });
  });
});
