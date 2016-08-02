const Promise = require('bluebird');
const Joi = require('joi');
const uuid = require('node-uuid');
const crypto = require('../utils/crypto');

// actual data schema
const schema = Joi
  .object({
    // type of action to perform
    action: Joi.string()
      .required(),

    // locking id
    id: Joi.string()
      .required(),

    ttl: Joi.number()
      .integer()
      .min(1),

    throttle: Joi.alternatives().try(
      Joi.number()
        .integer()
        .min(1)
        .max(Joi.ref('ttl')),
      Joi.boolean()
        .only(true)
    ),

    metadata: Joi.any(),

    secret: Joi.alternatives()
      .try(
        Joi.boolean(),
        Joi.object({
          type: Joi.string()
            .only(['alphabet', 'number', 'uuid'])
            .required(),

          alphabet: Joi.alternatives()
            .when('type', {
              is: 'alphabet',
              then: Joi.string().required(),
              otherwise: Joi.forbidden(),
            }),

          length: Joi.alternatives()
            .when('type', {
              is: Joi.string().only(['alphabet', 'number']),
              then: Joi.number().integer().min(1).required(),
              otherwise: Joi.forbidden(),
            }),

          encrypt: Joi.boolean()
            .when('type', {
              is: 'uuid',
              then: Joi.default(true),
              otherwise: Joi.default(false),
            }),
        })
      )
      .default(true),

    regenerate: Joi.boolean()
      .when('secret', {
        is: false,
        then: Joi.only(false),
        otherwise: Joi.optional(),
      }),
  })
  .with('throttle', 'ttl')
  .required();

function getThrottle(_throttle, ttl) {
  // define throttle
  let throttle = _throttle || false;
  if (throttle === true) {
    throttle = ttl;
  }

  return throttle;
}

function getSecret(_secret) {
  let secret = _secret || false;
  if (!secret) {
    return secret;
  }

  if (secret === true) {
    secret = { type: 'uuid', encrypt: true };
  }

  return secret;
}

module.exports = function create(args) {
  return Promise
    .try(() => Joi.attempt(args, schema))
    .then(opts => {
      const { action, id, ttl, metadata } = opts;
      const throttle = getThrottle(opts.throttle, ttl);
      const uid = opts.regenerate ? uuid.v4() : false;
      const secret = getSecret(opts.secret);

      const settings = {
        id,
        action,
        ttl,
        throttle,
        created: Date.now(),
      };

      const output = {
        id,
        action,
      };

      if (uid) {
        settings.uid = uid;
        output.uid = uid;
      }

      if (metadata) {
        settings.metadata = metadata;
      }

      if (secret) {
        settings.secret = secret;
        output.secret = crypto.secret(this.encrypt, secret, { id, action, uid });
      }

      return this.backend
        .create(settings, output)
        .return(output);
    });
};
