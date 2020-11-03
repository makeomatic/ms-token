import Joi from 'joi'
import type { RemoveOpts } from '../backends/abstract'
import { extractSecret } from '../utils/crypto'
import type { TokenManager } from '../'

// actual data schema
const schema = Joi.alternatives()
  .try(
    // action + id
    Joi.object<{ action: string, id: string, token: string, uid?: string }>({
      uid: Joi.any().strip().optional(),
      action: Joi.string().required(),
      id: Joi.string().required(),

      // in .remove() action it's optional, because
      // this should only be done by the system user and no
      // user input should get to .remove call
      token: Joi.string(),
    }),

    // uid
    Joi.object<{ uid: string, action: never, id: never, token: never }>({
      uid: Joi.string().required(),
      action: Joi.forbidden(),
      id: Joi.forbidden(),
      token: Joi.forbidden(),
    })
  )

export async function remove(this: TokenManager, args: RemoveOpts | string): Promise<{ok: 200}> {
  const opts = Joi.attempt(
    typeof args === 'string' ? extractSecret(this.decrypt, args) : args,
    schema
  )

  const { uid, action, id, token } = opts

  // form argv for #info
  const argv: RemoveOpts = Object.create(null)

  // we have uid
  if (uid) {
    argv.uid = uid
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

  return this.backend.remove(argv)
}
