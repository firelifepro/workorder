'use strict';
// Unit tests for the shared PDF tail components (js/inspection-pdf-components.js) —
// Phase 2 of the PDF-component unification. Covers the ctx cursor geometry and the
// row-count behavior of the deficiency / notes renderers (the parts that don't need
// a real pdf-lib canvas). Visual output is still verified via 👁 Preview PDF.

// The module references browser globals only when its functions run, so we stub the
// minimum here: window.PDFLib.rgb (colors), sc (identity), pdfSafe/wrapText/pdfRowHeight,
// and a fake pdf-lib doc/form/page that records createTextField calls.
global.window = { PDFLib: { rgb: (r, g, b) => ({ r, g, b }) } };
global.sc = n => n;
global.pdfSafe = s => s;
global.wrapText = (t) => (t ? String(t).split('\n') : ['']);
global.pdfRowHeight = (lineCount, opts) => Math.max((opts && opts.min) || 0, lineCount * 11 + 8);

const {
  makeInspectionPdfCtx,
  renderInspectionDeficiencies,
  renderInspectionNotes,
} = require('../js/inspection-pdf-components');

function fakeCtxInput() {
  let pageCount = 0;
  const fields = [];
  const mkPage = () => ({
    drawRectangle() {}, drawText() {}, drawImage() {},
  });
  const pdfDoc = { addPage() { pageCount++; return mkPage(); } };
  const form = {
    createTextField() {
      const f = { setText() { return f; }, enableMultiline() { return f; }, addToPage() { return f; }, setFontSize() { return f; } };
      fields.push(f);
      return f;
    },
  };
  const rFont = { widthOfTextAtSize: (s) => (s ? s.length * 5 : 0) };
  return {
    input: { pdfDoc, form, page: mkPage(), curY: 36, hFont: {}, rFont, fid: () => 'f' + fields.length },
    fields,
    pageCount: () => pageCount,
  };
}

test('ctx exposes page geometry constants', () => {
  const { input } = fakeCtxInput();
  const ctx = makeInspectionPdfCtx(input);
  assert.strictEqual(ctx.W, 612);
  assert.strictEqual(ctx.PH, 792);
  assert.strictEqual(ctx.ML, 36);
  assert.strictEqual(ctx.PW, 540);
});

test('ry / ty compute y from the top-down cursor', () => {
  const { input } = fakeCtxInput();
  const ctx = makeInspectionPdfCtx(input); // curY = 36
  assert.strictEqual(ctx.ry(10), 792 - 36 - 10);
  assert.strictEqual(ctx.ty(10), 792 - 36 - 10 + 3);
  assert.strictEqual(ctx.ty(10, 5), 792 - 36 - 10 + 5);
});

test('gap advances the cursor by sc(h)', () => {
  const { input } = fakeCtxInput();
  const ctx = makeInspectionPdfCtx(input);
  ctx.gap(5);
  assert.strictEqual(ctx.curY, 41);
});

test('addPage resets cursor to top margin and swaps the page', () => {
  const { input } = fakeCtxInput();
  const ctx = makeInspectionPdfCtx(input);
  const first = ctx.page;
  ctx.curY = 500;
  ctx.addPage();
  assert.strictEqual(ctx.curY, 36);
  assert.notStrictEqual(ctx.page, first);
});

test('checkPage breaks to a new page only when content would overflow', () => {
  const { input, pageCount } = fakeCtxInput();
  const ctx = makeInspectionPdfCtx(input);
  ctx.checkPage(10);            // fits — no new page
  assert.strictEqual(pageCount(), 0);
  ctx.checkPage(1000);          // overflows 792-36 bottom margin — new page
  assert.strictEqual(pageCount(), 1);
  assert.strictEqual(ctx.curY, 36);
});

test('deficiency renderer: empty list renders nothing (section omitted)', () => {
  const { input, fields } = fakeCtxInput();
  const ctx = makeInspectionPdfCtx(input);
  const y0 = ctx.curY;
  renderInspectionDeficiencies(ctx, { deficiencies: [] });
  assert.strictEqual(fields.length, 0);
  assert.strictEqual(ctx.curY, y0); // cursor untouched — no header, no bar
});

test('deficiency renderer: one editable field per item', () => {
  const { input, fields } = fakeCtxInput();
  const ctx = makeInspectionPdfCtx(input);
  renderInspectionDeficiencies(ctx, { deficiencies: [{ item: 'a' }, { item: 'b', description: 'c' }] });
  assert.strictEqual(fields.length, 2);
});

test('notes renderer: pads to at least 3 editable rows when fewer notes', () => {
  const { input, fields } = fakeCtxInput();
  const ctx = makeInspectionPdfCtx(input);
  renderInspectionNotes(ctx, { notes: ['only one'] });
  assert.strictEqual(fields.length, 3);
});

test('notes renderer: one row per note when 3 or more', () => {
  const { input, fields } = fakeCtxInput();
  const ctx = makeInspectionPdfCtx(input);
  renderInspectionNotes(ctx, { notes: ['a', 'b', 'c', 'd'] });
  assert.strictEqual(fields.length, 4);
});
