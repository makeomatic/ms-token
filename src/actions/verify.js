const Promise = require('bluebird');
const Joi = require('joi');
const is = require('is');
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
});

module.exports = function create(_args, _opts = {}) {
  return Promise
    .try(() => ({
      args: Joi.attempt(
        // if _args is string, it implies this is an encrypted secret
        is.string(_args) ? crypto.extract(this.decrypt, _args) : _args,
        schema
      ),
      opts: Joi.attempt(_opts, optsSchema),
    }))
    .then(({ args, opts }) => this.backend.verify(args, opts));
};
