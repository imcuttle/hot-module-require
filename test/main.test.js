/**
 * @file main
 * @author imcuttle
 * @date 2018/4/4
 */
// process.env.DEBUG = 'hot-module-require'
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

function delay(timeout = 2000) {
  return new Promise(resolve => {
    setTimeout(resolve, timeout)
  })
}

function deepCaseWrite(
  dir,
  aCode = _aCode,
  bCode = _bCode,
  indexCode = _indexCode
) {
  aCode && fs.writeFileSync(nps.join(dir, 'a.js'), aCode)
  bCode && fs.writeFileSync(nps.join(dir, 'b.js'), bCode)
  indexCode && fs.writeFileSync(nps.join(dir, 'index.js'), indexCode)
}

let hotRequire
it('should hotRequire injected some properties', function(done) {
  hotRequire = makeHotRequire(__dirname)
  assert.equal(typeof hotRequire.accept, 'function')
  assert.equal(typeof hotRequire.refuse, 'function')
  hotRequire.close()
  done()
})

it('should works in deep dependencies', function(done) {
  clearRequire()
  hotRequire = makeHotRequire(__dirname)
  let base = nps.join(__dirname, './fixture/deep')
  deepCaseWrite(base)
  assert.equal(require('./fixture/deep/index'), 3)

  let count = 0
  hotRequire.accept(nps.join(base, 'index.js'), function(module, path) {
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
    deepCaseWrite(base, 'module.exports = 2;', null, null)
  })
  // expect(count).toBe(1)
})

it('should works in simple dependencies', function(done) {
  clearRequire()
  hotRequire && hotRequire.close()
  hotRequire = makeHotRequire(__dirname)
  let base = nps.join(__dirname, './fixture/deep')
  deepCaseWrite(base)

  require(nps.join(base, 'index.js'))

  return delay(300).then(() => {
    let count = 0
    hotRequire.accept([nps.join(base, 'a.js')], function(module, path) {
      count++
      try {
        assert.equal(count, 1)
        assert.equal(module.exports, 1)
        assert.equal(module.id, path)
        assert.equal(require.cache[path], undefined)

        // await delay(0)
        console.log(fs.readFileSync(path).toString())
        assert.equal(require(path), 2)
      } catch (e) {
        done(e)
      }
    })

    hotRequire.accept(nps.join(base, 'index.js'), function(module, path) {
      count++

      try {
        assert.equal(count, 2)
        assert.equal(module.exports, 3)
        assert.equal(require.cache[path], undefined)

        // await delay(0)
        assert.equal(require(path), 4)
      } catch (e) {
        done(e)
      }
      done()
    })

    delay().then(() => {
      deepCaseWrite(base, 'module.exports = 2;', null, null)
    })
  })

  // expect(count).toBe(1)
})

it('should works in dynamic dependencies', function() {
  clearRequire()
  hotRequire && hotRequire.close()
  hotRequire = makeHotRequire(__dirname)
  let base = nps.join(__dirname, './fixture/deep')
  deepCaseWrite(base)

  require(nps.join(base, 'index.js'))

  return delay().then(() => {
    let count = 0
    hotRequire.accept([nps.join(base, 'index.js')], function(module, path) {
      count++

      console.log(path, hotRequire.dependent)
      console.log(hotRequire.dependence)
    })

    return delay(2000)
      .then(() => {
        deepCaseWrite(base, "module.exports = require('.');", null, null)
        return delay(2000)
      })
      .then(() => {
        assert.equal(count, 1)
        deepCaseWrite(base, "module.exports = require('.')", null, null)
        return delay().then(() => {
          assert.equal(count, 2)
        })
      })
  })
})

//    root
//   / |  \
//  A  /   B
//  \ /
//   C
it('should complex', function() {
  clearRequire()

  let complexPath = nps.join(__dirname, './fixture/complex')
  let rootPath = nps.join(complexPath, 'root.js')
  let aPath = nps.join(complexPath, 'a.js')
  let bPath = nps.join(complexPath, 'b.js')
  let cPath = nps.join(complexPath, 'c.js')

  !fs.existsSync(complexPath) && fs.mkdirSync(complexPath)
  fs.writeFileSync(
    rootPath,
    `module.exports = require('./a') + require('./b') + require('./c')`
  ) // 9
  fs.writeFileSync(aPath, `module.exports = 1 + require('./c')`) // 4
  fs.writeFileSync(bPath, `module.exports = 2`)
  fs.writeFileSync(cPath, `module.exports = 3`)

  const results = []
  return delay().then(() => {
    hotRequire && hotRequire.close()
    hotRequire = makeHotRequire(complexPath)

    hotRequire.accept(['./root'], (m, p) => {
      console.log(require(p))
      results.push(require(p))
    })

    fs.writeFileSync(cPath, `module.exports = 2`)

    return delay().then(() => {
      fs.writeFileSync(cPath, `module.exports = 10`)

      return delay().then(() => {
        // assert.equal(JSON.stringify(results), JSON.stringify([7, 7, 15, 23]))
        assert.equal(JSON.stringify(results), JSON.stringify([23, 23]))
      })
    })
  })
})

it('should callable hotRequire', function() {
  clearRequire()

  let path = nps.join(__dirname, './fixture/hot-middleware')
  hotRequire && hotRequire.close()
  hotRequire = makeHotRequire(path)

  deepCaseWrite(
    path,
    'module.exports = 4',
    null,
    `module.exports = (v) => {
  return (a = 0) => {
    return require('./a') + v + a
  }
}
  `
  )

  const get = hotRequire('./')
  assert.equal(get()(2)(), 6)

  return delay()
    .then(() => {
      deepCaseWrite(path, 'module.exports = 2', null, null)
    })
    .then(() => {
      return delay().then(() => {
        assert.equal(get()(2)(1), 5)
      })
    })
    .then(() => {
      return delay(2000).then(() => {
        // Remove listener
        get.remove()
        deepCaseWrite(path, 'module.exports = 3', null, null)
      })
    })
    .then(() => {
      return delay(2000).then(() => {
        assert.equal(get()(2)(1), 5)
      })
    })
})

it('should circle works', function() {
  clearRequire()
  let path = nps.join(__dirname, './fixture/circle')
  hotRequire && hotRequire.close()
  hotRequire = makeHotRequire(path)

  deepCaseWrite(
    path,
    'module.exports = ["a", require("./b")]',
    'module.exports = ["b", require("./")]',
    `module.exports = ["index", require("./a")]`
  )

  // hotRequire.accept(['./', './a', './b'], (m, path) => {
  //   console.log('path', path)
  // })

  let exp
  hotRequire.accept('./', (m, path) => {
    exp = require(path)
  })
  assert.equal(
    JSON.stringify(require(hotRequire.resolve('.'))),
    JSON.stringify(['index', ['a', ['b', {}]]])
  )

  return delay()
    .then(() => {
      deepCaseWrite(
        path,
        'module.exports = ["a-2", require("./b")]',
        null,
        null
      )
    })
    .then(() => {
      return delay().then(() => {
        assert.equal(
          JSON.stringify(exp),
          JSON.stringify(['index', ['a-2', ['b', {}]]])
        )
      })
    })
    .then(() => {
      return delay().then(() => {
        deepCaseWrite(
          path,
          null,
          'module.exports = ["b-2", require("./")]',
          null
        )
      })
    })
    .then(() => {
      return delay().then(() => {
        assert.equal(
          JSON.stringify(exp),
          JSON.stringify(['index', ['a-2', ['b-2', {}]]])
        )
      })
    })
    .then(() => {
      return delay().then(() => {
        deepCaseWrite(
          path,
          null,
          null,
          `module.exports = ["index-2", require("./a")]`
        )
      })
    })
    .then(() => {
      return delay().then(() => {
        assert.equal(
          JSON.stringify(exp),
          JSON.stringify(['index-2', ['a-2', ['b-2', {}]]])
        )
      })
    })
})

// afterAll(() => {
//   deepCaseWrite()
// })
