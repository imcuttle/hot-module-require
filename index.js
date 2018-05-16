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

const watcher = chokidar.watch(null, {
  persistent: true
})

// TODO: Dependent tree
const dependent = new Map()

function hotUpdate(path) {
  let old = require.cache[path]
  delete require.cache[path]
  emitter.emit(_moduleKey(path), old, path)

  let dependents = dependent.get(path)
  debug('file %s \ndependents: %O.', path, dependents)
  dependents && dependents.forEach(path => {
    hotUpdate(path)
  })

  // TODO: Remove the dependencies
}

watcher.on('change', path => {
  debug('watch file %s changed.', path)
  hotUpdate(path)
})

function _moduleKey(resolvedModulePath) {
  return `dep: ${resolvedModulePath}`
}
const BOTH_EVENT_TYPE = '$both'
const emitter = new EventEmitter()

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

  function hotRequire(modulePath, opts = {}) {
    opts = Object.assign({}, presetOpts, opts)

    let resolvedModulePath = hotRequire.resolve(modulePath)

    if (nps.isAbsolute(resolvedModulePath)) {
      if (opts.recursive) {
        let code = readFileSync(resolvedModulePath, { encoding: 'utf8' })
        let deps = detectDep(code, { ...opts, from: resolvedModulePath, moduleImport: false })
        debug('deps %O \nof file: %s', deps, resolvedModulePath)

        const dependent = hotRequire.dependent
        deps.forEach(dep => {
          if (!dependent.has(dep)) {
            dependent.set(dep, [])
          }
          let deps = dependent.get(dep)
          deps.push(resolvedModulePath)

          hotRequire.watcher.add(dep)
        })
      } else {
        hotRequire.watcher.add(resolvedModulePath)
      }
    }

    return require(resolvedModulePath)
  }

  hotRequire.resolve = resolve
  hotRequire.watcher = watcher
  hotRequire.dependent = dependent

  hotRequire.accept = function accept(deps, callback) {
    if (!deps) {
      emitter.addListener(BOTH_EVENT_TYPE, callback)
      return
    }

    toArray(deps).forEach(dep => {
      let resolvedModulePath = hotRequire.resolve(dep)
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
