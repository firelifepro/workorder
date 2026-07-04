// ─────────────────────────────────────────────────────────────────────────────
// SHARED PDF TAIL COMPONENTS — the report sections that were duplicated (with
// cosmetic drift) across every editable inspection builder in
// js/inspection-pdf-editable.js. Phase 2 of the PDF-component unification.
//
// A builder renders its system-specific content with its own local cursor/helpers,
// then hands the current page + cursor to `makeInspectionPdfCtx(...)` and calls the
// shared renderers for the common tail:
//     renderInspectionDeficiencies(ctx, data)
//     renderInspectionNotes(ctx, data)
//     await renderInspectionStatusAndSignatures(ctx, data)
//     await renderInspectionPhotos(ctx)
// The ctx OWNS page/cursor state from the handoff point on (all tail sections come
// last in every builder), so the builder just does `return pdfDoc.save()` after.
//
// Section titles are standardized here (single wording for all systems); notes are
// editable, auto-growing numbered rows everywhere (matching the deficiency style);
// the signature block uses 'INSPECTOR SIGNATURE' wording.
//
// Depends on browser globals present on the inspection pages at call time: pdf-lib
// (`window.PDFLib`), the pure layout math `wrapText`/`pdfRowHeight`
// (js/inspection-pdf-layout.js), `sc`/`pdfSafe` (js/inspection-pdf-scale.js), and
// the signature/photo state `sigHasData`/`custSigHasData`/`inspectionPhotos`.
// ─────────────────────────────────────────────────────────────────────────────

// Shared inspection-PDF palette — the identical color set every builder redefined
// locally. Pass pdf-lib's `rgb`. Returns { FIRE_RED, navy, sky, gold, lgray, white, blk }.
function inspPdfColors(rgb) {
  return {
    FIRE_RED: rgb(0.72, 0.08, 0.08),
    navy:  rgb(0.13, 0.21, 0.42),
    sky:   rgb(0.71, 0.80, 0.93),
    gold:  rgb(1.0,  1.0,  0.75),
    lgray: rgb(0.94, 0.94, 0.94),
    white: rgb(1, 1, 1),
    blk:   rgb(0, 0, 0),
  };
}

// Build a drawing context that owns the page cursor. `o` supplies the pdf-lib doc,
// form, fonts, the builder's current `page`/`curY`, and the builder's `fid`
// generator (reused so field names keep incrementing without collision).
function makeInspectionPdfCtx(o) {
  const { rgb } = window.PDFLib;
  const W = 612, PH = 792, ML = 36, PW = 540, MT = 36, MB = 36;

  const ctx = Object.assign({
    pdfDoc: o.pdfDoc, form: o.form, hFont: o.hFont, rFont: o.rFont, fid: o.fid,
    page: o.page, curY: o.curY,
    W, PH, ML, PW, MT, MB,
  }, inspPdfColors(rgb));

  ctx.addPage   = () => { ctx.page = ctx.pdfDoc.addPage([W, PH]); ctx.curY = MT; };
  ctx.ry        = (h) => PH - ctx.curY - h;
  ctx.ty        = (h, a = 3) => PH - ctx.curY - h + a;
  ctx.checkPage = (needed) => { if (ctx.curY + needed > PH - MB) ctx.addPage(); };
  ctx.gap       = (h) => { ctx.curY += sc(h); };
  ctx.wrap      = (t, sz, mw) => wrapText(t, sz, mw, (s, z) => ctx.rFont.widthOfTextAtSize(s, z));

  ctx.secHdr = (title) => {
    ctx.checkPage(sc(18));
    ctx.page.drawRectangle({ x: ML, y: ctx.ry(sc(17)), width: PW, height: sc(17), color: ctx.navy });
    ctx.page.drawText(title, { x: ML + 4, y: ctx.ty(sc(17), sc(5)), size: sc(9), font: ctx.hFont, color: ctx.white });
    ctx.curY += sc(18);
  };

  ctx.subHdr = (title) => {
    ctx.checkPage(sc(14));
    ctx.page.drawRectangle({ x: ML, y: ctx.ry(sc(13)), width: PW, height: sc(13), color: ctx.sky });
    ctx.page.drawText(title, { x: ML + 4, y: ctx.ty(sc(13), sc(4)), size: sc(7.5), font: ctx.hFont, color: ctx.navy });
    ctx.curY += sc(14);
  };

  ctx.mkField = (val, x, fieldY, w, h, multiline) => {
    ctx.page.drawRectangle({ x, y: fieldY, width: w, height: h, color: ctx.gold, borderColor: ctx.sky, borderWidth: 0.5 });
    const f = ctx.form.createTextField(ctx.fid());
    f.setText(pdfSafe(String(val || '')));
    if (multiline) f.enableMultiline();
    f.addToPage(ctx.page, { x: x + 1, y: fieldY + 1, width: w - 2, height: h - 2, font: ctx.rFont });
    f.setFontSize(sc(8));
  };

  ctx.dataRow = (cols, fh = 12, lh = 8, gp = 3) => {
    const FH = sc(fh), LH = sc(lh), GP = sc(gp);
    ctx.checkPage(LH + FH + GP);
    let x = ML;
    cols.forEach(c => {
      ctx.page.drawText((c.label || '') + ':', { x: x + 2, y: ctx.ty(LH, LH - sc(3)), size: sc(6), font: ctx.hFont, color: ctx.navy });
      ctx.mkField(c.val, x, ctx.ry(LH + FH), c.w, FH, false);
      x += c.w;
    });
    ctx.curY += LH + FH + GP;
  };

  // Editable table with header row. `wrapCol` (optional) makes that column auto-grow
  // so long text wraps to more lines instead of overflowing.
  ctx.table = (hdrs, rows, cellH, wrapCol) => {
    cellH = sc(cellH);
    const drawHdr = () => {
      ctx.checkPage(sc(13));
      let x = ML;
      hdrs.forEach(h => {
        ctx.page.drawRectangle({ x, y: ctx.ry(sc(13)), width: h.w, height: sc(13), color: ctx.navy });
        ctx.page.drawText(ctx.wrap(h.label, sc(6), h.w - 3)[0] || '', { x: x + 2, y: ctx.ty(sc(13), sc(4)), size: sc(6), font: ctx.hFont, color: ctx.white });
        x += h.w;
      });
      ctx.curY += sc(14);
    };
    drawHdr();
    rows.forEach(row => {
      const rowH = (wrapCol != null)
        ? pdfRowHeight(ctx.wrap(String(row[wrapCol] || ''), sc(7), hdrs[wrapCol].w - 4).length, { lineH: sc(9), pad: sc(4), min: cellH })
        : cellH;
      if (ctx.curY + rowH > PH - MB) { ctx.addPage(); drawHdr(); }
      let x = ML;
      hdrs.forEach((h, i) => {
        ctx.page.drawRectangle({ x, y: ctx.ry(rowH), width: h.w, height: rowH, color: ctx.gold, borderColor: ctx.sky, borderWidth: 0.3 });
        const f = ctx.form.createTextField(ctx.fid());
        f.setText(pdfSafe(String(row[i] || '')));
        if (wrapCol != null && i === wrapCol) f.enableMultiline();
        f.addToPage(ctx.page, { x: x + 1, y: ctx.ry(rowH) + 1, width: h.w - 2, height: rowH - 2, font: ctx.rFont });
        f.setFontSize(sc(7));
        x += h.w;
      });
      ctx.curY += rowH + 1;
    });
  };

  return ctx;
}

// One numbered, auto-growing, editable (multiline) row — the shared row style used
// by both the deficiency list and the general-notes list.
function _inspectionNumberedRow(ctx, i, text, opts) {
  const { ML, PW } = ctx;
  const rh = pdfRowHeight(ctx.wrap(text, sc(7), PW - 30).length, opts);
  ctx.checkPage(rh + sc(1));
  ctx.page.drawRectangle({ x: ML,      y: ctx.ry(rh), width: 24,     height: rh, color: ctx.gold, borderColor: ctx.sky, borderWidth: 0.3 });
  ctx.page.drawText(String(i + 1), { x: ML + 8, y: ctx.ry(rh) + rh - sc(9), size: sc(7), font: ctx.hFont, color: ctx.blk });
  ctx.page.drawRectangle({ x: ML + 24, y: ctx.ry(rh), width: PW - 24, height: rh, color: ctx.gold, borderColor: ctx.sky, borderWidth: 0.3 });
  const nf = ctx.form.createTextField(ctx.fid());
  nf.setText(pdfSafe(text)); nf.enableMultiline();
  nf.addToPage(ctx.page, { x: ML + 25, y: ctx.ry(rh) + 1, width: PW - 26, height: rh - 2, font: ctx.rFont });
  nf.setFontSize(sc(7));
  ctx.curY += rh + sc(1);
}

// OVERALL SYSTEM STATUS bar — the full-width colored status strip on page 1 of
// every report (COMPLIANT green / DEFICIENT red / IMPAIRED amber / else slate).
function renderInspectionStatusBar(ctx, data) {
  const { rgb } = window.PDFLib;
  const { ML, PW } = ctx;
  const stH = sc(18);
  const stVal = (data.overallStatus || '').toUpperCase();
  const stColor = stVal === 'COMPLIANT' ? rgb(0.06, 0.50, 0.22)
                : stVal === 'DEFICIENT' ? rgb(0.76, 0.10, 0.10)
                : stVal === 'IMPAIRED'  ? rgb(0.75, 0.38, 0.00)
                :                         rgb(0.38, 0.44, 0.54);
  ctx.checkPage(stH + sc(6));
  ctx.page.drawRectangle({ x: ML, y: ctx.ry(stH), width: PW, height: stH, color: stColor });
  ctx.page.drawText('OVERALL SYSTEM STATUS', { x: ML + 8, y: ctx.ty(stH, sc(6)), size: sc(6.5), font: ctx.hFont, color: ctx.white });
  ctx.page.drawText(stVal || 'PENDING', { x: ML + 8 + ctx.hFont.widthOfTextAtSize('OVERALL SYSTEM STATUS', sc(6.5)) + sc(12), y: ctx.ty(stH, sc(6)), size: sc(9.5), font: ctx.hFont, color: ctx.white });
  ctx.curY += stH + sc(6);
}

// Keep a section header with its first row on the SAME page — page-break BEFORE
// the header if the header (secHdr ≈ sc(18)) plus the first row wouldn't both fit.
// Prevents a tall preceding block (e.g. fire-alarm's big NFPA box) from stranding
// a lone header at the bottom of a page with its list starting on the next one.
function _reserveHeaderPlusRow(ctx, firstText, rowOpts) {
  const firstH = pdfRowHeight(ctx.wrap(firstText || '', sc(7), ctx.PW - 30).length, rowOpts);
  ctx.checkPage(sc(18) + firstH + sc(2));
}

// DEFICIENCY LIST — numbered editable rows from data.deficiencies. Renders only
// when there are deficiencies (a clean report omits the section), so the canonical
// report order is header → NFPA → status bar → deficiencies (if any) → rest.
function renderInspectionDeficiencies(ctx, data) {
  const list = data.deficiencies || [];
  if (list.length === 0) return;
  const rowOpts = { lineH: sc(9), pad: sc(4), min: sc(13) };
  const firstText = (list[0].item || '') + (list[0].description ? ': ' + list[0].description : '');
  _reserveHeaderPlusRow(ctx, firstText, rowOpts);
  ctx.secHdr('DEFICIENCY LIST');
  list.forEach((d, i) => {
    const text = (d.item || '') + (d.description ? ': ' + d.description : '');
    _inspectionNumberedRow(ctx, i, text, rowOpts);
  });
  ctx.gap(6);
}

// GENERAL NOTES & SITE OBSERVATIONS — numbered editable rows from data.notes,
// padded to at least 3 blank fillable rows.
function renderInspectionNotes(ctx, data) {
  const notes = data.notes || [];
  const rowCount = Math.max(notes.length, 3);
  const rowOpts = { lineH: sc(12), pad: sc(7), min: sc(18) };
  _reserveHeaderPlusRow(ctx, notes[0] || '', rowOpts);
  ctx.secHdr('GENERAL NOTES & SITE OBSERVATIONS');
  for (let i = 0; i < rowCount; i++) {
    _inspectionNumberedRow(ctx, i, notes[i] || '', rowOpts);
  }
  ctx.gap(6);
}

// One signature box (drawn sig image if present, else a blank fillable field).
async function _inspectionSigBox(ctx, label, labelX, boxX, imgX, fieldX, w, h, canvasId, hasData) {
  ctx.page.drawText(label, { x: labelX, y: ctx.ty(h) + h + sc(2), size: sc(7), font: ctx.hFont, color: ctx.navy });
  ctx.page.drawRectangle({ x: boxX, y: ctx.ry(h), width: w, height: h, color: ctx.gold, borderColor: ctx.sky, borderWidth: 0.5 });
  if (hasData) {
    try {
      const cv  = document.getElementById(canvasId);
      const b64 = cv.toDataURL('image/png').split(',')[1];
      const ab  = Uint8Array.from(atob(b64), c => c.charCodeAt(0)).buffer;
      const img = await ctx.pdfDoc.embedPng(ab);
      const dims = img.scaleToFit(w - 8, h - 8);
      ctx.page.drawImage(img, { x: imgX, y: ctx.ry(h) + 4, width: dims.width, height: dims.height });
      return;
    } catch (_) {}
  }
  const f = ctx.form.createTextField(ctx.fid());
  f.setText('');
  f.addToPage(ctx.page, { x: fieldX, y: ctx.ry(h) + 2, width: w - 4, height: h - 4, font: ctx.rFont });
  f.setFontSize(sc(9));
}

// OVERALL STATUS & SIGNATURES — status row, dual signature boxes, then
// date / print-name rows for inspector and client.
async function renderInspectionStatusAndSignatures(ctx, data) {
  const { ML, PW } = ctx;
  const fd = data.fieldData || {};
  ctx.checkPage(sc(120));
  ctx.gap(10);
  ctx.secHdr('OVERALL STATUS & SIGNATURES');
  ctx.gap(3);
  ctx.dataRow([{ label: 'OVERALL INSPECTION STATUS', val: data.overallStatus || '', w: PW }]);
  ctx.gap(12);

  const sigH = sc(40), sigW = PW / 2 - 6;
  await _inspectionSigBox(ctx, 'INSPECTOR SIGNATURE:', ML,            ML,            ML + 4,          ML + 2,          sigW, sigH, 'sig-canvas',
    (typeof sigHasData !== 'undefined') && sigHasData);
  await _inspectionSigBox(ctx, 'CLIENT SIGNATURE:',    ML + PW/2 + 10, ML + PW/2 + 8, ML + PW/2 + 12, ML + PW/2 + 10, sigW, sigH, 'cust-sig-canvas',
    (typeof custSigHasData !== 'undefined') && custSigHasData);
  ctx.curY += sigH + sc(4);

  ctx.dataRow([
    { label: 'INSPECTOR DATE', val: data.signature?.date || data.inspection?.date || '', w: PW / 2 },
    { label: 'CLIENT DATE',    val: fd['cust-sig-date'] || '', w: PW / 2 },
  ]);
  ctx.dataRow([
    { label: 'INSPECTOR PRINT NAME', val: fd['sig-name'] || data.signature?.name || data.inspection?.inspectorName || '', w: PW / 2 },
    { label: 'CLIENT PRINT NAME',    val: fd['cust-sig-name'] || '', w: PW / 2 },
  ]);
}

// INSPECTION PHOTOS — 2-up grid on a fresh page, with number badge + optional note.
// No-op when there are no photos.
async function renderInspectionPhotos(ctx) {
  const photos = (typeof inspectionPhotos !== 'undefined') ? inspectionPhotos : [];
  if (!photos.length) return;
  const { ML, PW } = ctx;
  ctx.addPage();
  ctx.secHdr('INSPECTION PHOTOS');
  const photoW = Math.floor((PW - 10) / 2);
  const photoH = sc(140);
  let col = 0;
  for (let i = 0; i < photos.length; i++) {
    const photo = photos[i];
    ctx.checkPage(photoH + 30);
    const px = ML + col * (photoW + 10);
    try {
      const b64 = photo.dataUrl.split(',')[1];
      const ab  = Uint8Array.from(atob(b64), c => c.charCodeAt(0)).buffer;
      const img = photo.dataUrl.startsWith('data:image/png')
        ? await ctx.pdfDoc.embedPng(ab) : await ctx.pdfDoc.embedJpg(ab);
      const dims = img.scaleToFit(photoW, photoH);
      ctx.page.drawImage(img, { x: px, y: ctx.ry(photoH) + (photoH - dims.height), width: dims.width, height: dims.height });
    } catch (_) {
      ctx.page.drawRectangle({ x: px, y: ctx.ry(photoH), width: photoW, height: photoH, color: ctx.lgray });
    }
    const badgeH = sc(12);
    ctx.page.drawRectangle({ x: px + 2, y: ctx.ry(photoH) + photoH - badgeH - 2, width: sc(40), height: badgeH, color: ctx.blk });
    ctx.page.drawText('Photo ' + (i + 1), { x: px + 4, y: ctx.ry(photoH) + photoH - badgeH + sc(3), size: sc(7), font: ctx.hFont, color: ctx.white });
    if (photo.note) {
      ctx.wrap(photo.note, sc(7), photoW).forEach((l, li) => {
        ctx.page.drawText(l, { x: px, y: ctx.ry(photoH) - sc(10) - li * sc(9), size: sc(7), font: ctx.rFont, color: ctx.blk });
      });
    }
    col++;
    if (col >= 2) { col = 0; ctx.curY += photoH + sc(22); }
  }
  if (col > 0) ctx.curY += photoH + sc(22);
}

// Dual-environment export: CommonJS for Node tests, global for the browser.
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    inspPdfColors,
    makeInspectionPdfCtx,
    renderInspectionStatusBar,
    renderInspectionDeficiencies,
    renderInspectionNotes,
    renderInspectionStatusAndSignatures,
    renderInspectionPhotos,
  };
}
