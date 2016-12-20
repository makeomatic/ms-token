const defaults = require('./defaults');
const crypto = require('./utils/crypto');

class TokenManager {
  constructor(opts) {
    const config = this.config = defaults(opts);

    // require transport
    // eslint-disable-next-line import/no-dynamic-require
    const Backend = require(`./backends/${config.backend.name}`);
    this.backend = new Backend(config.backend);

    // enable encryption
    Object.assign(this, crypto.createCipher(config.encrypt));
  }

  /**
   * Creates token
   * See README for description of args
   */
  create = require('./actions/create');

  /**
   * System action to return associated data with action by any of the
   * supported handlers
   * See README for description of args
   */
  info = require('./actions/info');

  /**
   * Completes challenge by verifying token, optionally removing notion of it
   * See README for description of args
   */
  verify = require('./actions/verify');

  /**
   * Invoke this method to receive new secret and overwrite old one
   * Requires `regenerate` to be previously set to `true` during #create()
   * Only operates when `secret` was not explicitely set to `false` rendering
   * this function useless
   *
   * See README for more details
   */
  regenerate = require('./actions/regenerate');

  /**
   * Invoke this method to erase token & associated data from the system
   * prematurely. It will throw "404" if input does not exist in the system
   *
   * See README for more details
   */
  remove = require('./actions/remove');
}

module.exports = TokenManager;
