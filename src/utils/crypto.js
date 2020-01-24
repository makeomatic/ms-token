const crypto = require('crypto');
const base64url = require('base64-url');
const uuid = require('uuid');
const Chance = require('chance');
const is = require('is');
const assert = require('assert');
const { promisify } = require('util');

const randomBytes = promisify(crypto.randomBytes);
const chance = new Chance();
const NUMBERS = '0123456789';
const kVersion = Buffer.from('v1');
const kBytes = 16;
const kVersionL = kVersion.byteLength;
const kInputStart = kVersionL + kBytes;

/**
 * Creates (de)cipher
 * @param  {Boolean} isDecipher
 * @param  {String} algorithm
 * @param  {String} secret, shared secret
 * @return {Function}
 */
exports.createCipher = function createCipher({ algorithm, sharedSecret }) {
  let legacySecret;
  let currentSecret;

  if (Buffer.isBuffer(sharedSecret)) {
    legacySecret = sharedSecret;
    currentSecret = sharedSecret;
  } else {
    legacySecret = sharedSecret.legacy;
    currentSecret = sharedSecret.current;
  }

  function decrypt(string) {
    const input = Buffer.from(base64url.unescape(string), 'base64');

    if (kVersion.equals(input.slice(0, kVersionL))) {
      assert(input.length > kInputStart, 'nonce not present');
      const nonce = input.slice(kVersionL, kInputStart);
      const encodedData = input.slice(kInputStart);
      const cipher = crypto.createDecipheriv(algorithm, currentSecret, nonce);
      return Buffer.concat([cipher.update(encodedData), cipher.final()]).toString();
    }

    /* back-compatibility */
    const cipher = crypto.createDecipher(algorithm, legacySecret);
    return Buffer.concat([cipher.update(input), cipher.final()]).toString();
  }

  async function encrypt(string, legacy = false) {
    const buffers = [];

    if (legacy === false) {
      const nonce = await randomBytes(kBytes);
      const cipher = crypto.createCipheriv(algorithm, currentSecret, nonce);
      buffers.push(kVersion, nonce, cipher.update(Buffer.from(string)), cipher.final());
    } else {
      console.warn('[warn] consider not using legacy generation mode'); // eslint-disable-line no-console
      const cipher = crypto.createCipher(algorithm, legacySecret);
      buffers.push(cipher.update(Buffer.from(string)), cipher.final());
    }

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
 * @param  {Boolean} [legacy=false] - uses deprecated crypto.createCipher
 * @return {String}
 */
exports.secret = async function createSecret(encrypt, settings, payload, legacy = false) {
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
  return settings.encrypt
    ? encrypt(JSON.stringify({ ...payload, token }), legacy)
    : token;
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
