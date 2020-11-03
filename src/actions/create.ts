import Joi = require('joi')
import { v4 as uuidv4 } from 'uuid'
import { createSecret, SecretSettings } from '../utils/crypto'
import type { TokenManager } from '..'
import type { CreateOpts, Token } from '../backends/abstract'

export type CreateArgsBase<T> = Omit<CreateOpts, 'created' | 'secret'>
  & { legacy?: boolean; }
  & T

export type CreateArgs = CreateArgsBase<{
  secret?: SecretSettings | true;
  regenerate?: boolean;
}> | CreateArgsBase<{
  secret: false;
  regenerate?: false;
}>

// actual data schema
const schema = Joi
  .object<CreateArgs>({
    // type of action to perform
    action: Joi.string()
      .required(),

    // locking id
    id: Joi.string()
      .required(),

    ttl: Joi.number()
      .integer()
      .min(0),

    throttle: Joi.alternatives().try(
      Joi.number()
        .integer()
        .min(0)
        .max(Joi.ref('ttl')),
      Joi.boolean()
        .valid(true)
    ),

    metadata: Joi.any(),

    legacy: Joi.boolean().default(false),

    secret: Joi.alternatives()
      .try(
        Joi.boolean(),
        Joi.object<SecretSettings>({
          type: Joi.string()
            .valid('alphabet', 'number', 'uuid')
            .required(),

          alphabet: Joi.any()
            .when('type', {
              is: 'alphabet',
              then: Joi.string().required(),
              otherwise: Joi.forbidden(),
            }),

          length: Joi.any()
            .when('type', {
              is: Joi.string().valid('alphabet', 'number'),
              then: Joi.number().integer().min(1).required(),
              otherwise: Joi.forbidden(),
            }),

          encrypt: Joi.boolean()
            .when('type', {
              is: 'uuid',
              then: Joi.any().default(true),
              otherwise: Joi.any().default(false),
            }),
        })
      )
      .default(true),

    regenerate: Joi.boolean()
      .when('secret', {
        is: false,
        then: Joi.valid(false),
        otherwise: Joi.optional(),
      }),
  })
  .with('throttle', 'ttl')
  .required()

function getThrottle(_throttle: number | boolean, ttl: number) {
  // define throttle
  let throttle = _throttle || false
  if (throttle === true) {
    throttle = ttl
  }

  return throttle
}

function getSecret(_secret: CreateArgs['secret'] | true): SecretSettings | false {
  let secret = _secret || false
  if (!secret) {
    return secret
  }

  if (secret === true) {
    secret = { type: 'uuid', encrypt: true }
  }

  return secret
}

export async function create(this: TokenManager, args: CreateArgs & { secret: false }): Promise<Token & { secret: never }>
export async function create(this: TokenManager, args: CreateArgs & { secret?: SecretSettings | true, regenerate?: false }): Promise<Token & { secret: string, uid: never }>
export async function create(this: TokenManager, args: CreateArgs & { secret?: SecretSettings | true, regenerate: true }): Promise<Token & { secret: string, uid: string }>
export async function create(this: TokenManager, args: CreateArgs): Promise<Token> {
  const opts: Required<CreateArgs> = Joi.attempt(args, schema)

  const { action, id, ttl, metadata, legacy } = opts
  const throttle = getThrottle(opts.throttle, ttl)
  const uid = opts.regenerate ? uuidv4() : false
  const secret = getSecret(opts.secret)

  const settings: CreateOpts = {
    id,
    action,
    ttl,
    throttle,
    created: Date.now(),
  }

  const output: Token = {
    id,
    action,
  }

  if (uid) {
    settings.uid = uid
    output.uid = uid
  }

  if (metadata) {
    settings.metadata = metadata
  }

  if (secret) {
    settings.secret = secret
    output.secret = await createSecret(this.encrypt, secret, { id, action, uid }, legacy)
  }

  await this.backend.create(settings)

  return output
}
