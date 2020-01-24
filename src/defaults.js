const Joi = require('@hapi/joi');
const Redis = require('ioredis');
const glob = require('glob');
const path = require('path');
const pkg = require('../package.json');

const backends = glob
  .sync('*', { cwd: path.join(__dirname, 'backends') })
  .map((filename) => path.basename(filename, '.js'));

const secret = Joi.binary()
  .encoding('utf8')
  .required();

const schema = Joi.object({
  backend: Joi.object({
    name: Joi.string()
      .valid(...backends)
      .required(),

    connection: Joi.any()
      .required()
      .when('name', {
        is: 'redis',
        then: Joi.alternatives().try(
          Joi.object().instance(Redis),
          Joi.object().instance(Redis.Cluster)
        ),
      }),

    prefix: Joi.string()
      .default(`{ms-token!${pkg.version}}`),
  }).required(),

  encrypt: Joi.object({

    algorithm: Joi.string()
      .required(),

    sharedSecret: Joi.alternatives().try(
      secret.min(32),
      Joi.object({
        legacy: secret.min(24),
        current: secret.min(32),
      })
    ).required(),
  }).required(),
}).required();

module.exports = (opts) => Joi.attempt(opts, schema);
