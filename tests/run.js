'use strict';
const assert = require('assert');
const path   = require('path');
const fs     = require('fs');

let passed = 0, failed = 0;
const failures = [];

global.assert = assert;
global.test   = function(name, fn) {
  try {
    fn();
    passed++;
    process.stdout.write('  ✓ ' + name + '\n');
  } catch(e) {
    failed++;
    failures.push({ name, err: e });
    process.stdout.write('  ✗ ' + name + '\n');
  }
};

const files = fs.readdirSync(__dirname)
  .filter(f => f.endsWith('.test.js'))
  .sort();

for (const file of files) {
  console.log('\n' + file);
  require(path.join(__dirname, file));
}

console.log('');
for (const f of failures) {
  console.log('FAIL: ' + f.name);
  console.log('  ' + f.err.message);
  if (f.err.actual !== undefined)
    console.log('  actual:   ' + JSON.stringify(f.err.actual) + '\n  expected: ' + JSON.stringify(f.err.expected));
  console.log('');
}

console.log(passed + ' passed, ' + failed + ' failed');
process.exit(failed > 0 ? 1 : 0);
