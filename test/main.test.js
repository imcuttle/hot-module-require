/**
 * @file main
 * @author imcuttle
 * @date 2018/4/4
 */
process.env.DEBUG = 'hot-module-require'
const makeHotRequire = require('../')
const nps = require('path')
const fs = require('fs')

const _aCode = 'module.exports = 1;'
const _bCode = 'module.exports = 2;'
const _indexCode = 'module.exports = require("./a") + require("./b");'

function delay(timeout = 1000) {
  return new Promise(resolve => {
    setTimeout(resolve, timeout)
  })
}

function deepCaseWrite(dir, aCode = _aCode, bCode = _bCode, indexCode = _indexCode) {
  fs.writeFileSync(nps.join(dir, 'a.js'), aCode)
  fs.writeFileSync(nps.join(dir, 'b.js'), bCode)
  fs.writeFileSync(nps.join(dir, 'index.js'), indexCode)
}

const hotRequire = makeHotRequire(__dirname)
it(
  'should hotRequire injected some properties',
  function () {
    assert.equal(typeof hotRequire, 'function')
    assert.equal(typeof hotRequire.accept, 'function')
    assert.equal(typeof hotRequire.refuse, 'function')
  }
)

it('should works in deep dependencies', function (done) {
  let base = nps.join(__dirname, './fixture/deep')
  deepCaseWrite(base)
  assert.equal(hotRequire('./fixture/deep/index'), 3)

  let count = 0
  hotRequire.accept(nps.join(base, 'index.js'), function (module, path) {
    count++
    console.log('count', count)
    assert.equal(module.id, path)
    assert.equal(require.cache[path], undefined)
    assert.equal(require(path), 4)
    done()
  })

  delay().then(() => {
    deepCaseWrite(base, "module.exports = 2;")
  })
  // expect(count).toBe(1)
})


it('should works in simple dependencies', function (done) {
  let base = nps.join(__dirname, './fixture/deep')
  deepCaseWrite(base)

  hotRequire

  let count = 0
  hotRequire.accept(nps.join(base, 'a.js'), function (module, path) {
    count++
    console.log('count', count)
    assert.equal(module.id, path)
    assert.equal(require.cache[path], undefined)
    assert.equal(require(path), 4)
    done()
  })

  delay().then(() => {
    deepCaseWrite(base, "module.exports = 2;")
  })
  // expect(count).toBe(1)
})
