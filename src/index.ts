import { defaults, PartialConfiguration, Configuration } from './defaults'
import { createCipher, Encrypt, Decrypt } from './utils/crypto'
import { Backend } from './backends/abstract'
import { create } from './actions/create'
import { info } from './actions/info'
import { verify } from './actions/verify'
import { regenerate } from './actions/regenerate'
import { remove } from './actions/remove'

export class TokenManager {
  readonly config: Configuration;
  readonly backend: Backend;
  readonly encrypt: Encrypt;
  readonly decrypt: Decrypt;

  /**
  * Creates token
  * See README for description of args
  */
  public create: typeof create

  /**
  * System action to return associated data with action by any of the
  * supported handlers
  * See README for description of args
  */
  public info: typeof info

  /**
  * Completes challenge by verifying token, optionally removing notion of it
  * See README for description of args
  */
  public verify: typeof verify

  /**
  * Invoke this method to receive new secret and overwrite old one
  * Requires `regenerate` to be previously set to `true` during #create()
  * Only operates when `secret` was not explicitely set to `false` rendering
  * this function useless
  *
  * See README for more details
  */
  public regenerate: typeof regenerate

  /**
  * Invoke this method to erase token & associated data from the system
  * prematurely. It will throw "404" if input does not exist in the system
  *
  * See README for more details
  */
  public remove: typeof remove

  /**
   * Create instance of token manager
   * @param opts - configuration options
   */
  constructor(opts: PartialConfiguration) {
    const config = this.config = defaults(opts)

    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const Backend = require(`./backends/${config.backend.name}`).default
    this.backend = new Backend(config.backend)

    // assign cipher helpers
    const cipher = createCipher(config.encrypt)
    this.encrypt = cipher.encrypt
    this.decrypt = cipher.decrypt

    // assign actions
    this.create = create
    this.info = info
    this.verify = verify
    this.regenerate = regenerate
    this.remove = remove
  }
}

export default TokenManager
