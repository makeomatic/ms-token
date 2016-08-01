const Promise = require('bluebird');
const Joi = require('joi');
const crypto = require('../utils/crypto');

// actual data schema
const schema = Joi.alternatives()
  .try(
    Joi.object({
      uid: Joi.any()
        .forbidden(),

      action: Joi.string()
        .required(),

      id: Joi.string()
        .required(),

      secret: Joi.any()
        .forbidden(),

      encrypt: Joi.any()
        .forbidden(),
    }),

    Joi.object({
      uid: Joi.string()
        .required(),

      action: Joi.any()
        .forbidden(),

      id: Joi.any()
        .forbidden(),

      secret: Joi.any()
        .forbidden(),

      encrypt: Joi.any()
        .forbidden(),
    }),

    Joi.object({
      uid: Joi.any()
        .forbidden(),

      action: Joi.any()
        .forbidden(),

      id: Joi.any()
        .forbidden(),

      secret: Joi.string()
        .required(),

      encrypt: Joi.bool()
        .only(true)
        .required(),
    }),

    Joi.object({
      uid: Joi.any()
        .forbidden(),

      action: Joi.string()
        .required(),

      id: Joi.string()
        .required(),

      secret: Joi.string()
        .required(),

      encrypt: Joi.bool()
        .only(false)
        .required(),
    })
  );

module.exports = function info(args) {
  return Promise
    .try(() => Joi.attempt(args, schema))
    .then(opts => {
      const { uid, action, id, secret, encrypt } = opts;

      // form argv for #info
      const argv = {};

      // we have uid
      if (uid) {
        argv.uid = uid;
      // we have encrypted secret
      } else if (secret && encrypt) {
        Object.assign(argv, crypto.extract(this.decrypt, secret));
      // we have just a secret, so we must have id & action, too
      } else if (secret) {
        argv.id = id;
        argv.action = action;
        argv.token = secret;
      // do plain extraction by id + action
      } else {
        argv.id = id;
        argv.action = action;
      }

      return this.backend.info(argv);
    });
};
