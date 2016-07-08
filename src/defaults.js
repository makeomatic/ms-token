const Joi = require('joi');

const schema = Joi.object({
  backend: {
    name: Joi.string()
      .allow(['redis'])
      .required(),

    connection: Joi.alternatives()
      .when('name', {
        is: 'redis',
        then: Joi.lazy(() => {
          const Redis = require('ioredis');
          return Joi.alternatives()
            .try(
              Joi.object().type(Redis),
              Joi.object.type(Redis.Cluster)
            );
        }),
      })
      .required(),

    prefix: Joi.string(),
  },

  encrypt: {

    algorithm: Joi.string()
      .required(),

    password: Joi.binary()
      .encoding('utf8')
      .min(24)
      .required(),
  },
})
.requiredKeys(['', 'backend', 'encrypt']);

module.exports = opts => Joi.attempt(opts, schema);
