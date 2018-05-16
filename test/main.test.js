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

function clearRequire() {
  for (let key in require.cache) {
    delete require.cache[key]
  }

}

function delay(timeout = 1000) {
  return new Promise(resolve => {
    setTimeout(resolve, timeout)
  })
}

function deepCaseWrite(dir, aCode = _aCode, bCode = _bCode, indexCode = _indexCode) {
  aCode && fs.writeFileSync(nps.join(dir, 'a.js'), aCode)
  bCode && fs.writeFileSync(nps.join(dir, 'b.js'), bCode)
  indexCode && fs.writeFileSync(nps.join(dir, 'index.js'), indexCode)
}

it(
  'should hotRequire injected some properties',
  function () {
    const hotRequire = makeHotRequire(__dirname)
    assert.equal(typeof hotRequire.accept, 'function')
    assert.equal(typeof hotRequire.refuse, 'function')
    hotRequire.close()
  }
)

it('should works in deep dependencies', function (done) {
  clearRequire()
  const hotRequire = makeHotRequire(__dirname)
  let base = nps.join(__dirname, './fixture/deep')
  deepCaseWrite(base)
  assert.equal(require('./fixture/deep/index'), 3)

  let count = 0
  hotRequire.accept(nps.join(base, 'index.js'), function (module, path) {
    count++
    console.log('count', count)
    assert.equal(module.id, path)
    assert.equal(require.cache[path], undefined)
    assert.equal(require(path), 4)

    console.log('hotRequire.close()')
    hotRequire.close()
    done()
  })

  delay().then(() => {
    deepCaseWrite(base, "module.exports = 2;", null, null)
  })
  // expect(count).toBe(1)
})


it('should works in simple dependencies', function (done) {
  clearRequire()
  const hotRequire = makeHotRequire(__dirname)
  let base = nps.join(__dirname, './fixture/deep')
  deepCaseWrite(base)

  require(nps.join(base, 'index.js'))

  let count = 0
  hotRequire.accept([nps.join(base, 'a.js')], function (module, path) {
    count++
    assert.equal(count, 1)
    assert.equal(module.id, path)
    assert.equal(require.cache[path], undefined)

    console.log(fs.readFileSync(path).toString())
    assert.equal(require(path), 2)
  })

  hotRequire.accept(nps.join(base, 'index.js'), function (module, path) {
    count++
    assert.equal(count, 2)
    assert.equal(module.exports, 3)
    assert.equal(require.cache[path], undefined)
    assert.equal(require(path), 4)
    done()
  })


  delay().then(() => {
    deepCaseWrite(base, "module.exports = 2;", null, null)
  })
  // expect(count).toBe(1)
})
