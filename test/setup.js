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

  let rlt
  if (callback.length === 0) {
    rlt = callback()
  } else {
    rlt = callback(done)
  }
  return Promise.resolve(rlt).then(() => done(), done)
  // _spy.t = setTimeout(_spy, 4000)
}

function run(tasks) {
  let task = tasks.shift()
  if (!task) {
    return Promise.resolve('ok')
  }

  return new Promise((resolve, reject) => {
    return runTask(task, function done(err) {
      if (err) {
        reject(err)
      }
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

run(tasks.concat(afterTasks))
  .catch(e => {
    console.error(e)
    process.exit(1)
  })
  .then(() => process.exit(0))
