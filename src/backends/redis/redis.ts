import get from 'get-value'
import glob from 'glob'
import fs from 'fs'
import path from 'path'
import type { Redis, Cluster } from 'ioredis'
import type {
  Backend,
  CreateOpts,
  InfoOpts,
  RemoveOpts,
  VerifyOpts,
  RegenerateOpts,
  Response,
  VerifySettings,
  UpdateSecret,
  Token,
} from '../abstract'

export type RedisConfig = {
  connection: Redis | Cluster;
  prefix: string;
}

export type CreatedToken = Token & Required<Pick<Token, 'secret'>>

declare module 'ioredis' {
  interface Commands {
    msTokenCreate(keysNumber: 4,
                  idKey: string, uidKey: string, secretKey: string, throttleKey: string,
                  id: string, action: string, uid: string, ttl: number, throttle: number | boolean, created: number,
                  secret: string, secretSettings: string, serializedMetadata: string): Promise<{ok: 200}>

    msTokenRemove<T extends number>(keysNumber: T, keys: string[] & { length: T }, secret: string): Promise<{ok: 200}>

    msTokenRegenerate(keysNumber: 4, idKey: string, uidKey: string, oldSecretKey: string, newSecretKey: string,
                      oldSecret: string, newSecret: string): Promise<{ok: 200}>

    msVerifyToken(keysNumber: 1, key: string, timestamp: number, erase: string): Promise<Record<any, any> & { isFirstVerification: boolean }>
  }
}

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
export class RedisBackend implements Backend {
  #redis: Redis | Cluster;
  #prefix: string;

  private static RESERVED_PROPS: { [key: string]: StringConstructor | BooleanConstructor | NumberConstructor } = {
    id: String,
    action: String,
    secret: String,
    uid: String,
    created: Number,
    verified: Number,
    isFirstVerification: Boolean,
    throttleKey: String,
  }

  private static _deserialize(output: Record<any, any>): { value: Response, length: number } {
    let length = 0
    const remapped = Object.create(null)
    const { RESERVED_PROPS, deserialize } = RedisBackend

    for (const [prop, value] of Object.entries(output)) {
      length += 1
      remapped[prop] = (RESERVED_PROPS[prop] || deserialize)(value)
    }

    return {
      value: remapped,
      length,
    }
  }

  constructor(opts: RedisConfig) {
    this.#redis = opts.connection
    this.#prefix = opts.prefix

    // load scripts
    const cwd = path.join(__dirname, 'lua')
    for (const script of glob.sync('*.lua', { cwd })) {
      const name = path.basename(script, '.lua')
      const lua = fs.readFileSync(path.join(cwd, script), 'utf8')
      this.#redis.defineCommand(name, { lua })
    }
  }

  // quick helpers
  private static serialize(data: unknown): string {
    return JSON.stringify(data)
  }

  private static deserialize<T = any>(data: string): T {
    return JSON.parse(data)
  }

  // public API
  public async create(settings: CreateOpts): Promise<{ok: 200}> {
    // we need to define proper data structure for retrieval
    const { action, id, uid = '', ttl = 0, throttle = 0, metadata, created } = settings

    // reasonable defaults
    const secret = get(settings, 'secret.token', { default: null })
    const secretSettings = RedisBackend.serialize(settings.secret && { ...settings.secret, token: undefined })
    const serializedMetadata = RedisBackend.serialize(metadata || Object.create(null))

    // generate keys
    const idKey = this.key(action, id)
    const uidKey = this.uid(uid) || idKey
    const secretKey = this.secret(action, id, secret) || idKey
    const throttleKey = this.throttle(action, id)

    try {
      return await this.#redis.msTokenCreate(
        4, idKey, uidKey, secretKey, throttleKey,
        id, action, uid, ttl, throttle, created, secret, secretSettings, serializedMetadata
      )
    } catch (err) {
      if (err.message.startsWith('429')) {
        try {
          err.reason = JSON.parse(err.message.substring(4))
        } catch (e) {
          err.reason = Object.create(null)
        }

        err.message = '429'
      }

      throw err
    }
  }

  public async regenerate(opts: RegenerateOpts, updateSecret: UpdateSecret): Promise<string> {
    const key = this.generateKey(opts)
    const data = await this.#redis.hgetall(key)

    // missing
    if (!data.settings || !data.secret) {
      throw new Error('404')
    }

    // definitions
    const { id, action, uid } = data
    const secretSettings = RedisBackend.deserialize(data.settings)
    const oldSecret = data.secret
    const newSecret = await updateSecret(id, action, uid, secretSettings)

    // redis keys
    const idKey = this.key(action, id)

    // this is always present in case of regenerate
    const uidKey = this.uid(uid)
    const oldSecretKey = this.secret(action, id, oldSecret)
    const newSecretKey = this.secret(action, id, newSecret)

    await this.#redis.msTokenRegenerate(4, idKey, uidKey, oldSecretKey, newSecretKey, oldSecret, newSecret)

    return newSecret
  }

  public async info(opts: InfoOpts): Promise<Response> {
    const key = this.generateKey(opts)
    const { length, value } = RedisBackend._deserialize(await this.#redis.hgetall(key))

    if (length === 0) {
      throw new Error('404')
    }

    return value
  }

  // this is generally the same as info
  // if you can access it - you've passed the challenge
  // top level call ensures that this is only accessed through `secret`
  public async verify(opts: VerifyOpts, settings: VerifySettings): Promise<Response> {
    const key = this.generateKey(opts)

    const data = await this.#redis
      .msVerifyToken(1, key, Date.now(), String(settings.erase))

    const items = data.length
    const output = Object.create(null)
    const { RESERVED_PROPS, deserialize } = RedisBackend

    for (let i = 0; i < items; i += 2) {
      const prop = data[i]
      const value = data[i + 1]
      output[prop] = (RESERVED_PROPS[prop] || deserialize)(value)
    }

    return output
  }

  public async remove(opts: RemoveOpts): Promise<{ok: 200}> {
    const key = this.generateKey(opts)

    // get data first
    const data = await this.#redis.hgetall(key)

    RedisBackend.isDataToBeRemoveValid(data)

    return this._remove(data)
  }

  private static isDataToBeRemoveValid(data: any): asserts data is CreatedToken {
    // dummy data check
    if (!data.id || !data.secret) {
      throw new Error('404')
    }
  }

  // redis key helpers
  private key(...args: (string | undefined)[]): string {
    return this.#prefix + args.filter(Boolean).join('!')
  }

  private uid(uid?: string): string {
    return uid ? this.key('-', '-', 'uid', uid) : ''
  }

  private secret(action?: string, id?: string, secret = ''): string {
    return secret && this.key(action, id, 'secret', secret)
  }

  private throttle(action?: string, id?: string): string {
    return this.key(action, id, 'throttle')
  }

  private generateKey({ uid, token, action, id }: { uid?: string, id?: string; action?: string; token?: string; }): string {
    if (uid) {
      return this.uid(uid)
    }

    if (token) {
      return this.secret(action, id, token)
    }

    return this.key(action, id)
  }

  // private remove function,
  // generates keys to be removed and executes redis script
  private async _remove(data: CreatedToken): Promise<{ok: 200}> {
    // required data
    const { action, id, uid, secret } = data

    // generate keys
    const keys = [
      this.key(action, id),
      this.uid(uid),
      this.secret(action, id, secret),
      this.throttle(action, id),
    ].filter(Boolean)

    return this.#redis.msTokenRemove(keys.length, keys, secret)
  }
}


export default RedisBackend
