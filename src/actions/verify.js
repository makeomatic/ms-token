const Joi = require('@hapi/joi');
const is = require('is');
const assert = require('assert');
const crypto = require('../utils/crypto');

// verify should be used to ensure secret values
// otherwise use #info() to semantically say that it doesn't give
// any guarantees of request authenticity
const schema = Joi.object({
  id: Joi.string().required(),
  action: Joi.string().required(),
  token: Joi.string().required(),
  // if uid is in the token - strip it!
  uid: Joi.any().optional().strip(),
});

const optsSchema = Joi.object({
  // on success will remove this token to prevent future usage
  erase: Joi.boolean()
    .default(true),

  // this option is currently not supported
  log: Joi.boolean()
    .default(false),

  // this is to control input from _args
  // so that people will not use secret used for another action / id
  control: Joi
    .object({
      id: Joi.string(),
      action: Joi.string(),
    })
    .default({}),
});

/**
 * Parses input options
 * @param  {Function}
 * @param  {Object|String}
 * @param  {Object}
 * @return {Object}
 */
function parseInput(decrypt, _args, _opts) {
  return {
    // convert string token to opts
    args: Joi.attempt(
      // if _args is string, it implies this is an encrypted secret
      is.string(_args) ? crypto.extract(decrypt, _args) : _args,
      schema
    ),

    // form default opts
    opts: Joi.attempt(_opts, optsSchema),
  };
}

/**
 * Makes sure that any opts.control options are equal
 * to decoded values in args
 * @param  {Object} args
 * @param  {Object} opts
 * @return {Object}
 */
function assertControlOptions(args, opts) {
  for (const [prop, check] of Object.entries(opts.control)) {
    const value = args[prop];
    assert.equal(check, value, `Sanity check failed for "${prop}" failed: "${check}" vs "${value}"`);
  }
}

/**
 * Creates verification process
 * @param  {Object|String} _args
 * @param  {Object} [_opts={}]
 * @return {Promise}
 */
module.exports = async function verify(_args, _opts = {}) {
  const { args, opts } = parseInput(this.decrypt, _args, _opts);
  assertControlOptions(args, opts);
  try {
    return await this.backend.verify(args, opts);
  } catch (e) {
    e.args = args;
    throw e;
  }
};
