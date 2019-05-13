/**
 * @file setup
 * @author Cuttle Cong
 * @date 2018/5/16
 * @description
 */

const nps = require('path')
const tasks = []
const afterTasks = []

function it(message, callback) {
  tasks.push({ message, callback })
}

function afterAll(callback) {
  afterTasks.push({ message: 'afterAll', callback })
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
    // done()
    setTimeout(done, 2000)
  }
  callback(_spy)
  _spy.t = setTimeout(_spy, 4000)
}

function run(tasks) {
  let task = tasks.shift()
  if (!task) {
    return Promise.resolve('ok')
  }

  return new Promise(resolve => {
    runTask(task, function done() {
      console.log('done', task.message)
      resolve(run(tasks))
    })
  })

}

global.it = it
global.afterAll = afterAll
global.assert = require('assert')

process.argv.slice(2).forEach(testPath => {
  require(nps.resolve(testPath))
})

run(tasks.concat(afterTasks)).catch(e => {
  console.error(e)
  process.exit(1)
}).then(() => process.exit(0))
