var async = require('async');
var utils = require('./utils');

module.exports = ObserverMixin;

/**
 * ObserverMixin class.  Use to add observe/notifyObserversOf APIs to other
 * classes.
 *
 * @class ObserverMixin
 */
function ObserverMixin() {
}

/**
 * Register an asynchronous observer for the given operation (event).
 * @param {String} operation The operation name.
 * @callback {function} listener The listener function. It will be invoked with
 * `this` set to the model constructor, e.g. `User`.
 * @param {Object} context Operation-specific context.
 * @param {function(Error=)} next The callback to call when the observer
 *   has finished.
 * @end
 */
ObserverMixin.observe = function(operation, listener) {
  this._observers = this._observers || {};
  if (!this._observers[operation]) {
    this._observers[operation] = [];
  }

  this._observers[operation].push(listener);
};

/**
 * Unregister an asynchronous observer for the given operation (event).
 * @param {String} operation The operation name.
 * @callback {function} listener The listener function.
 * @end
 */
ObserverMixin.removeObserver = function(operation, listener) {
  if (!(this._observers && this._observers[operation])) return;

  var index = this._observers[operation].indexOf(listener);
  if (index !== -1) {
    return this._observers[operation].splice(index, 1);
  }
};

/**
 * Unregister all asynchronous observers for the given operation (event).
 * @param {String} operation The operation name.
 * @end
 */
ObserverMixin.clearObservers = function(operation) {
  if (!(this._observers && this._observers[operation])) return;

  this._observers[operation].length = 0;
};

/**
 * Invoke all async observers for the given operation.
 * @param {String} operation The operation name.
 * @param {Object} context Operation-specific context.
 * @param {function(Error=)} callback The callback to call when all observers
 *   has finished.
 */
ObserverMixin.notifyObserversOf = function(operation, context, callback) {
  var observers = this._observers && this._observers[operation];

  if (!callback) callback = utils.createPromiseCallback();

  this._notifyBaseObservers(operation, context, function doNotify(err) {
    if (err) return callback(err, context);
    if (!observers || !observers.length) return callback(null, context);

    async.eachSeries(
      observers,
      function notifySingleObserver(fn, next) {
        var retval = fn(context, next);
        if (retval && typeof retval.then === 'function') {
          retval.then(
            function() { next(); },
            next // error handler
          );
        }
      },
      function(err) { callback(err, context) }
    );
  });
  return callback.promise;
};

ObserverMixin._notifyBaseObservers = function(operation, context, callback) {
  if (this.base && this.base.notifyObserversOf)
    this.base.notifyObserversOf(operation, context, callback);
  else
    callback();
};

/**
 * Run the given function with before/after observers. It's done in three serial
 * steps asynchronously:
 *
 * - Notify the registered observers under 'before ' + operation
 * - Execute the function
 * - Notify the registered observers under 'after ' + operation
 *
 * If an error happens, it fails fast and calls the callback with err.
 *
 * @param {String} operation The operation name
 * @param {Context} context The context object
 * @param {Function} fn The task to be invoked as fn(done) or fn(context, done)
 * @param {Function} callback The callback function
 * @returns {*}
 */
ObserverMixin.notifyObserversAround = function(operation, context, fn, callback) {
  var self = this;
  return self.notifyObserversOf('before ' + operation, context,
    function(err, context) {
      if (err) return callback(err, context);

      function cbForWork(err) {
        if (err) return callback(err, context);
        var returnedArgs = [].slice.call(arguments, 1);
        context.results = returnedArgs;
        self.notifyObserversOf('after ' + operation, context,
          function(err, context) {
            if (err) return callback(err, context);
            var results = returnedArgs;
            if (context) {
              results = context.results;
            }
            var args = [err].concat(results);
            callback.apply(null, args);
          });
      }

      if (fn.length === 1) {
        // fn(done)
        fn(cbForWork);
      } else {
        // fn(context, done)
        fn(context, cbForWork);
      }
    });
};
