#!/usr/bin/env node

/* eslint-disable no-console */

// decodes input token
const assert = require('assert')
const { createCipher } = require('../lib/utils/crypto')

//
// Logic
//
const [,, token, algorithm, sharedSecret] = process.argv

assert.ok(token, 'pass token as first arg')
assert.ok(algorithm, 'pass algo as second arg')
assert.ok(sharedSecret, 'pass shared secret as third arg')

const { decrypt } = createCipher({ algorithm, sharedSecret })

// decrypted
const decrypted = decrypt(token)

console.info('\ndecrypted: \n', decrypted, '\n')

const parsed = JSON.parse(decrypted)

console.info('\nparsed JSON: \n', parsed, '\n')

process.exit(0)
