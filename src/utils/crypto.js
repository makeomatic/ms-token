const crypto = require('crypto');
const base64url = require('base64-url');
const uuid = require('uuid');
const Chance = require('chance');
const is = require('is');

const chance = new Chance();
const NUMBERS = '0123456789';

/**
 * Creates (de)cipher
 * @param  {Boolean} isDecipher
 * @param  {String} algorithm
 * @param  {String} secret, shared secret
 * @return {Function}
 */
exports.createCipher = function createCipher({ algorithm, sharedSecret }) {
  function decrypt(string) {
    const input = Buffer.from(base64url.unescape(string), 'base64');
    const cipher = crypto.createDecipher(algorithm, sharedSecret);
    return Buffer.concat([cipher.update(input), cipher.final()]).toString();
  }

  function encrypt(string) {
    const cipher = crypto.createCipher(algorithm, sharedSecret);
    const buffers = [cipher.update(Buffer.from(string)), cipher.final()];
    const input = Buffer.concat(buffers).toString('base64');
    return base64url.escape(input);
  }

  return { decrypt, encrypt };
};

/**
 * Creates token that is supposed to be sent to a person as a challenge
 * @param  {Function} [encrypt] - if settings.encrypt is `true`, must be present
 * @param  {Object} settings
 * @param  {Object} payload
 * @return {String}
 */
exports.secret = function createSecret(encrypt, settings, payload) {
  let token;

  switch (settings.type) {
    case 'uuid': {
      token = uuid.v4();
      break;
    }

    case 'alphabet': {
      const { alphabet: pool, length } = settings;
      token = chance.string({ pool, length });
      break;
    }

    case 'number': {
      const { length } = settings;
      token = chance.string({ pool: NUMBERS, length });
      break;
    }

    default:
      throw new Error('unsupported secret type');
  }

  // original object is mutated
  settings.token = token;

  // return encrypted payload + token or plain token
  return settings.encrypt ? encrypt(JSON.stringify({ ...payload, token })) : token;
};

/**
 * Decrypts possible secret
 * @param  {Function} decrypt - decryption functioned created earlier
 * @param  {String} input - possibly encrypted string
 * @return {Object} if parse succeeds - returns object or throws error
 */
exports.extract = function extractSecret(decrypt, input) {
  let payload;
  try {
    payload = JSON.parse(decrypt(input));
  } catch (e) {
    throw new Error('invalid token');
  }

  // so that we don't get truncated encrypted payload that resolved to empty token
  // and is able to verify challenge via action + id only
  if (!is.string(payload.token) || !payload.token) {
    throw new Error('token must be a truthy string');
  }

  return payload;
};
