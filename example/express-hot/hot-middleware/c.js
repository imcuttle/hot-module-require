/**
 * @file a
 * @author imcuttle <moyuyc95@gmail.com>
 * @date 2019/6/24
 *
 */
const child = 'b.js'
module.exports = 'in cxd ' + require('./child/' + child)
