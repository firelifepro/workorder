'use strict';
const { wrapText, pdfRowHeight } = require('../js/inspection-pdf-layout.js');

// Deterministic stub for font measurement: every character is `size * 0.5` wide.
// At size 10 that's 5pt/char, so maxW=50 fits exactly 10 characters per line.
const measure = (str, size) => str.length * size * 0.5;

// ── wrapText ──────────────────────────────────────────────────────────────────

test('empty / falsy text returns a single empty line', () => {
  assert.deepStrictEqual(wrapText('', 10, 100, measure), ['']);
  assert.deepStrictEqual(wrapText(null, 10, 100, measure), ['']);
  assert.deepStrictEqual(wrapText(undefined, 10, 100, measure), ['']);
});

test('short text that fits stays on one line', () => {
  assert.deepStrictEqual(wrapText('hello', 10, 100, measure), ['hello']);
});

test('wraps onto multiple lines at the width boundary', () => {
  // maxW=50, 5pt/char => 10 chars/line. "aaa bbb ccc ddd" greedily packs
  // "aaa bbb" (7) then "ccc ddd".
  assert.deepStrictEqual(
    wrapText('aaa bbb ccc ddd', 10, 50, measure),
    ['aaa bbb', 'ccc ddd']
  );
});

test('a single word wider than maxW overflows on its own line (not broken)', () => {
  // "supercalifragilistic" is 20 chars = 100pt > 50pt, but must not be split.
  assert.deepStrictEqual(
    wrapText('supercalifragilistic', 10, 50, measure),
    ['supercalifragilistic']
  );
});

test('long word after a short word starts a fresh line', () => {
  assert.deepStrictEqual(
    wrapText('hi superlongwordhere', 10, 50, measure),
    ['hi', 'superlongwordhere']
  );
});

test('result is always at least one line', () => {
  assert.strictEqual(wrapText('anything', 10, 100, measure).length >= 1, true);
});

// ── pdfRowHeight ────────────────────────────────────────────────────────────────

test('row height grows with line count', () => {
  // 1 line: 1*9 + 4 = 13 (== min); 3 lines: 3*9 + 4 = 31.
  assert.strictEqual(pdfRowHeight(1, { lineH: 9, pad: 4, min: 13 }), 13);
  assert.strictEqual(pdfRowHeight(3, { lineH: 9, pad: 4, min: 13 }), 31);
});

test('row height never drops below min (empty/placeholder rows)', () => {
  // 1 line at lineH 9 + pad 4 = 13, but min 20 wins.
  assert.strictEqual(pdfRowHeight(1, { lineH: 9, pad: 4, min: 20 }), 20);
  assert.strictEqual(pdfRowHeight(0, { lineH: 9, pad: 4, min: 14 }), 14);
});

test('pdfRowHeight applies sensible defaults', () => {
  // defaults: lineH 11, pad 8, min 0 => 2 lines = 30.
  assert.strictEqual(pdfRowHeight(2), 30);
});

test('wrapText + pdfRowHeight compose to size a box', () => {
  const lines = wrapText('aaa bbb ccc ddd', 10, 50, measure); // 2 lines
  assert.strictEqual(pdfRowHeight(lines.length, { lineH: 9, pad: 4, min: 13 }), 22);
});
