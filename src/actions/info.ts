import Joi from 'joi'
import { extractSecret } from '../utils/crypto'
import type { TokenManager } from '../'
import { InfoOpts, Response } from '../backends/abstract'

export type InfoArgs_1 = {
  uid: never;
  action: string;
  id: string;
  token: never;
  encrypt: never;
}

export type InfoArgs_2 = {
  uid: string;
  action: never;
  id: never;
  token: never;
  encrypt: never;
}

export type InfoArgs_3 = {
  uid: string;
  action: never;
  id: never;
  token: string;
  encrypt: true;
}

export type InfoArgs_4 = {
  uid: never;
  action: string;
  id: string;
  token: string;
  encrypt: false;
}

export type InfoArgs =
  InfoArgs_1 |
  InfoArgs_2 |
  InfoArgs_3 |
  InfoArgs_4

// actual data schema
const schema = Joi.alternatives()
  .try(
    Joi.object<InfoArgs_1>({
      uid: Joi.forbidden(),

      action: Joi.string()
        .required(),

      id: Joi.string()
        .required(),

      token: Joi.forbidden(),

      encrypt: Joi.forbidden(),
    }),

    Joi.object<InfoArgs_2>({
      uid: Joi.string()
        .required(),

      action: Joi.forbidden(),

      id: Joi.forbidden(),

      token: Joi.forbidden(),

      encrypt: Joi.forbidden(),
    }),

    Joi.object<InfoArgs_3>({
      uid: Joi.forbidden(),

      action: Joi.forbidden(),

      id: Joi.forbidden(),

      token: Joi.string()
        .required(),

      encrypt: Joi.bool()
        .valid(true)
        .required(),
    }),

    Joi.object<InfoArgs_4>({
      uid: Joi.forbidden(),

      action: Joi.string()
        .required(),

      id: Joi.string()
        .required(),

      token: Joi.string()
        .required(),

      encrypt: Joi.bool()
        .valid(false)
        .required(),
    })
  )

export async function info(this: TokenManager, args: unknown): Promise<Response> {
  const opts: InfoArgs = Joi.attempt(args, schema)
  const { uid, action, id, token, encrypt } = opts

  // form argv for #info
  const argv: InfoOpts = Object.create(null)

  // we have uid
  if (uid) {
    argv.uid = uid
  // we have encrypted secret
  } else if (token && encrypt) {
    Object.assign(argv, extractSecret(this.decrypt, token))
  // we have just a secret, so we must have id & action, too
  } else if (token) {
    argv.id = id
    argv.action = action
    argv.token = token
  // do plain extraction by id + action
  } else {
    argv.id = id
    argv.action = action
  }

  return this.backend.info(argv)
}
