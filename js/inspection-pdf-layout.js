// ─────────────────────────────────────────────────────────────────────────────
// PDF LAYOUT MATH — pure, dependency-free helpers shared by the inspection PDF
// builders (js/inspection-pdf-editable.js).
//
// These are deliberately free of any pdf-lib / DOM / font references so they can
// be unit-tested under Node (see tests/pdf-layout.test.js). The font-measurement
// is injected as a callback, so the same wrapping logic is exercised in tests
// with a deterministic stub and in the browser with pdf-lib's real metrics.
//
// Loaded in the browser via <script src="js/inspection-pdf-layout.js"> before
// inspection-pdf.js, and required directly in Node tests.
// ─────────────────────────────────────────────────────────────────────────────

// Greedy word-wrap. Returns an array of lines (always at least ['']).
//   text     — the string to wrap
//   size     — font size, passed through to `measure`
//   maxW     — max line width in the same units `measure` returns
//   measure  — (str, size) => width   (e.g. pdf-lib's font.widthOfTextAtSize)
//
// Note: a single word wider than maxW is NOT broken mid-word — it overflows onto
// its own line. This matches the original inline behavior in every builder.
function wrapText(text, size, maxW, measure) {
  if (!text) return [''];
  const words = String(text).split(' ');
  const lines = [];
  let cur = '';
  for (const w of words) {
    const test = cur ? cur + ' ' + w : w;
    if (measure(test, size) > maxW && cur) { lines.push(cur); cur = w; }
    else cur = test;
  }
  if (cur) lines.push(cur);
  return lines.length ? lines : [''];
}

// Auto-grow row height for a wrapped text box. Returns the box height needed to
// fit `lineCount` lines, never less than `min`.
//   lineCount — number of wrapped lines (e.g. wrapText(...).length)
//   opts.lineH — per-line height (default 11)
//   opts.pad   — vertical padding added on top of the lines (default 8)
//   opts.min   — minimum height, for empty/placeholder rows (default 0)
function pdfRowHeight(lineCount, opts) {
  const o = opts || {};
  const lineH = o.lineH != null ? o.lineH : 11;
  const pad   = o.pad   != null ? o.pad   : 8;
  const min   = o.min   != null ? o.min   : 0;
  return Math.max(min, lineCount * lineH + pad);
}

// Dual-environment export: CommonJS for Node tests, global for the browser.
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { wrapText, pdfRowHeight };
}
