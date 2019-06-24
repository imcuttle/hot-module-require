/**
 * @file index
 * @author imcuttle <moyuyc95@gmail.com>
 * @date 2019/6/24
 *
 */
const express = require('express')
const makeHotModule = require('../..')

const hotRequire = makeHotModule(__dirname)
const getter = hotRequire('./hot-middleware')

const app = express()
app.all('/', function () {
  getter().apply(this, arguments)
})

app.listen(9999, () => {
  console.log(`Run on http://localhost:9999`)
})
