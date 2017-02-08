const Promise = require('bluebird');
const Joi = require('joi');
const is = require('is');
const crypto = require('../utils/crypto');
const assert = require('assert');

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
 * Enriches error and includes args into it
 * @param  {Error} e
 */
function enrichError(e) {
  e.args = this;
  throw e;
}

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
 * Asserts that each prop is equal to the control one
 * @param  {Any} value
 * @param  {String} prop
 * @return {Void}
 */
function assertEqual(prop) {
  const { args, control } = this;
  const value = args[prop];
  const check = control[prop];
  assert.equal(check, value, `Sanity check failed for "${prop}" failed: "${check}" vs "${value}"`);
}

/**
 * Makes sure that any opts.control options are equal
 * to decoded values in args
 * @param  {Object} args
 * @param  {Object} opts
 * @return {Object}
 */
function assertControlOptions({ args, opts }) {
  const control = opts.control;
  const keys = Object.keys(control);
  keys.forEach(assertEqual, { args, control });
}

/**
 * Verifies passed params via backend
 * @param  {Object} args
 * @param  {Object} opts
 * @return {Promise}
 */
function verifyViaBackend({ args, opts }) {
  return this
    .verify(args, opts)
    .bind(args)
    .catch(enrichError);
}

/**
 * Creates verification process
 * @param  {Object|String} _args
 * @param  {Object} [_opts={}]
 * @return {Promise}
 */
module.exports = function create(_args, _opts = {}) {
  return Promise
    .resolve([this.decrypt, _args, _opts])
    .spread(parseInput)
    .tap(assertControlOptions)
    .bind(this.backend)
    .then(verifyViaBackend);
};
