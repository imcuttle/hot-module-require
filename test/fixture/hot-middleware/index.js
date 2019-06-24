module.exports = (v) => {
  return (a = 0) => {
    return require('./a') + v + a
  }
}
  