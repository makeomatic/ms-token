import Joi = require('joi');
import type { CipherSettings } from './utils/crypto'
import Redis, { Redis as RedisInstance, Cluster } from 'ioredis'
import { sync as readPkg } from 'read-pkg'
import glob = require('glob');
import path = require('path');

// only match directories
const backends = glob
  .sync('*/', { cwd: path.join(__dirname, 'backends') })
  .map((filename) => path.basename(filename))

const secret = Joi.binary()
  .encoding('utf8')
  .required()

const { version } = readPkg({ cwd: path.resolve(__dirname, '../' )})

export interface Configuration {
  backend: {
    name: 'redis';
    connection: RedisInstance | Cluster;
    prefix: string;
  }
  encrypt: CipherSettings
}

/**
 * Configuration schema for ms-token
 */
export interface PartialConfiguration {
  /**
   * One of available backends, currently only `redis`
   */
  backend: {
    /**
         * Name of the backend
         */
    name: 'redis';

    /**
     * Client that initiates backend adapter
     * Depends on name, currently only Redis or Cluster is supported
     */
    connection: RedisInstance | Cluster;

    /**
     * Prefix for storing data in the backend
     */
    prefix?: string;
  }

  /**
   * Encryption settings
   */
  encrypt: {
    algorithm: string;
    sharedSecret: string | Buffer | {
      legacy: string | Buffer;
      current: string | Buffer;
    };
  }
}

const schema = Joi.object<Configuration>({
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
          Joi.object().instance(Cluster)
        ),
      }),

    prefix: Joi.string()
      .default(`{ms-token!${version}}`),
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
}).required()

export const defaults = (opts: unknown): Configuration => Joi.attempt(opts, schema)
