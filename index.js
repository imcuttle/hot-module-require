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

function delay(timeout) {
  return new Promise(resolve => {
    setTimeout(resolve, timeout)
  })
}

function toArray(item) {
  return Array.isArray(item) ? item : [item]
}

function _moduleKey(resolvedModulePath) {
  return `dep: ${resolvedModulePath}`
}
const BOTH_EVENT_TYPE = '$both'

/**
 *
 * @param dirname
 * @param presetOpts
 * @return {*}
 */
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

  function getDependencies(modulePath, opts) {
    opts = Object.assign({}, presetOpts, opts)
    let resolvedModulePath = hotRequire.resolve(modulePath)
    let code = readFileSync(resolvedModulePath, { encoding: 'utf8' })
    return detectDep(
      code,
      Object.assign({}, opts, { from: resolvedModulePath, moduleImport: false })
    )
  }

  function addDependencies(modulePath, deps = []) {
    const { dependence, dependent } = hotRequire
    let resolvedModulePath = hotRequire.resolve(modulePath)
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
      hotRequire.watcher.add(dep)
      add(dependence, resolvedModulePath, dep)
      add(dependent, dep, resolvedModulePath)
    })

    hotRequire.watcher.add(resolvedModulePath)
  }

  function removeDependencies(modulePath, deps) {
    const { dependence, dependent } = hotRequire
    let resolvedModulePath = hotRequire.resolve(modulePath)
    if (!deps) {
      deps = dependence.get(resolvedModulePath)
    }
    function remove(map, key, value) {
      if (!map.has(key)) {
        return
      }
      let arr = map.get(key)
      let i = arr.indexOf(value)
      if (i >= 0) {
        arr.splice(i, 1)
      }
    }

    ;(deps || []).forEach(dep => {
      remove(dependence, resolvedModulePath, dep)
      remove(dependent, dep, resolvedModulePath)

      if (!dependent.get(dep) || !dependent.get(dep).length) {
        hotRequire.watcher.unwatch(dep)
      }
    })

    if (
      !dependent.get(resolvedModulePath) ||
      !dependent.get(resolvedModulePath).length
    ) {
      hotRequire.watcher.unwatch(resolvedModulePath)
    }
  }

  function hotRegister(modulePath, opts = {}) {
    opts = Object.assign({}, presetOpts, opts)

    let resolvedModulePath = hotRequire.resolve(modulePath)

    if (nps.isAbsolute(resolvedModulePath)) {
      removeDependencies(resolvedModulePath)

      if (opts.recursive) {
        let deps = hotRequire.getDependencies(resolvedModulePath, opts)
        debug('deps %O \nof file: %s', deps, resolvedModulePath)
        addDependencies(resolvedModulePath, deps)
      } else {
        addDependencies(resolvedModulePath, [])
      }
    }
  }

  /**
   * @typedef {{}}
   * @name HotRequire
   */
  const hotRequire = Object.create(null)

  const watcher = chokidar.watch(null, {
    persistent: true
  })
  const dependent = new Map()
  const dependence = new Map()
  const emitter = new EventEmitter()

  function hotUpdate(path, opts) {
    opts = Object.assign({
      updatedPaths: []
    }, opts)

    if (opts.updatedPaths.includes(path)) {
      return
    }

    let old = require.cache[path]
    debug('hotUpdate %s \n', path)
    delete require.cache[path]

    // Upload dep tree
    hotRegister(path)
    // Trigger event
    emitter.emit(_moduleKey(path), old, path)

    // Backward update
    const { dependent, dependence } = hotRequire
    let dependents = dependent.get(path)
    debug('file %s => dependents: %O.', path, dependents)
    opts.updatedPaths = opts.updatedPaths.concat(path)
    dependents &&
      dependents.forEach((path) => {
        // return p.then(() => )
        hotUpdate(path, opts)
      })

    // Remove the dependencies
    // let deps = dependence.get(path)
    // deps &&
    //   deps.forEach(dep => {
    //     dependents = dependent.get(dep)
    //     if (dependents) {
    //       let i = dependents.indexOf(path)
    //       if (i >= 0) {
    //         dependents.splice(i, 1)
    //       }
    //     }
    //   })
  }

  watcher.on('change', path => {
    debug('watch file %s changed.', path)
    debug('dependent: %O', dependent)
    debug('dependence: %O', dependence)
    hotUpdate(path)
  })

  /**
   * @memberOf HotRequire
   * @public
   */
  hotRequire.close = function() {
    hotRequire.watcher.close()
  }
  hotRequire.resolve = resolve
  hotRequire.watcher = watcher
  hotRequire.emitter = emitter
  hotRequire.dependent = dependent
  hotRequire.dependence = dependence
  hotRequire.getDependencies = getDependencies
  hotRequire.register = hotRegister
  hotRequire.hotUpdate = hotUpdate
  hotRequire.addDependencies = addDependencies
  hotRequire.removeDependencies = removeDependencies

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
