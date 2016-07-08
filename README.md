# Token Orchestrator

There is a common task that requires one to request challenges to be performed for a specific action. Imagine user, who wants to register
for you service and you need to validate an email, or you want to issue an invitation and remove the burden of activation from a user, as well as
supply extra meta information with that token. Furthermore, you often need to throttle specific requests and make sure they are not performed more
than once in a certain time span. All of these tasks are easily handled by this module

## Install me

`npm i ms-token -S`

## API

Module API is pretty simple and contains only 4 functions alongside initialization.
When reading docs, keep in mind that anything in `[]` is an optional prop.

### `new TokenManager(args)`

* `args.backend`:
  * `name`: supported backends include: `redis`
  * `connection`: appropriate connector, `ioredis` instance for `redis`
  * `prefix`: optional, used in `redis` backend as key prefix
* `args.encrypt`, used in `crypto.createCipher(algorithm, password)` when encoding long tokens:
  * `algorithm`: one of `openssl list-cipher-algorithms`, example: `aes192`
  * `password`: The password is used to derive the cipher key and initialization vector (IV).
  The value must be either a 'binary' encoded string or a Buffer.


```js
const TokenManager = require('ms-token');
const Redis = require('ioredis');
const tokenManager = new TokenManager({
  backend: {
    name: 'redis',
    connection: new Redis(),
    prefix: 'ms-token:',
  },
  encrypt: {
    algorithm: 'aes256',
    password: Buffer.from('incredibly-long-secret'),
  },
});
```

### `tokenManager.create(args)`

Use this to create challenge token, which should be sent to user for verification purposes.

Accepts:

* `args.action`: unique action name, non-empty string
* `args.id`: unique request identification. For instance, if you are going to send this to an email, use `email` as id. If this is going to be a
token sent to the phone - use normalized phone number. Combination of `action` & `id` grants access to `secret`, while `secret` grants access to all associated
metadata
* `[args.ttl]`: token expiration, in `seconds`
* `[args.throttle]`:
  * `true`: would be equal to `args.ttl`, in that case `ttl` must be defined
  * `Number`: do not allow creating token for `args.{action,id}` combo for `Number` amount of `seconds`. Sometimes you want throttle to be small (60 seconds),
  and ttl to be 15 mins (text messages), or 2 hours and 24 hours (emails)
* `[args.metadata]`: Mixed content, must be able to `JSON.stringify` it
* `[args.secret]`:
  * `true`, default. in that case secret would be automatically generated and would include encrypted public data + generated secret
  * `false`, do not generate secret. In that case it would simply use `action + id` for verification/unlocking
  * `Object`:
    * `type`: enumerable, acceptable values are: `alphabet`, `number`, `uuid` (default `uuid`)
    * `[alphabet]`: string containing characters that are allowed to be used in the secret. Only used in `alphabet` mode
    * `[length]`: length of generated secret, only used in `alphabet` and `number` mode
    * `[encrypt]`: defaults to `true` for `uuid`. If `true` - then returned token includes `action`, `id` & generated `secret` encrypted in it. That token alone is enough for verification function. If `false` - it returns plain text generated secret, you must pass `action`, `id` and `secret` to verification function in order for it to succeed
* `[args.regenerate]`: defauls to `false`. If set to `true` would allow usage of `.regenerate()` API by returning `uid` of this challenge

Returns `Object`:

* `id`: id from `args`
* `action`: action from `args`
* `[uid]`: token unique identificator, when `regenerate` is true
* `[secret]`: send secret to user for completing challenge (for instance via SMS). Secret is not present if was set to false

### `tokenManager.regenerate(uid)`

Works with both `uid` OR `action`& `id` combo. Sometimes challenge token might not reach the user and the user would want to ask
for another challenge token. Idea of this is to accept public challenge `uid`, which would use previous data passed in `.create(args)`
and generate new secret based on this. Can only be used when `regenerate` was set to `true` on the `.create(args)` action

Input:

* `uid` - uid from `.create(args)`, when `regenerate` was set to `true`

Response:

* `String`: newly generated secret, either plain-text or encrypted based on what was passed earlier in `.create(args)`

### `tokenManager.verify(args, [opts])`

Used for completing challenge by verifying user input.

Accepts:

* `args` as `String`, we would attempt to decode & verify in according with encryption settings
* `args` as `Object`:
  * `args.uid` - either `uid` OR `action` & `id` combination
  * `args.action` - action from `.create()`
  * `args.id` - id from `.create()`
  * `[args.secret]` - secret from `.crete()` return value
* `[opts]` as `Object`:
  * `opts.erase`: if `true`, when verification succeeds - associated `throttle` is removed, as well as any notion of this token
  * `opts.log`: if `true`, logs attempt time.

Response, always `Object` in case of successful verification:

* `metadata`: JSON.parse() from what was passed to `.metadata` on creation
* `token`, original creation data:
  * `token.id`
  * `token.action`
  * `token.ttl`
  * `token.created`
  * `token.throttle`

Otherwise rejects promise with an error

### `tokenManager.remove(args)`

* `args` as `String`, we would attempt to decode & verify in according with encryption settings
* `args` as `Object`:
  * `args.uid` - either `uid` OR `action` & `id` combination
  * `args.action` - action from `.create()`
  * `args.id` - id from `.create()`
