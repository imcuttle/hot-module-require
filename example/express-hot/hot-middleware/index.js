/**
 * @file index
 * @author imcuttle <moyuyc95@gmail.com>
 * @date 2019/6/24
 *
 */

module.exports = (req, res, next) => {
  res.json(require('./a'))
}
