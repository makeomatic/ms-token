import {
  randomBytes as rb,
  BinaryLike,
  CipherCCMTypes,
  CipherGCMTypes,
  createDecipheriv,
  createCipheriv,
  createDecipher as cryptoCreateDecipher,
  createCipher as cryptoCreateCipher
} from 'crypto'
import base64url = require('base64-url')
import { v4 as uuidv4 } from 'uuid'
import Chance = require('chance')
import assert = require('assert')
import { promisify } from 'util'

const randomBytes = promisify(rb)
const chance = new Chance()
const NUMBERS = '0123456789'
const kVersion = Buffer.from('v1')
const kBytes = 16
const kVersionL = kVersion.byteLength
const kInputStart = kVersionL + kBytes

export type CipherSettings = {
  algorithm: CipherCCMTypes | CipherGCMTypes;
  sharedSecret: Buffer | {
    legacy: Buffer;
    current: Buffer;
  };
}

export type Encrypt = {
  (string: string, legacy?: boolean): Promise<string>
}

export type Decrypt = {
  (string: string): string;
}

/**
 * Creates (de)cipher
 */
export function createCipher({ algorithm, sharedSecret }: CipherSettings): { encrypt: Encrypt, decrypt: Decrypt } {
  let legacySecret: BinaryLike
  let currentSecret: BinaryLike

  if (Buffer.isBuffer(sharedSecret)) {
    legacySecret = sharedSecret
    currentSecret = sharedSecret
  } else {
    legacySecret = sharedSecret.legacy
    currentSecret = sharedSecret.current
  }

  function decrypt(string: string): string {
    const input = Buffer.from(base64url.unescape(string), 'base64')

    if (kVersion.equals(input.slice(0, kVersionL))) {
      assert(input.length > kInputStart, 'nonce not present')
      const nonce = input.slice(kVersionL, kInputStart)
      const encodedData = input.slice(kInputStart)
      const cipher = createDecipheriv(algorithm, currentSecret, nonce)
      return Buffer.concat([cipher.update(encodedData), cipher.final()]).toString()
    }

    /* back-compatibility */
    const cipher = cryptoCreateDecipher(algorithm, legacySecret)
    return Buffer.concat([cipher.update(input), cipher.final()]).toString()
  }

  async function encrypt(string: string, legacy = false): Promise<string> {
    const buffers = []

    if (legacy === false) {
      const nonce = await randomBytes(kBytes)
      const cipher = createCipheriv(algorithm, currentSecret, nonce)
      buffers.push(kVersion, nonce, cipher.update(Buffer.from(string)), cipher.final())
    } else {
      console.warn('[warn] consider not using legacy generation mode') // eslint-disable-line no-console
      const cipher = cryptoCreateCipher(algorithm, legacySecret)
      buffers.push(cipher.update(Buffer.from(string)), cipher.final())
    }

    const input = Buffer.concat(buffers).toString('base64')
    return base64url.escape(input)
  }

  return { decrypt, encrypt }
}

/**
 * type: enumerable, acceptable values are: alphabet, number, uuid (default uuid)
 *
 * [alphabet]: string containing characters that are allowed to be used in the secret.
 *  Only used in alphabet mode
 *
 * [length]: length of generated secret, only used in alphabet and number mode
 *
 * [encrypt]: defaults to true for uuid. If true - then returned token includes action,
 *  id & generated secret encrypted in it. That token alone is enough for verification
 *  function. If false - it returns plain text generated secret, you must pass action,
 *  id and secret to verification function in order for it to succeed
 */
export type SecretSettings = ({
  type: 'uuid';
} | {
  type: 'alphabet';
  alphabet: string;
  length: number;
} | {
  type: 'number';
  length: number;
}) & {
  token?: string;
  encrypt?: boolean;
};

/**
 * Creates token that is supposed to be sent to a person as a challenge
 * @param  encrypt - if settings.encrypt is `true`, must be present
 * @param  settings
 * @param  payload
 * @param  [legacy=false] - uses deprecated crypto.createCipher
 * @return {String}
 */
export async function createSecret(encrypt: Encrypt | undefined, settings: SecretSettings, payload: Record<any, unknown>, legacy = false): Promise<string> {
  let token: string
  switch (settings.type) {
    case 'uuid': {
      token = uuidv4()
      break
    }

    case 'alphabet': {
      const { alphabet: pool, length } = settings
      token = chance.string({ pool, length })
      break
    }

    case 'number': {
      const { length } = settings
      token = chance.string({ pool: NUMBERS, length })
      break
    }

    default:
      throw new Error('unsupported secret type')
  }

  // original object is mutated
  settings.token = token

  // return encrypted payload + token or plain token
  if (settings.encrypt) {
    assert(encrypt, 'encrypt function must be defined')
    return encrypt(JSON.stringify({ ...payload, token }), legacy)
  }

  return token
}

/**
 * Decrypts possible secret
 * @param  {Function} decrypt - decryption functioned created earlier
 * @param  {String} input - possibly encrypted string
 * @return {Object} if parse succeeds - returns object or throws error
 */
export function extractSecret<T extends Record<any, unknown> & { token: string }>(decrypt: Decrypt, input: string): T {
  let payload: T
  try {
    payload = JSON.parse(decrypt(input))
  } catch (e) {
    throw new Error('invalid token')
  }

  // so that we don't get truncated encrypted payload that resolved to empty token
  // and is able to verify challenge via action + id only
  assert(payload.token && typeof payload.token === 'string', 'token must be a truthy string')

  return payload
}
