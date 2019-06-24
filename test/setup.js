/**
 * @file setup
 * @author Cuttle Cong
 * @date 2018/5/16
 * @description
 */

const nps = require('path')
const minimist = require('minimist')
const tasks = []
const afterTasks = []

function it(message, callback) {
  tasks.push({ message, callback })
}

function afterAll(callback) {
  afterTasks.push({ message: 'afterAll', callback })
}

function runTask(callback, done) {
  let rlt = callback(done)
  return Promise.resolve(rlt).then(() => done(), done)
  // _spy.t = setTimeout(_spy, 4000)
}

function run(tasks, opts) {
  let task = tasks.shift()
  if (!task) {
    return Promise.resolve('ok')
  }

  return new Promise((resolve, reject) => {
    let msgs = opts.message
    if (opts.message && !Array.isArray(opts.message)) {
      msgs = [opts.message]
    }
    if (msgs && !msgs.includes(task.message)) {
      return resolve(run(tasks, opts))
    }

    const msg = task.message
    console.log('\nrunning:', msg)
    let hasRun = false
    return runTask(task.callback, function done(err) {
      if (hasRun) return resolve()
      hasRun = true
      console.log('done:', msg)
      if (err) {
        reject(err)
      }
      resolve(run(tasks, opts))
    })
  })
}

global.it = it
global.afterAll = afterAll
global.assert = require('assert')

const arg = minimist(process.argv.slice(2), {
  alias: {
    message: 'm'
  }
})
arg._.forEach(testPath => {
  require(nps.resolve(testPath))
})

/**
 * testfiles... [-m --message "exact message"]
 */
run(tasks.concat(afterTasks), arg)
  .catch(e => {
    console.error(e)
    process.exit(1)
  })
  .then(() => process.exit(0))
