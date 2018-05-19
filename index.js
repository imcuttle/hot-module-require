/**
 * @file index
 * @author imcuttle
 * @date 2018/4/4
 * @description
 */
const detectDep = require('detect-dep')
const { readFileSync } = require('fs')
const assert = require('assert')
const nps = require('path')
const chokidar = require('chokidar')
const debug = require('debug')('hot-module-require')
const EventEmitter = require('events')

function toArray(item) {
  return Array.isArray(item) ? item : [item]
}


function _moduleKey(resolvedModulePath) {
  return `dep: ${resolvedModulePath}`
}
const BOTH_EVENT_TYPE = '$both'

function makeHotRequireFunction(dirname = '', presetOpts = {}) {
  assert(dirname, 'missing dirname')
  assert(typeof dirname === 'string', 'dirname must be a string')
  presetOpts = Object.assign({ recursive: true }, presetOpts)

  function resolve(modulePath) {
    let resolvedModulePath
    if (modulePath.startsWith('.')) {
      resolvedModulePath = require.resolve(nps.resolve(dirname, modulePath))
    } else {
      resolvedModulePath = require.resolve(modulePath)
    }
    return resolvedModulePath
  }

  function hotRegister(modulePath, opts = {}) {
    opts = Object.assign({}, presetOpts, opts)

    let resolvedModulePath = hotRequire.resolve(modulePath)

    if (nps.isAbsolute(resolvedModulePath)) {
      if (opts.recursive) {
        let code = readFileSync(resolvedModulePath, { encoding: 'utf8' })
        let deps = detectDep(code, Object.assign({}, opts, { from: resolvedModulePath, moduleImport: false }))
        debug('deps %O \nof file: %s', deps, resolvedModulePath)

        const { dependence, dependent } = hotRequire
        function add(map, key, value) {
          if (!map.has(key)) {
            map.set(key, [])
          }
          let arr = map.get(key)
          if (arr.indexOf(value) < 0) {
            arr.push(value)
          }
        }

        deps.forEach(dep => {
          add(dependent, dep, resolvedModulePath)
          hotRequire.watcher.add(dep)
        })

        dependence.set(resolvedModulePath, deps)
      }
      hotRequire.watcher.add(resolvedModulePath)
    }

    return require(resolvedModulePath)
  }

  const hotRequire = Object.create(null)

  const watcher = chokidar.watch(null, {
    persistent: true
  })
  const dependent = new Map()
  const dependence = new Map()
  const emitter = new EventEmitter()

  function hotUpdate(path) {
    let old = require.cache[path]
    debug('emit %s \n %O.', path, old)
    delete require.cache[path]
    emitter.emit(_moduleKey(path), old, path)

    let dependents = dependent.get(path)
    debug('file %s \ndependents: %O.', path, dependents)
    dependents && dependents.forEach(path => {
      hotUpdate(path)
    })

    // Remove the dependencies
    let deps = dependence.get(path)
    deps && deps.forEach(dep => {
      dependents = dependent.get(dep)
      if (dependents) {
        let i = dependents.indexOf(path)
        if (i >= 0) {
          dependents.splice(i, 1)
        }
      }
    })
  }

  watcher.on('change', path => {
    debug('watch file %s changed.', path)
    debug('dependent: %O', dependent)
    debug('dependence: %O', dependence)
    hotUpdate(path)
  })

  hotRequire.close = function () {
    hotRequire.watcher.close()
  }
  hotRequire.resolve = resolve
  hotRequire.watcher = watcher
  hotRequire.emitter = emitter
  hotRequire.dependent = dependent
  hotRequire.dependence = dependence

  hotRequire.accept = function accept(deps, opt, callback) {
    if (typeof opt === 'function') {
      callback = opt
      opt = {}
    }
    if (!deps) {
      emitter.addListener(BOTH_EVENT_TYPE, callback)
      return
    }

    toArray(deps).forEach(dep => {
      let resolvedModulePath = hotRequire.resolve(dep)
      hotRegister(dep)
      emitter.addListener(_moduleKey(resolvedModulePath), callback)
    })
  }
  hotRequire.refuse = function refuse(deps, callback) {
    function remove(type) {
      if (!callback) {
        emitter.removeAllListeners(type)
      } else {
        emitter.removeListener(type, callback)
      }
    }
    if (!deps) {
      remove(BOTH_EVENT_TYPE)
      return
    }

    toArray(deps).forEach(dep => {
      let resolvedModulePath = hotRequire.resolve(dep)
      remove(_moduleKey(resolvedModulePath))
    })
  }

  return hotRequire
}

module.exports = makeHotRequireFunction
