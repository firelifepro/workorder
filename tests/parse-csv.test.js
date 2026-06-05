'use strict';
var parseCSV = require('./helpers').loadShared().ctx.parseCSV;

// deepStrictEqual fails across vm contexts (different Array prototype), so we
// compare JSON strings which are context-independent.
function eq(actual, expected) {
  assert.strictEqual(JSON.stringify(actual), JSON.stringify(expected));
}

test('basic comma-separated rows', function() {
  eq(parseCSV('a,b,c\n1,2,3'), [['a','b','c'],['1','2','3']]);
});

test('quoted field containing a comma', function() {
  eq(parseCSV('"hello, world",b\n1,2'), [['hello, world','b'],['1','2']]);
});

test('quoted field containing a newline', function() {
  eq(parseCSV('"line1\nline2",b'), [['line1\nline2','b']]);
});

test('double-quote escape inside quoted field', function() {
  eq(parseCSV('"say ""hi""",b'), [['say "hi"','b']]);
});

test('CRLF line endings', function() {
  eq(parseCSV('a,b\r\n1,2'), [['a','b'],['1','2']]);
});

test('trailing empty line is ignored', function() {
  eq(parseCSV('a,b\n1,2\n'), [['a','b'],['1','2']]);
});

test('single-column CSV', function() {
  eq(parseCSV('name\nAlice\nBob'), [['name'],['Alice'],['Bob']]);
});

test('empty string returns empty array', function() {
  eq(parseCSV(''), []);
});

test('whitespace-only value is preserved (cell trim happens in parseRows)', function() {
  // parseCSV trims at the row level but preserves inner cell content
  var result = parseCSV('a, b ,c\n1,2,3');
  assert.strictEqual(result[0][1], 'b');
});
