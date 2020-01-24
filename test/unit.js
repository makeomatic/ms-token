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
          sharedSecret: '12345678901234567890123456789012',
        },
      };

      assert.throws(() => new TokenManager(opts), /"backend.name" must be \[redis\]/);
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
            sharedSecret: '12345678901234567890123456789012',
          },
        };

        assert.throws(() => new TokenManager(opts), /"backend.connection" does not match any of the allowed types/);
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

        assert.throws(() => new TokenManager(opts), /"encrypt.sharedSecret" must be at least 32 bytes/);
      });

      it('initializes with correct configuration', () => {
        const opts = {
          backend: {
            name: 'redis',
            connection: redis,
          },
          encrypt: {
            algorithm: 'aes256',
            sharedSecret: '12345678901234567890123456789012',
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
