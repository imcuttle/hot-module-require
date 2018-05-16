/**
 * @file setup
 * @author Cuttle Cong
 * @date 2018/5/16
 * @description
 */

const nps = require('path')
const tasks = []

function it(message, callback) {
  tasks.push({ message, callback })
}

function runTask({ message, callback }, done) {
  console.log('running:', message)

  function _spy() {
    if (_spy.called) {
      return
    }
    _spy.called = true
    clearTimeout(_spy.t)
    _spy.t = null
    done()
    // setTimeout(done, 1000)
  }
  callback(_spy)
  _spy.t = setTimeout(_spy, 5000)
}

function run() {
  let task = tasks.shift()
  if (!task) {
    return Promise.resolve('ok')
  }
  // if (run._t) {
  //   clearTimeout(run._t)
  //   run._t = null
  // }
  // run._t = setTimeout(run, 5000)

  return new Promise(resolve => {
    runTask(task, function done() {
      resolve(run())
      console.log('done', task.message)
    })
  })

}

global.it = it
global.assert = require('assert')

process.argv.slice(2).forEach(testPath => {
  require(nps.resolve(testPath))
})

run().catch(e => {
  throw e
}).then(() => process.exit(0))
