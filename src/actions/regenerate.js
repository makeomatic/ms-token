const Joi = require('@hapi/joi');
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
const generateSecret = (encrypt) => async (id, action, uid, secret) => (
  crypto.secret(encrypt, secret, { id, action, uid })
);

module.exports = async function info(args) {
  const opts = Joi.attempt(args, schema);
  return this.backend.regenerate(opts, generateSecret(this.encrypt));
};
