const path = require('path');
const fs = require('fs');

// we're already running tsc --watch
// so "transform" source for Jest by returning
// the code compiled by tsc
module.exports = {
  process(src, fn, config, options) {
    const bfn = fn.replace(__dirname + '/src', __dirname + '/build');
    const bfnParts = path.parse(bfn);
    const jsfn = path.format({ ...bfnParts, base: bfnParts.name + '.js' });
    const code = fs.readFileSync(jsfn, { encoding: 'utf8' });
    // Jest reads inline sourcemaps but not external ones
    // so we need to return it explicitly
    const map = fs.readFileSync(jsfn + '.map', { encoding: 'utf8' });
    return { code, map };
  }
};
