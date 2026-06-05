'use strict';
var fmtDate = require('./helpers').loadHistory()._fmtHistoryDate;

test('formats ISO date to M/D/YYYY', function() {
  assert.strictEqual(fmtDate('2025-03-15'), '3/15/2025');
});

test('strips leading zeros from month', function() {
  assert.strictEqual(fmtDate('2025-01-20'), '1/20/2025');
});

test('strips leading zeros from day', function() {
  assert.strictEqual(fmtDate('2025-06-05'), '6/5/2025');
});

test('strips leading zeros from both month and day', function() {
  assert.strictEqual(fmtDate('2025-01-05'), '1/5/2025');
});

test('preserves four-digit year', function() {
  assert.strictEqual(fmtDate('2000-12-31'), '12/31/2000');
});

test('empty string returns empty string', function() {
  assert.strictEqual(fmtDate(''), '');
});

test('null/falsy returns empty string', function() {
  assert.strictEqual(fmtDate(null), '');
  assert.strictEqual(fmtDate(undefined), '');
});

test('non-ISO string returned as-is', function() {
  assert.strictEqual(fmtDate('3/15/2025'), '3/15/2025');
});

test('partial ISO string returned as-is', function() {
  assert.strictEqual(fmtDate('2025-03'), '2025-03');
});
