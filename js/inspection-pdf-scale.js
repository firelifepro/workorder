// ─────────────────────────────────────────────────────────────────────────────
// PDF SCALE — single tunable knob for the inspection PDF builders
// (js/inspection-pdf-editable.js and js/inspection-hospital-pdf.js).
//
// Field users complained the reports were too small (body text ran 6–7 pt). Rather
// than re-tune ~180 hand-picked font/box literals, every SIZE the builders use —
// font sizes AND the vertical box heights / baseline offsets that are coupled to
// them — is passed through sc(). Multiplying both the font and its box by the same
// factor preserves the padding-to-font ratio that was carefully tuned (so section
// headers keep clearing their field boxes), it just renders everything bigger; the
// existing checkPage() logic absorbs the extra vertical space with more page breaks.
//
// Horizontal geometry (x positions, column widths, page margins) is NOT scaled —
// the page stays US Letter (612×792) — so only vertical size grows. Wrapped
// drawText and auto-fitting form fields handle any tight columns.
//
// PDF_SCALE is the one dial: bump it up for larger text, drop it for smaller, then
// re-preview each system. Ships at the aggressive setting (body 6.5 → ~9 pt).
//
// Pure and dependency-free (no pdf-lib / DOM) so it can be unit-tested under Node
// (see tests/pdf-scale.test.js) and loaded in the browser via
// <script src="js/inspection-pdf-scale.js"> BEFORE the PDF builders.
// ─────────────────────────────────────────────────────────────────────────────

// The knob. 1.0 = render at the original sizes. Ships aggressive so the smallest
// body text (6.5 pt) lands near 9 pt: 6.5 * 1.4 ≈ 9.1.
const PDF_SCALE = 1.4;

// Scale a raw point value (font size, box height, or a vertical baseline offset)
// by PDF_SCALE, rounded to the nearest 0.5 pt so sizes stay clean. Returns the
// value unchanged when PDF_SCALE is 1.0.
function sc(n) {
  if (typeof n !== 'number' || !isFinite(n)) {
    throw new Error('sc(): expected a finite number, got ' + n);
  }
  return Math.round(n * PDF_SCALE * 2) / 2;
}

// Make text safe for pdf-lib's StandardFont (WinAnsi/CP1252) encoder, which throws
// on any character it can't encode (e.g. arrows →, smart quotes, bullets, em dashes)
// — common when users paste notes from Word/web. Maps the frequent offenders to
// ASCII and strips anything else outside Latin-1 so PDF generation never crashes.
function pdfSafe(s) {
  if (s == null) return s;
  return String(s)
    .replace(/[→⇒➡➔]/g, '->')
    .replace(/[←⇐]/g, '<-')
    .replace(/↑/g, '^').replace(/↓/g, 'v')
    .replace(/[‘’‚‛]/g, "'")
    .replace(/[“”„]/g, '"')
    .replace(/[–—―]/g, '-')
    .replace(/…/g, '...')
    .replace(/[•▪●‣⁃]/g, '*')
    .replace(/≥/g, '>=').replace(/≤/g, '<=')
    .replace(/≠/g, '!=')
    .replace(/[   ]/g, ' ')
    .replace(/[^\x00-\xff]/g, ''); // strip any remaining non-Latin-1 char
}

// Dual-environment export: CommonJS for Node tests, globals for the browser.
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { PDF_SCALE, sc, pdfSafe };
}
