/**
 * @file index
 * @author imcuttle
 * @date 2018/4/4
 * @description
 */
const detectDep = require('detect-dep')
const assert = require('assert')
const visitTree = require('@moyuyc/visit-tree')
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

function visitUniqTree(tree, visit) {
  const map = new WeakMap()
  visitTree(tree, (node, ctx) => {
    // Skip the visited node
    if (map.has(node)) {
      return ctx.skip()
    }

    visit && visit(node, ctx)
    map.set(node, 'visited')
  })
}

/**
 * make a hot require instance
 * @param dirname
 * @param presetOpts {{}}
 * @param [presetOpts.recursive=true] {boolean} Analysis file recursively
 * @see More options see [detect-dep](https://github.com/imcuttle/detect-dep)
 * @public
 * @return {HotRequire}
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

  function getDependenceTree(modulePath, opts) {
    const resolvedOptions = Object.assign({ moduleImport: false }, presetOpts, opts)
    let resolvedModulePath = hotRequire.resolve(modulePath)

    if (!resolvedOptions.recursive) {
      return {
        id: resolvedModulePath,
        children: detectDep(resolvedModulePath, resolvedOptions).map(path => {
          return {
            id: path,
            children: []
          }
        })
      }
    }

    return detectDep.tree(resolvedModulePath, resolvedOptions)
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
    function innerRegister(modulePath, opts = {}, map = {}) {
      opts = Object.assign({}, presetOpts, opts)
      let resolvedModulePath = hotRequire.resolve(modulePath)

      if (map.hasOwnProperty(resolvedModulePath)) {
        return
      }

      map[resolvedModulePath] = 'visiting'
      if (nps.isAbsolute(resolvedModulePath)) {
        let depTree = hotRequire.getDependenceTree(resolvedModulePath, opts)
        visitUniqTree(depTree, (node, ctx) => {
          hotRequire.removeDependencies(node.id)
          const deps = node.children.map(mod => mod.id)
          hotRequire.addDependencies(node.id, deps)
          debug('deps %O \nof file: %s', deps, node.id)
        })
      }
      map[resolvedModulePath] = 'visited'
    }

    return innerRegister(modulePath, opts)
  }

  /**
   * @name HotRequire
   * @public
   * @typedef {Function & {remove: Function}}
   */
  function hotRequire(modulePath) {
    modulePath = hotRequire.resolve(modulePath)

    const listener = (oldModule, path) => {
    }
    hotRequire.accept([modulePath], listener)

    return Object.assign(() => require(modulePath), {
      remove: () => {
        return hotRequire.refuse(modulePath, listener)
      }
    })

  }

  const watcher = chokidar.watch([], {
    persistent: true
  })
  const dependent = new Map()
  const dependence = new Map()
  const emitter = new EventEmitter()

  function hotUpdate(path, opts) {

    function innerHotUpdate(path, opts, map = {}) {
      if (map.hasOwnProperty(path)) {
        return
      }

      let old = require.cache[path]
      debug('hotUpdate %s \n', path)
      delete require.cache[path]

      // Update dep tree
      hotRequire.register(path)
      // Trigger event
      emitter.emit(_moduleKey(path), old, path)

      // Backward update
      const { dependent, dependence } = hotRequire
      let dependents = dependent.get(path)
      debug('file %s => dependents: %O.', path, dependents)
      // Create a new map, For tracking one direction instead of the global dep graph
      map = Object.assign({
        [path]: 'visiting'
      }, map)
      dependents &&
      dependents.forEach(path => {
        // return p.then(() => )
        innerHotUpdate(path, opts, map)
      })
      map[path] = 'visited'
    }

    return innerHotUpdate(path, opts, {})

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
   * Resolve file name
   * @memberOf HotRequire
   * @public
   * @param name {string}
   */
  hotRequire.resolve = resolve
  /**
   * file Watcher
   * @memberOf HotRequire
   * @public
   * @see [chokidar](https://npmjs.com/chokidar)
   */
  hotRequire.watcher = watcher
  /**
   * The event emitter
   * @memberOf HotRequire
   * @public
   */
  hotRequire.emitter = emitter
  /**
   * The map about dependent relations
   * @memberOf HotRequire
   * @public
   * @type {Map}
   */
  hotRequire.dependent = dependent
  /**
   * The map about dependence relations
   * @memberOf HotRequire
   * @public
   * @type {Map}
   */
  hotRequire.dependence = dependence
  /**
   * Get dependence tree of which file
   * @memberOf HotRequire
   * @public
   * @param modulePath {string}
   * @param opts
   * @see https://github.com/imcuttle/detect-dep#tree
   * @return {{}}
   */
  hotRequire.getDependenceTree = getDependenceTree
  hotRequire.register = hotRegister
  hotRequire.hotUpdate = hotUpdate
  /**
   * Add Dependencies
   * @memberOf HotRequire
   * @public
   * @param modulePath {string}
   * @param deps {string[]}
   */
  hotRequire.addDependencies = addDependencies
  /**
   * Remove Dependencies
   * @memberOf HotRequire
   * @public
   * @param modulePath {string}
   * @param deps {string[]}
   */
  hotRequire.removeDependencies = removeDependencies

  /**
   * Watch file with callback and make dependence(dependent) relations
   * @memberOf HotRequire
   * @public
   * @param deps {string[]}
   * @param callback {function}
   */
  hotRequire.accept = function accept(deps, callback) {
    if (!deps) {
      emitter.addListener(BOTH_EVENT_TYPE, callback)
      return
    }

    toArray(deps).forEach(dep => {
      let resolvedModulePath = hotRequire.resolve(dep)
      hotRequire.register(dep)
      emitter.addListener(_moduleKey(resolvedModulePath), callback)
    })
  }
  /**
   * Watch file with callback and make dependence(dependent) relations
   * @memberOf HotRequire
   * @public
   * @param deps {string[]}
   * @param callback {function}
   */
  hotRequire.refuse = function refuse(deps, callback) {
    function remove(type, path) {
      if (!callback) {
        emitter.removeAllListeners(type)
      } else {
        emitter.removeListener(type, callback)
      }

      // Remove dependencies & unwatch
      if (path && !emitter.listeners(type).length) {
        removeDependencies(path)
      }
    }
    if (!deps) {
      remove(BOTH_EVENT_TYPE)
      return
    }

    toArray(deps).forEach(dep => {
      let resolvedModulePath = hotRequire.resolve(dep)
      remove(_moduleKey(resolvedModulePath), resolvedModulePath)
    })
  }
  /**
   * Close file watcher
   * @memberOf HotRequire
   * @return void
   * @public
   */
  hotRequire.close = function() {
    hotRequire.watcher.close()
  }

  return hotRequire
}

module.exports = makeHotRequireFunction
