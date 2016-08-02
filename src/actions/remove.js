const Promise = require('bluebird');
const Joi = require('joi');
const is = require('is');
const crypto = require('../utils/crypto');

// actual data schema
const schema = Joi.alternatives()
  .try(
    // possibly encrypted secret
    Joi.string(),

    // action + id
    Joi.object({
      uid: Joi.forbidden(),
      action: Joi.string().required(),
      id: Joi.string().required(),
    }),

    // uid
    Joi.object({
      uid: Joi.string().required(),
      action: Joi.forbidden(),
      id: Joi.forbidden(),
    })
  );

module.exports = function info(args) {
  return Promise
    .try(() => Joi.attempt(args, schema))
    .then(_opts => {
      const opts = is.string(_opts) ? crypto.extract(this.decrypt, _opts) : _opts;
      const { uid, action, id, token } = opts;

      // form argv for #info
      const argv = {};

      // we have uid
      if (uid) {
        argv.uid = uid;
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

      return this.backend.remove(argv);
    });
};
