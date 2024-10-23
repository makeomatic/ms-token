import Joi from 'joi'
import assert from 'assert'
import { Decrypt, extractSecret } from '../utils/crypto'
import { Response, VerifyOpts, VerifySettings } from '../backends/abstract'
import type { TokenManager } from '..'

// verify should be used to ensure secret values
// otherwise use #info() to semantically say that it doesn't give
// any guarantees of request authenticity
const schema = Joi.object<VerifyOpts & { uid?: never }>({
  id: Joi.string().required(),
  action: Joi.string().required(),
  token: Joi.string().required(),
  // if uid is in the token - strip it!
  uid: Joi.any().optional().strip(),
})

// because we have defaults
const optsSchema = Joi.object<Required<VerifySettings>>({
  // on success will remove this token to prevent future usage
  erase: Joi.boolean()
    .default(true),

  // this option is currently not supported
  log: Joi.boolean()
    .default(false),

  // this is to control input from _args
  // so that people will not use secret used for another action / id
  control: Joi
    .object<VerifySettings['control']>({
      id: Joi.string(),
      action: Joi.string(),
    })
    .default({}),
})

/**
 * Parses potentially encrypted input options and validates input
 * @param decrypt - decrypt helper
 * @param _args - arguments type
 * @param _opts - opts type
 */
function parseInput(decrypt: Decrypt, _args: VerifyOpts | string, _opts: VerifySettings): { args: VerifyOpts, opts: Required<VerifySettings> } {
  return {
    // convert string token to opts
    args: Joi.attempt(
      // if _args is string, it implies this is an encrypted secret
      typeof _args === 'string' ? extractSecret(decrypt, _args) : _args,
      schema
    ),

    // form default opts
    opts: Joi.attempt(_opts, optsSchema),
  }
}

/**
 * Makes sure that any opts.control options are equal
 * to decoded values in args
 * @param  args - token
 * @param  opts -
 */
function assertControlOptions(args: any, opts: Required<VerifySettings>): void {
  for (const [prop, check] of Object.entries(opts.control)) {
    const value = args[prop]
    assert.strictEqual(check, value, `Sanity check failed for "${prop}" failed: "${check}" vs "${value}"`)
  }
}

/**
 * Performs token verification
 * @param _args - arguments to verify
 * @param _opts - verification settings
 */
export async function verify(this: TokenManager, _args: VerifyOpts | string, _opts: VerifySettings = Object.create(null)): Promise<Response> {
  const { args, opts } = parseInput(this.decrypt, _args, _opts)
  assertControlOptions(args, opts)
  try {
    return await this.backend.verify(args, opts)
  } catch (e: any) {
    e.args = args
    throw e
  }
}
