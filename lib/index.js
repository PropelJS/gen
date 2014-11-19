'use strict';

var slice = require('sliced');
var Promise = require('bluebird');// jshint ignore:line
var co = Promise.coroutine;
var delay = Promise.delay;
var _ctx = null;
var thunkify = require('thunkify');
co.addYieldHandler(yieldHandler);

function bind(func, receiver){
  return function(){
    return func.apply(receiver, arguments);
  };
}

function resume(func, ctx){
  return thunkify.call(ctx || thunkify, func);
}

function genToGenFunc(gen){
  var genHandler = function * genHandler(){
    var data = yield * gen;
    return data;
  };
  return genHandler;
}

function resumeRaw(func, ctx){
  return Promise.promisify(function(cb){
    var args = slice(arguments);
    args[args.length - 1] = function(){
      var data = slice(arguments);
      cb(null, data);
    };

    func.apply(ctx || _ctx, args);
  });
}

function yieldHandler(value) {
  // this is here so we don't have to call it at the front of each check if value is falsey
  if (!value) {
    return Promise.resolve(value);
  }

  if (typeof value.then === 'function') {
    return value;
  }

  if (typeof value === 'function') {
    if (isGeneratorFunction(value)) {
      return run(value).call(_ctx);
    }

    var def = Promise.defer();
    try {
      value.call(_ctx, def.callback);
    } catch (e) {
      def.reject(e);
    }
    return def.promise;
  }

  if (typeof value.next === 'function' && typeof value.throw === 'function') {
    var gen = genToGenFunc(value);
    return run(gen).call(_ctx);
  }

  if (typeof value === 'object') {
    var keyArr = Object.keys(value);

    keyArr.forEach(function (index) {
      var val = value[index];
      value[index] = yieldHandler(val);
    });

    if (Array.isArray(value)) {
      return Promise.all(value);
    } else {
      return Promise.props(value);
    }
  }

  return Promise.resolve(value);
}

function isGeneratorFunction(obj){
  return obj.constructor && obj.constructor.name === 'GeneratorFunction';
}

function run(gen){
  return function() {
    var callback = null;
    var args = slice(arguments);
    var len = args.length;

    if(len && typeof args[len - 1] === 'function') {
      callback = args[len - 1];
      args.pop();
    }

    _ctx = this || {};
    var fn = co(bind(gen, _ctx)).apply(Promise, args).bind(_ctx).cancellable();

    return fn.nodeify(callback);
  };
}

module.exports = {
  'run': run,
  'resume': resume,
  'resumeRaw': resumeRaw,
  'delay': delay
};
