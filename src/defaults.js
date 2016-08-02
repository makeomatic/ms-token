const Joi = require('joi');
const glob = require('glob');
const path = require('path');
const pkg = require('../package.json');

const backends = glob
  .sync('*', { cwd: path.join(__dirname, 'backends') })
  .map(filename => path.basename(filename, '.js'));

const schema = Joi
  .object({
    backend: {
      name: Joi.string()
        .only(backends)
        .required(),

      connection: Joi.alternatives()
        .when('name', {
          is: 'redis',
          then: Joi.lazy(() => {
            const Redis = require('ioredis');

            return Joi.alternatives()
              .try(
                Joi.object().type(Redis),
                Joi.object().type(Redis.Cluster)
              );
          }),
        })
        .required(),

      prefix: Joi.string()
        .default(`{ms-token!${pkg.version}}`),
    },

    encrypt: {

      algorithm: Joi.string()
        .required(),

      sharedSecret: Joi.binary()
        .encoding('utf8')
        .min(24)
        .required(),
    },
  })
  .requiredKeys(['', 'backend', 'encrypt']);

module.exports = opts => Joi.attempt(opts, schema);
