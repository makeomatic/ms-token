import assert from 'assert'
import { resolve } from 'path'
import Redis from 'ioredis'
import { sync as readPkg } from 'read-pkg'
import { TokenManager } from '../src'

describe('TokenManager', () => {
  // init redis
  const redis = new Redis({ lazyConnect: true })
  const pkg = readPkg({ cwd: resolve(__dirname, '../') })

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
      }

      // @ts-expect-error test to verify that assert verifies backend names
      assert.throws(() => new TokenManager(opts), /"backend.name" must be \[redis\]/)
    })

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
        }

        // @ts-expect-error test to verify that backend connection opts are checked
        assert.throws(() => new TokenManager(opts), /"backend.connection" does not match any of the allowed types/)
      })

      it('fails to init when connection has encryption is not specified', () => {
        const opts = {
          backend: {
            name: 'redis',
            connection: redis,
          },
        }

        // @ts-expect-error test to verify that encrypt section is required
        assert.throws(() => new TokenManager(opts), /"encrypt" is required/)
      })

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
        }

        // @ts-expect-error test to verify that shared secret is validated
        assert.throws(() => new TokenManager(opts), /"encrypt.sharedSecret" must be at least 32 bytes/)
      })

      it('initializes with correct configuration', () => {
        const tokenManager = new TokenManager({
          backend: {
            name: 'redis',
            connection: redis,
          },
          encrypt: {
            algorithm: 'aes256',
            sharedSecret: '12345678901234567890123456789012',
          },
        })

        // check we have saved configuration
        assert.ok(tokenManager.config)

        assert.strictEqual(tokenManager.config.backend.name, 'redis')
        assert.strictEqual(tokenManager.config.backend.connection, redis)
        assert.strictEqual(tokenManager.config.backend.prefix, `{ms-token!${pkg.version}}`)
      })
    })
  })
})
