const Promise = require('bluebird');
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

    describe('#create & #info', () => {
      it('throw when id is not specified', () => manager
        .create({
          action: ACTION,
        })
        .reflect()
        .then(inspectPromise(false))
        .then(rejection => {
          assert.equal(rejection.name, 'ValidationError');
          assert(/\[1\] "id" is required/.test(rejection.toString()));
          return null;
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
          return null;
        })
      );

      it('throw when trying to use regenerate & secret: false', () => manager
        .create({
          id: ID,
          action: ACTION,
          regenerate: true,
          secret: false,
        })
        .reflect()
        .then(inspectPromise(false))
        .then(rejection => {
          assert.equal(rejection.name, 'ValidationError');
          assert(/\[1\] "regenerate" must be one of \[false\]/.test(rejection.toString()));
          return null;
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
        .then(result => manager.info({ token: result.secret, encrypt: true }))
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
          .info({ token: result.secret, encrypt: true })
          .reflect()
          .tap(inspectPromise())
          .delay(3000)
          .then(() => manager.info({ token: result.secret, encrypt: true }))
          .reflect()
          .then(inspectPromise(false))
          .then(error => {
            assert.equal(error.message, 404);
            return null;
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
          return null;
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

          return null;
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

          return null;
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

          return null;
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

          return null;
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
          return null;
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
          return null;
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
          return manager.info({ id: ID, action: ACTION, token: result.secret, encrypt: false });
        })
        .reflect()
        .then(inspectPromise())
        .then(result => {
          assert.equal(result.id, ID);
          assert.equal(result.action, ACTION);
          assert.ok(result.secret);
          return null;
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
          return null;
        })
      );
    });

    describe('#regenerate', () => {
      it('throws when trying to regenerate token with no secret settings', () =>
        manager
          .create({
            id: ID,
            action: ACTION,
            secret: false,
          })
          .reflect()
          .then(inspectPromise())
          .then(() => manager.regenerate({ id: ID, action: ACTION }))
          .reflect()
          .then(inspectPromise(false))
          .then(error => {
            assert.equal(error.message, 404);
            return null;
          })
      );

      it('throws when trying to regenerate token concurrently', () =>
        manager
          .create({
            id: ID,
            action: ACTION,
            regenerate: true,
          })
          .reflect()
          .then(inspectPromise())
          .then(() => Promise.join(
            // would succeed
            manager.regenerate({ id: ID, action: ACTION }),
            // would fail
            manager.regenerate({ id: ID, action: ACTION })
          ))
          .reflect()
          .then(inspectPromise(false))
          .then(error => {
            assert.equal(error.message, '409');
            return null;
          })
      );

      it('regenerates numeric secret', () =>
        manager
          .create({
            id: ID,
            action: ACTION,
            regenerate: true,
            secret: {
              type: 'number',
              length: 6,
            },
          })
          .reflect()
          .then(inspectPromise())
          .then(() => manager.regenerate({ id: ID, action: ACTION }))
          .reflect()
          .then(inspectPromise())
          .then(secret => {
            assert.ok(/^[0-9]{6}$/i.test(secret));
            return null;
          })
      );
    });

    describe('#verify', () => {
      it('rejects miscomposed secret', () =>
        manager
          .create({
            id: ID,
            action: ACTION,
            regenerate: true,
          })
          .then(result => manager.verify(result.secret.replace(/j/, 'a')))
          .reflect()
          .then(inspectPromise(false))
          .then(error => {
            assert.equal(error.message, 'invalid token');
            return null;
          })
      );

      it('rejects invalid secret', () =>
        manager
          .create({
            id: ID,
            action: ACTION,
            regenerate: true,
          })
          .then(result => manager.verify(result.secret.slice(1)))
          .reflect()
          .then(inspectPromise(false))
          .then(error => {
            assert.equal(error.message, 'invalid token');
            return null;
          })
      );

      it('completes challenge, erases it by default', () =>
        manager
          .create({
            id: ID,
            action: ACTION,
            regenerate: true,
          })
          .then(result =>
            manager
              .verify(result.secret)
              .reflect()
              .then(inspectPromise())
              .tap(data => {
                assert.equal(data.id, ID);
                assert.equal(data.action, ACTION);
                assert.ok(data.uid);
                assert.ok(data.verified);
                assert.equal(data.isFirstVerification, true);
              })
              .then(() => manager.verify(result.secret))
              .reflect()
              .then(inspectPromise(false))
              .then(error => {
                assert.equal(error.message, '404');
                return null;
              })
          )
      );

      it('completes challenge with unencrypted secret', () =>
        manager
          .create({
            id: ID,
            action: ACTION,
            regenerate: true,
            secret: {
              type: 'number',
              length: 10,
            },
          })
          .then(result => manager
            .verify({ id: ID, action: ACTION, token: result.secret })
            .reflect()
            .then(inspectPromise())
            .tap(data => {
              assert.equal(data.id, ID);
              assert.equal(data.action, ACTION);
              assert.ok(data.uid);
              assert.ok(data.verified);
              assert.equal(data.isFirstVerification, true);
            })
          )
      );

      it('completes challenge, does not erase it with settings', () =>
        manager
          .create({
            id: ID,
            action: ACTION,
          })
          .then(result => manager.verify(result.secret, { erase: false }))
          .reflect()
          .then(inspectPromise())
          .tap(result => {
            assert.equal(result.id, ID);
            assert.equal(result.action, ACTION);
            assert.ifError(result.uid);
            assert.ok(result.verified);
            assert.ok(result.isFirstVerification);
          })
          .then(result => manager.info({ id: ID, action: ACTION, token: result.secret, encrypt: false }))
          .reflect()
          .then(inspectPromise())
          .tap(result => {
            assert.equal(result.id, ID);
            assert.equal(result.action, ACTION);
            assert.ifError(result.uid);
            assert.ok(result.verified);
            assert.ifError(result.isFirstVerification);
          })
      );

      it('completes challenge, verifies it for the second time', () =>
        manager
          .create({
            id: ID,
            action: ACTION,
          })
          .then(result =>
            manager
              .verify(result.secret, { erase: false })
              .reflect()
              .then(inspectPromise())
              .tap(data => {
                assert.equal(data.id, ID);
                assert.equal(data.action, ACTION);
                assert.ifError(data.uid);
                assert.ok(data.verified);
                assert.ok(data.isFirstVerification);
              })
              .then(() => manager.verify(result.secret))
              .reflect()
              .then(inspectPromise())
              .tap(data => {
                assert.equal(data.id, ID);
                assert.equal(data.action, ACTION);
                assert.ifError(data.uid);
                assert.ok(data.verified);
                assert.ifError(data.isFirstVerification);
                return null;
              })
          )
      );
    });

    describe('#remove', () => {
      it('removes existing secret if it has not changed by id+action', () =>
        manager
          .create({
            id: ID,
            action: ACTION,
          })
          .then(() => manager.remove({ id: ID, action: ACTION }))
          .reflect()
          .then(inspectPromise())
          .then(result => {
            assert.equal(result, '200');
            return null;
          })
      );

      it('removes existing secret if it has not changed by encrypted secret', () =>
        manager
          .create({
            id: ID,
            action: ACTION,
          })
          .then(result => manager.remove(result.secret))
          .reflect()
          .then(inspectPromise())
          .then(result => {
            assert.equal(result, '200');
            return null;
          })
      );

      it('removes existing secret if it has not changed by uid', () =>
        manager
          .create({
            id: ID,
            action: ACTION,
            regenerate: true,
          })
          .then(result => manager.remove({ uid: result.uid }))
          .reflect()
          .then(inspectPromise())
          .then(result => {
            assert.equal(result, '200');
            return null;
          })
      );

      it('fails to remove non-existing secret', () =>
        manager
          .create({
            id: ID,
            action: ACTION,
          })
          .then(() => manager.remove({ id: ID, action: ACTION }))
          .reflect()
          .then(inspectPromise())
          .then(result => {
            assert.equal(result, '200');
            return null;
          })
          .then(() => manager.remove({ id: ID, action: ACTION }))
          .reflect()
          .then(inspectPromise(false))
          .then(err => {
            assert.equal(err.message, 404);
            return null;
          })
      );

      it('fails to remove changed secret', () =>
        manager
          .create({
            id: ID,
            action: ACTION,
            regenerate: true,
          })
          .then(result => Promise.join(
            manager.regenerate({ uid: result.uid }),
            manager.remove({ uid: result.uid })
          ))
          .reflect()
          .then(inspectPromise(false))
          .then(result => {
            assert.equal(result.message, '409');
            return null;
          })
      );
    });
  });
});
