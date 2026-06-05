'use strict';
var findKey = require('./helpers').loadShared().ctx.findKey;

test('exact match on first candidate', function() {
  assert.strictEqual(findKey(['property name','address'], ['property name','site']), 'property name');
});

test('exact match on later candidate', function() {
  assert.strictEqual(findKey(['address','site name'], ['property name','site name']), 'site name');
});

test('exact match preferred over partial match on same header', function() {
  // 'name' exact-matches 'name'; should not fall through to partial-matching 'property name'
  assert.strictEqual(findKey(['property name','name'], ['name']), 'name');
});

test('partial/includes match used as fallback when no exact match', function() {
  assert.strictEqual(
    findKey(['the property name here','address'], ['property name']),
    'the property name here'
  );
});

test('no match returns first header', function() {
  assert.strictEqual(findKey(['col1','col2'], ['property name','site']), 'col1');
});

test('acct column lookup matches flips-shared fill() pattern', function() {
  // The fill() call in flips-shared uses 'acct' as a candidate key
  assert.strictEqual(
    findKey(['flps internal account number','address'], ['acct']),
    'flps internal account number'
  );
});
