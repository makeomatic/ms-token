const assert = require('assert');
const Redis = require('ioredis');
const pkg = require('../package.json');

describe('TokenManager', () => {
  const TokenManager = require('../src');
  // init redis
  const redis = new Redis({ lazyConnect: true });

  describe('#constructor()', () => {
    it('fails to init on invalid backend name', () => {
      const opts = {
        backend: {
          name: 'redis-boo',
          connection: redis,
          prefix: 'ok',
        },
        encryption: {
          algorithm: 'aes256',
          sharedSecret: '123456789012345678901234',
        },
      };

      assert.throws(() => new TokenManager(opts), /\[1\] "name" must be one of \[redis\]/);
    });

    describe('redis backend', () => {
      it('fails to init when connection has invalid constructor', () => {
        const opts = {
          backend: {
            name: 'redis',
            connection: {},
          },
          encryption: {
            algorithm: 'aes256',
            sharedSecret: '123456789012345678901234',
          },
        };

        assert.throws(() => new TokenManager(opts), /"connection" must be an instance of "Redis"/);
      });

      it('fails to init when connection has encryption is not specified', () => {
        const opts = {
          backend: {
            name: 'redis',
            connection: redis,
          },
        };

        assert.throws(() => new TokenManager(opts), /"encrypt" is required/);
      });

      it('throws when secret is too small', () => {
        const opts = {
          backend: {
            name: 'redis',
            connection: redis,
          },
          encrypt: {
            algorithm: 'aes256',
            sharedSecret: '0',
          },
        };

        assert.throws(() => new TokenManager(opts), /"sharedSecret" must be at least 24 bytes/);
      });

      it('initializes with correct configuration', () => {
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

        const tokenManager = new TokenManager(opts);

        // check we have saved configuration
        assert.ok(tokenManager.config);

        assert.equal(tokenManager.config.backend.name, 'redis');
        assert.equal(tokenManager.config.backend.connection, redis);
        assert.equal(tokenManager.config.backend.prefix, `{ms-token!${pkg.version}}`);
      });
    });
  });
});
