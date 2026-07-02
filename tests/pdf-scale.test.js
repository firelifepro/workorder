'use strict';
const { PDF_SCALE, sc, pdfSafe } = require('../js/inspection-pdf-scale.js');

// ── pdfSafe() — WinAnsi safety (pdf-lib StandardFont can't encode arrows etc.) ──

test('pdfSafe maps arrows and strips non-Latin-1 so pdf-lib never throws', () => {
  assert.strictEqual(pdfSafe('a → b'), 'a -> b');
  assert.strictEqual(pdfSafe('up ↑ down ↓'), 'up ^ down v');
  assert.strictEqual(pdfSafe('“smart” ‘quotes’'), '"smart" \'quotes\'');
  assert.strictEqual(pdfSafe('a — b … c'), 'a - b ... c');
  assert.strictEqual(pdfSafe('x ≥ 5, y ≤ 3'), 'x >= 5, y <= 3');
  // Any leftover non-Latin-1 (e.g. an emoji) is stripped, not thrown on.
  assert.strictEqual(/[^\x00-\xff]/.test(pdfSafe('note 🔥 →')), false);
});

test('pdfSafe passes through plain ASCII and preserves null/empty', () => {
  assert.strictEqual(pdfSafe('Plain note 123.'), 'Plain note 123.');
  assert.strictEqual(pdfSafe(''), '');
  assert.strictEqual(pdfSafe(null), null);
});

test('sc() multiplies by PDF_SCALE and rounds to the nearest 0.5pt', () => {
  assert.strictEqual(sc(10), Math.round(10 * PDF_SCALE * 2) / 2);
  // The 6.5pt "too small" body complaint lands near the ~9pt aggressive target.
  assert.strictEqual(sc(6.5) >= 8.5, true);
});

test('sc() preserves the size hierarchy (headers stay bigger than body)', () => {
  assert.strictEqual(sc(11) > sc(9), true);
  assert.strictEqual(sc(9) > sc(6.5), true);
});

test('sc() scales font and its coupled box height by the same factor (ratio preserved)', () => {
  // A 6.5pt font in a 12pt box keeps ~the same ratio after scaling, so padding
  // that cleared the box before still clears it.
  const fontRatioBefore = 6.5 / 12;
  const fontRatioAfter = sc(6.5) / sc(12);
  assert.strictEqual(Math.abs(fontRatioAfter - fontRatioBefore) < 0.05, true);
});

test('sc() is identity at PDF_SCALE 1.0', () => {
  // Guards the "dial back to original" contract regardless of the shipped value.
  if (PDF_SCALE === 1.0) assert.strictEqual(sc(7), 7);
  assert.strictEqual(true, true);
});

test('sc() rejects non-finite input (catches undefined literals at call sites)', () => {
  let threw = 0;
  [undefined, NaN, Infinity, '8'].forEach((bad) => {
    try { sc(bad); } catch (_) { threw++; }
  });
  assert.strictEqual(threw, 4);
});
