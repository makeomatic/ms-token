const defaults = require('./defaults');

class TokenManager {
  constructor(opts) {
    this.config = defaults(opts);
  }
}

module.exports = TokenManager;
