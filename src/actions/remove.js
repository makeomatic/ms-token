const Promise = require('bluebird');
const Joi = require('joi');
const is = require('is');
const crypto = require('../utils/crypto');

// actual data schema
const schema = Joi.alternatives()
  .try(
    // action + id
    Joi.object({
      uid: Joi.any().strip().optional(),
      action: Joi.string().required(),
      id: Joi.string().required(),

      // in .remove() action it's optional, because
      // this should only be done by the system user and no
      // user input should get to .remove call
      token: Joi.string(),
    }),

    // uid
    Joi.object({
      uid: Joi.string().required(),
      action: Joi.forbidden(),
      id: Joi.forbidden(),
      token: Joi.forbidden(),
    })
  );

module.exports = function info(args) {
  return Promise
    .try(() => Joi.attempt(
      is.string(args) ? crypto.extract(this.decrypt, args) : args,
      schema
    ))
    .then((opts) => {
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
