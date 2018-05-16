# Hot-module-require

[![build status](https://img.shields.io/travis/imcuttle/hot-module-require/master.svg?style=flat-square)](https://travis-ci.org/imcuttle/hot-module-require)
[![Test coverage](https://img.shields.io/codecov/c/github/imcuttle/hot-module-require.svg?style=flat-square)](https://codecov.io/github/imcuttle/hot-module-require?branch=master)
[![NPM version](https://img.shields.io/npm/v/hot-module-require.svg?style=flat-square)](https://www.npmjs.com/package/hot-module-require)
[![NPM Downloads](https://img.shields.io/npm/dm/hot-module-require.svg?style=flat-square&maxAge=43200)](https://www.npmjs.com/package/hot-module-require)


```javascript
const makeHotRequire = require('hot-module-require')
const hotRequire = makeHotRequire(__dirname)

hotRequire('./module')

hotRequire.accept([], () => {

})
```
