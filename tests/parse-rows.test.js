'use strict';
var helpers = require('./helpers');

function getCache(sessionStore) {
  var raw = sessionStore['flips_client_cache'];
  return raw ? JSON.parse(raw) : null;
}

test('parses rows into keyed object by property name', function() {
  var h = helpers.loadShared();
  h.ctx.parseRows([
    ['Property Name', 'Address', 'Phone'],
    ['Park Place',    '123 Main St', '555-1234'],
    ['River Walk',    '456 Oak Ave', '555-5678'],
  ]);
  var cache = getCache(h.sessionStore);
  assert.ok(cache, 'should write sessionStorage cache');
  assert.ok(cache.data['Park Place'],  'Park Place should be present');
  assert.ok(cache.data['River Walk'],  'River Walk should be present');
  assert.strictEqual(cache.data['Park Place']['address'], '123 Main St');
  assert.strictEqual(cache.data['Park Place']['phone'],   '555-1234');
});

test('header keys are lowercased', function() {
  var h = helpers.loadShared();
  h.ctx.parseRows([['PROPERTY NAME', 'SERVICE ADDRESS'], ['Site One', '789 Elm St']]);
  var cache = getCache(h.sessionStore);
  assert.strictEqual(cache.data['Site One']['service address'], '789 Elm St');
});

test('missing trailing cells filled with empty string', function() {
  var h = helpers.loadShared();
  h.ctx.parseRows([['Property Name', 'Address', 'Phone'], ['Park Place']]);
  var cache = getCache(h.sessionStore);
  assert.strictEqual(cache.data['Park Place']['address'], '');
  assert.strictEqual(cache.data['Park Place']['phone'],   '');
});

test('blank-name rows get a Row N fallback label, not skipped', function() {
  // parseRows uses `obj[nameKey] || 'Row N'` — blank names become "Row 2" etc.
  var h = helpers.loadShared();
  h.ctx.parseRows([['Property Name', 'Address'], ['', '123 Main'], ['River Walk', '456 Oak']]);
  var cache = getCache(h.sessionStore);
  assert.ok(cache.data['River Walk'],  'named row should be present');
  assert.ok(cache.data['Row 2'],       'blank-name row should appear as Row 2');
  assert.strictEqual(Object.keys(cache.data).length, 2);
});

test('last duplicate property name wins', function() {
  var h = helpers.loadShared();
  h.ctx.parseRows([['Property Name', 'Score'], ['Park Place', 'first'], ['Park Place', 'second']]);
  var cache = getCache(h.sessionStore);
  assert.strictEqual(cache.data['Park Place']['score'], 'second');
});

test('empty input skips sessionStorage write', function() {
  var h = helpers.loadShared();
  h.ctx.parseRows([]);
  assert.ok(!getCache(h.sessionStore), 'no cache entry should be written');
});

test('header-only input skips sessionStorage write', function() {
  var h = helpers.loadShared();
  h.ctx.parseRows([['Property Name']]);
  assert.ok(!getCache(h.sessionStore), 'single-row sheet treated as empty');
});

test('cache timestamp is recent', function() {
  var h   = helpers.loadShared();
  var now = Date.now();
  h.ctx.parseRows([['Property Name'], ['Park Place']]);
  var cache = getCache(h.sessionStore);
  assert.ok(cache.ts >= now, 'cache.ts should be set to current time');
});
