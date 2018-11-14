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

    after('stop redis', async () => {
      await redis.disconnect();
    });

    beforeEach('cleans db', () => redis.flushdb());

    describe('#create & #info', () => {
      it('throw when id is not specified', async () => {
        await assert.rejects(manager.create({ action: ACTION }), (e) => {
          assert(e.name === 'ValidationError');
          assert(/\[1\] "id" is required/m.test(e.toString()), e.toString());
          return true;
        });
      });

      it('throw when action is not specified', async () => {
        await assert.rejects(manager.create({ id: ID }), (rejection) => {
          assert(rejection.name === 'ValidationError');
          assert(/\[1\] "action" is required/m.test(rejection.toString()));
          return true;
        });
      });

      it('throw when trying to use regenerate & secret: false', async () => {
        await assert.rejects(manager.create({
          id: ID,
          action: ACTION,
          regenerate: true,
          secret: false,
        }), (rejection) => {
          assert(rejection.name === 'ValidationError');
          assert(/\[1\] "regenerate" must be one of \[false\]/m.test(rejection.toString()));
          return true;
        });
      });

      it('creates timeless token for supplied id/action', async () => {
        const result = await manager.create({
          id: ID,
          action: ACTION,
        });

        assert.equal(result.id, ID);
        assert.equal(result.action, ACTION);
        assert.ok(result.secret);
        assert.ok(!result.uid);

        const response = await manager.info({ token: result.secret, encrypt: true });

        assert.equal(response.id, ID);
        assert.equal(response.action, ACTION);
        // secret should've been saved
        assert.ok(response.secret);
        // uid should be falsy
        assert.ok(!response.uid);
      });

      it('creates timed token for supplied id/action, expires as required', async () => {
        const result = await manager.create({
          id: ID,
          action: ACTION,
          ttl: 3,
        });

        assert.equal(result.id, ID);
        assert.equal(result.action, ACTION);
        assert.ok(result.secret);

        await manager.info({ token: result.secret, encrypt: true });
        await Promise.delay(3100);

        await assert.rejects(manager.info({ token: result.secret, encrypt: true }), {
          message: '404',
        });
      });

      it('does not allow throttling to be set higher than ttl', async () => {
        await assert.rejects(manager.create({
          id: ID,
          action: ACTION,
          ttl: 3,
          throttle: 10,
        }), (rejection) => {
          assert.equal(rejection.name, 'ValidationError');
          assert(/\[1\] "throttle" must be less than or equal to 3/m.test(rejection.toString()));
          assert(/\[2\] "throttle" must be a boolean/m.test(rejection.toString()));
          return true;
        });
      });

      it('does not allow recreating same token during throttling', async () => {
        await manager.create({
          id: ID,
          action: ACTION,
          ttl: 10,
          throttle: true,
        });

        await assert.rejects(manager.create({ id: ID, action: ACTION }), (error) => {
          assert.equal(error.message, '429');
          return true;
        });
      });

      it('allows to recreate token after throttle expired', async () => {
        await manager.create({
          id: ID,
          action: ACTION,
          ttl: 3,
          throttle: 1,
        });

        await Promise.delay(1000);
        const result = await manager.create({ id: ID, action: ACTION });

        assert.equal(result.id, ID);
        assert.equal(result.action, ACTION);
        assert.ok(result.secret);
        assert.ok(!result.uid);
      });

      it('allows to recreate token, and erases old associated token before that', async () => {
        const result = await manager.create({
          id: ID,
          action: ACTION,
          regenerate: true,
        });

        this.uid = result.uid;
        this.secret = result.secret;

        const datum = await manager.create({ id: ID, action: ACTION, regenerate: true });

        this.newuid = datum.uid;
        this.newsecret = datum.secret;

        await assert.rejects(manager.info({ uid: this.uid }));
        await assert.rejects(manager.info({ token: this.secret, encrypt: true }));
        await manager.info({ uid: this.newuid });

        const info = await manager.info({ token: this.newsecret, encrypt: true });

        assert.notEqual(this.uid, info.uid);
        assert.equal(this.newuid, info.uid);
        assert.equal(ID, info.id);
        assert.equal(ACTION, info.action);
        assert.ok(info.created);
        assert.ok(info.related);
        assert.equal(info.related.length, 3);
      });

      it('if regenerate is supplied, uid is generated', async () => {
        const result = await manager.create({
          id: ID,
          action: ACTION,
          regenerate: true,
        });

        assert.equal(result.id, ID);
        assert.equal(result.action, ACTION);
        assert.ok(result.secret);
        assert.ok(result.uid);
      });

      it('if metadata is supplied, it is saved and then restored', async () => {
        const result = await manager.create({
          id: ID,
          action: ACTION,
          metadata: {
            random: ['10', 20, {}],
            bool: true,
            num: 32,
            arr: [],
            obj: { coarse: true },
          },
        });

        assert.equal(result.id, ID);
        assert.equal(result.action, ACTION);
        assert.ok(result.secret);
        assert.ok(!result.uid);

        const info = await manager.info({ id: result.id, action: result.action });

        assert.deepEqual(info.metadata, {
          random: ['10', 20, {}],
          bool: true,
          num: 32,
          arr: [],
          obj: { coarse: true },
        });
      });

      it('generates custom secret, type alphabet', async () => {
        const result = await manager.create({
          action: ACTION,
          id: ID,
          secret: {
            type: 'alphabet',
            alphabet: 'abcd',
            length: 10,
          },
        });

        assert.equal(result.id, ID);
        assert.equal(result.action, ACTION);
        assert.ok(result.secret);
        assert.ok(!result.uid);
        assert.equal(result.secret.length, 10);

        // make sure that secret consists only of passed alphabet
        const chars = 'abcd'.split('');
        result.secret.split('').forEach((char) => {
          assert(chars.includes(char));
        });
      });

      it('generates custom secret, type number', async () => {
        const result = await manager.create({
          action: ACTION,
          id: ID,
          secret: {
            type: 'number',
            length: 6,
          },
        });

        assert.equal(result.id, ID);
        assert.equal(result.action, ACTION);
        assert.ok(!result.uid);

        // contains only numbers
        assert.ok(/^[0-9]{6}$/.test(result.secret));
      });

      it('does not generate secret', async () => {
        const result = await manager.create({
          action: ACTION,
          id: ID,
          secret: false,
        });

        assert.equal(result.id, ID);
        assert.equal(result.action, ACTION);
        assert.ok(!result.secret);
      });

      it('able to get info via unencrypted secret', async () => {
        const result = await manager.create({
          action: ACTION,
          id: ID,
          secret: {
            type: 'uuid',
            encrypt: false,
          },
        });

        assert.equal(result.id, ID);
        assert.equal(result.action, ACTION);
        assert.ok(result.secret);

        const info = await manager.info({
          id: ID, action: ACTION, token: result.secret, encrypt: false,
        });

        assert.equal(info.id, ID);
        assert.equal(info.action, ACTION);
        assert.ok(info.secret);
      });

      it('uses all options, combined', async () => {
        const result = await manager.create({
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
        });

        assert.equal(result.id, ID);
        assert.equal(result.action, ACTION);
        assert.ok(result.uid);
        assert.ok(result.secret);

        // unencrypted uuid.v4
        assert.ok(/^[0-9A-F]{8}-[0-9A-F]{4}-4[0-9A-F]{3}-[89AB][0-9A-F]{3}-[0-9A-F]{12}$/i.test(result.secret));
        const info = await manager.info({ uid: result.uid });

        assert.equal(info.id, ID);
        assert.equal(info.action, ACTION);
        assert.ok(info.uid);
        assert.ok(info.secret);
        assert.ok(/^[0-9A-F]{8}-[0-9A-F]{4}-4[0-9A-F]{3}-[89AB][0-9A-F]{3}-[0-9A-F]{12}$/i.test(info.secret));
        assert.deepEqual(info.metadata, {
          encrypt: 'me',
        });
      });
    });

    describe('#regenerate', () => {
      it('throws when trying to regenerate token with no secret settings', async () => {
        await manager.create({
          id: ID,
          action: ACTION,
          secret: false,
        });

        await assert.rejects(manager.regenerate({ id: ID, action: ACTION }), (error) => {
          assert.equal(error.message, 404);
          return true;
        });
      });

      it('throws when trying to regenerate token concurrently', async () => {
        await manager.create({
          id: ID,
          action: ACTION,
          regenerate: true,
        });

        await assert.rejects(Promise.all([
          manager.regenerate({ id: ID, action: ACTION }),
          manager.regenerate({ id: ID, action: ACTION }),
        ]), (error) => {
          assert.equal(error.message, '409');
          return true;
        });
      });

      it('regenerates numeric secret', async () => {
        await manager.create({
          id: ID,
          action: ACTION,
          regenerate: true,
          secret: {
            type: 'number',
            length: 6,
          },
        });

        const secret = await manager.regenerate({ id: ID, action: ACTION });
        assert.ok(/^[0-9]{6}$/i.test(secret));
      });
    });

    describe('#verify', () => {
      it('rejects miscomposed secret', async () => {
        const result = await manager.create({
          id: ID,
          action: ACTION,
          regenerate: true,
        });

        await assert.rejects(manager.verify(result.secret.replace(/j/, 'a')), (error) => {
          assert.equal(error.message, 'invalid token');
          return true;
        });
      });

      it('rejects invalid secret', async () => {
        const result = await manager.create({
          id: ID,
          action: ACTION,
          regenerate: true,
        });

        await assert.rejects(manager.verify(result.secret.slice(1)), (error) => {
          assert.equal(error.message, 'invalid token');
          return true;
        });
      });

      it('rejects valid secret when using it for another user', async () => {
        const result = await manager.create({
          id: ID,
          action: ACTION,
        });

        await assert.rejects(manager.verify(result.secret, {
          control: {
            id: 'another@mail.com',
            action: 'another-namespace',
          },
        }), (error) => {
          assert.equal(error.message, `Sanity check failed for "id" failed: "another@mail.com" vs "${ID}"`);
          return true;
        });
      });

      it('completes challenge, erases it by default', async () => {
        const result = await manager.create({
          id: ID,
          action: ACTION,
          regenerate: true,
        });

        const data = await manager.verify(result.secret);

        assert.equal(data.id, ID);
        assert.equal(data.action, ACTION);
        assert.ok(data.uid);
        assert.ok(data.verified);
        assert.equal(data.isFirstVerification, true);

        await assert.rejects(manager.verify(result.secret), (error) => {
          assert.equal(error.message, '404');

          // furthermore, makes sure that it has additional error data
          assert.equal(error.args.id, ID);
          assert.equal(error.args.action, ACTION);
          assert.ok(!error.args.uid);
          assert.ok(error.args.token);

          return true;
        });
      });

      it('completes challenge with unencrypted secret', async () => {
        const result = await manager.create({
          id: ID,
          action: ACTION,
          regenerate: true,
          secret: {
            type: 'number',
            length: 10,
          },
        });

        const data = await manager.verify({ id: ID, action: ACTION, token: result.secret });

        assert.equal(data.id, ID);
        assert.equal(data.action, ACTION);
        assert.ok(data.uid);
        assert.ok(data.verified);
        assert.equal(data.isFirstVerification, true);
      });

      it('completes challenge, does not erase it with settings', async () => {
        const result = await manager.create({
          id: ID,
          action: ACTION,
        });

        const verify = await manager.verify(result.secret, { erase: false });

        assert.equal(verify.id, ID);
        assert.equal(verify.action, ACTION);
        assert.ok(!verify.uid);
        assert.ok(verify.verified);
        assert.ok(verify.isFirstVerification);

        const info = await manager.info({
          id: ID, action: ACTION, token: verify.secret, encrypt: false,
        });

        assert.equal(info.id, ID);
        assert.equal(info.action, ACTION);
        assert.ok(!info.uid);
        assert.ok(info.verified);
        assert.ok(!info.isFirstVerification);
      });

      it('completes challenge, verifies it for the second time', async () => {
        const result = await manager.create({
          id: ID,
          action: ACTION,
        });

        const data = await manager.verify(result.secret, { erase: false });

        assert.equal(data.id, ID);
        assert.equal(data.action, ACTION);
        assert.ok(!data.uid);
        assert.ok(data.verified);
        assert.ok(data.isFirstVerification);

        const verify = await manager.verify(result.secret);

        assert.equal(verify.id, ID);
        assert.equal(verify.action, ACTION);
        assert.ok(!verify.uid);
        assert.ok(verify.verified);
        assert.ok(!verify.isFirstVerification);
      });
    });

    describe('#remove', () => {
      it('removes existing secret if it has not changed by id+action', async () => {
        await manager.create({
          id: ID,
          action: ACTION,
        });

        const result = await manager.remove({ id: ID, action: ACTION });
        assert.equal(result, '200');
      });

      it('removes existing secret if it has not changed by encrypted secret', async () => {
        const result = await manager.create({
          id: ID,
          action: ACTION,
        });

        assert.equal(await manager.remove(result.secret), '200');
      });

      it('removes existing secret if it has not changed by uid', async () => {
        const result = await manager.create({
          id: ID,
          action: ACTION,
          regenerate: true,
        });

        assert.equal(await manager.remove({ uid: result.uid }), '200');
      });

      it('fails to remove non-existing secret', async () => {
        await manager.create({
          id: ID,
          action: ACTION,
        });

        await assert.equal(await manager.remove({ id: ID, action: ACTION }), '200');

        await assert.rejects(manager.remove({ id: ID, action: ACTION }), {
          message: '404',
        });
      });

      it('fails to remove changed secret', async () => {
        const result = await manager.create({
          id: ID,
          action: ACTION,
          regenerate: true,
        });

        await assert.rejects(Promise.join(
          manager.regenerate({ uid: result.uid }),
          manager.remove({ uid: result.uid })
        ), {
          message: '409',
        });
      });
    });
  });
});
