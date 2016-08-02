const Promise = require('bluebird');
const Joi = require('joi');
const crypto = require('../utils/crypto');

// actual data schema
const schema = Joi.alternatives()
  .try(
    Joi.object({
      uid: Joi.forbidden(),
      action: Joi.string().required(),
      id: Joi.string().required(),
    }),

    Joi.object({
      uid: Joi.string().required(),
      action: Joi.forbidden(),
      id: Joi.forbidden(),
    })
  );

// helper function used to generate new secret
const generateSecret = encrypt => (id, action, uid, secret) =>
  crypto.secret(encrypt, secret, { id, action, uid });

module.exports = function info(args) {
  return Promise
    .try(() => Joi.attempt(args, schema))
    .then(opts => this.backend.regenerate(opts, generateSecret(this.encrypt)));
};
