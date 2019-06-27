const Joi = require('@hapi/joi');
const crypto = require('../utils/crypto');

// actual data schema
const schema = Joi.alternatives()
  .try(
    Joi.object({
      uid: Joi.forbidden(),

      action: Joi.string()
        .required(),

      id: Joi.string()
        .required(),

      token: Joi.forbidden(),

      encrypt: Joi.forbidden(),
    }),

    Joi.object({
      uid: Joi.string()
        .required(),

      action: Joi.forbidden(),

      id: Joi.forbidden(),

      token: Joi.forbidden(),

      encrypt: Joi.forbidden(),
    }),

    Joi.object({
      uid: Joi.forbidden(),

      action: Joi.forbidden(),

      id: Joi.forbidden(),

      token: Joi.string()
        .required(),

      encrypt: Joi.bool()
        .only(true)
        .required(),
    }),

    Joi.object({
      uid: Joi.forbidden(),

      action: Joi.string()
        .required(),

      id: Joi.string()
        .required(),

      token: Joi.string()
        .required(),

      encrypt: Joi.bool()
        .only(false)
        .required(),
    })
  );

module.exports = async function info(args) {
  const opts = Joi.attempt(args, schema);
  const { uid, action, id, token, encrypt } = opts;

  // form argv for #info
  const argv = Object.create(null);

  // we have uid
  if (uid) {
    argv.uid = uid;
  // we have encrypted secret
  } else if (token && encrypt) {
    Object.assign(argv, crypto.extract(this.decrypt, token));
  // we have just a secret, so we must have id & action, too
  } else if (token) {
    argv.id = id;
    argv.action = action;
    argv.token = token;
  // do plain extraction by id + action
  } else {
    argv.id = id;
    argv.action = action;
  }

  return this.backend.info(argv);
};
