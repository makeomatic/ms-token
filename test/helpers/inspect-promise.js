const Promise = require('bluebird');
const assert = require('assert');

function inspectPromise(mustBeFulfilled = true) {
  return function inspection(promise) {
    const isFulfilled = promise.isFulfilled();
    const isRejected = promise.isRejected();

    try {
      assert.equal(isFulfilled, mustBeFulfilled, `promise was not ${mustBeFulfilled ? 'fulfilled' : 'rejected'}`);
    } catch (e) {
      if (isFulfilled) {
        return Promise.reject(new Error(JSON.stringify(promise.value())));
      }

      throw promise.reason();
    }

    assert.equal(isRejected, !mustBeFulfilled, `promise was not ${mustBeFulfilled ? 'fulfilled' : 'rejected'}`);
    return mustBeFulfilled ? promise.value() : promise.reason();
  };
}

global.inspectPromise = inspectPromise;
