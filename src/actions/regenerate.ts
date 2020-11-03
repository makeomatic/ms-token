import Joi from 'joi'
import { createSecret, Encrypt, SecretSettings } from '../utils/crypto'
import type { TokenManager } from '..'

export type UidArgs = {
  uid: string;
}

export type ActionArgs = {
  action: string;
  id: string;
}

export type RegenerateArgs = UidArgs | ActionArgs;

// actual data schema
const schema = Joi.alternatives()
  .try(
    Joi.object<ActionArgs & { uid: never }>({
      uid: Joi.forbidden(),
      action: Joi.string().required(),
      id: Joi.string().required(),
    }),

    Joi.object<UidArgs & { action: never, id: never }>({
      uid: Joi.string().required(),
      action: Joi.forbidden(),
      id: Joi.forbidden(),
    })
  )

// helper function used to generate new secret
const generateSecret = (encrypt: Encrypt) => async (id: string, action: string, uid: string, secret: SecretSettings): Promise<string> => (
  createSecret(encrypt, secret, { id, action, uid })
)

export async function regenerate(this: TokenManager, args: RegenerateArgs): Promise<string> {
  const opts: RegenerateArgs = Joi.attempt(args, schema)
  return this.backend.regenerate(opts, generateSecret(this.encrypt))
}
