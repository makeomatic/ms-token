const Joi = require('@hapi/joi');
const uuid = require('uuid');
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
      .min(0),

    throttle: Joi.alternatives().try(
      Joi.number()
        .integer()
        .min(0)
        .max(Joi.ref('ttl')),
      Joi.boolean()
        .valid(true)
    ),

    metadata: Joi.any(),

    legacy: Joi.boolean().default(false),

    secret: Joi.alternatives()
      .try(
        Joi.boolean(),
        Joi.object({
          type: Joi.string()
            .valid('alphabet', 'number', 'uuid')
            .required(),

          alphabet: Joi.any()
            .when('type', {
              is: 'alphabet',
              then: Joi.string().required(),
              otherwise: Joi.forbidden(),
            }),

          length: Joi.any()
            .when('type', {
              is: Joi.string().valid('alphabet', 'number'),
              then: Joi.number().integer().min(1).required(),
              otherwise: Joi.forbidden(),
            }),

          encrypt: Joi.boolean()
            .when('type', {
              is: 'uuid',
              then: Joi.any().default(true),
              otherwise: Joi.any().default(false),
            }),
        })
      )
      .default(true),

    regenerate: Joi.boolean()
      .when('secret', {
        is: false,
        then: Joi.valid(false),
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

module.exports = async function create(args) {
  const opts = Joi.attempt(args, schema);

  const { action, id, ttl, metadata, legacy } = opts;
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
    output.secret = await crypto.secret(this.encrypt, secret, { id, action, uid }, legacy);
  }

  await this.backend.create(settings, output);

  return output;
};
