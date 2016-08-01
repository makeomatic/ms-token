const defaults = require('./defaults');
const crypto = require('./utils/crypto');

class TokenManager {
  constructor(opts) {
    const config = this.config = defaults(opts);

    // require transport
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
}

module.exports = TokenManager;
