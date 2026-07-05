// ─────────────────────────────────────────────────────────────────────────────
// BLANK FIELD WORKSHEETS — printable, hand-fill PDF forms.
//
// For inspectors/contractors who'd rather write on paper than tap through the
// wizard (e.g. the extinguisher / exit-sign & lighting contractor). Each unit is
// a TWO-ROW block: open-text cells (location, type, floor, sizes, comments, note)
// plus ☐-to-X CHECKBOXES for every categorical / pass-fail field (mount, type,
// P/F/N-A columns, PASS/FAIL). The contractor just marks an X in a box — far more
// reliable for inspection-scan-import.js to read back than handwritten letters.
//
// The cover header is drawn here (self-contained) and pre-fills the property
// name/address when a property is selected; Date/Inspector/Frequency print blank
// for hand entry. Everything is drawn (no fillable form fields).
//
// SELF-CONTAINED so it works on BOTH inspection.html and hospital-inspection.html
// by loading only this file + inspection-scan-import.js. Depends only on the tiny
// pure helpers both pages already load: sc/pdfSafe (inspection-pdf-scale.js) and
// wrapText (inspection-pdf-layout.js), plus window.PDFLib. It does NOT need the
// full editable PDF engine or inspection-pdf-components.js.
//
// Dispatch + download entry points (buildActiveBlankFormBytes / downloadBlankForm
// / _blankFormOpts) live at the bottom of this file so both pages get them.
// ─────────────────────────────────────────────────────────────────────────────

// Palette (inlined so this module carries no dependency on inspPdfColors).
function _blankPalette(rgb) {
  return {
    FIRE_RED: rgb(0.72, 0.08, 0.08),
    navy:  rgb(0.13, 0.21, 0.42),
    sky:   rgb(0.71, 0.80, 0.93),
    lgray: rgb(0.94, 0.94, 0.94),
    white: rgb(1, 1, 1),
  };
}

// Shared page/geometry primitives for a worksheet builder. Seeds onto an existing
// page/cursor (the header page) so the body continues below the cover header.
// Everything is in absolute points (US Letter 612×792), unscaled.
function _makeBlankFormCtx(pdfDoc, hFont, rFont, initialPage, initialCurY) {
  const rgb = window.PDFLib.rgb;
  const { navy, sky, white } = _blankPalette(rgb);
  const boxInk = rgb(0.25, 0.3, 0.4);
  const numInk = rgb(0.4, 0.45, 0.55);
  const capInk = navy;
  const W = 612, PH = 792, ML = 36, PW = 540, MT = 36, MB = 40;

  let page = initialPage;
  let curY = initialCurY;
  const ry = (h) => PH - curY - h;
  const ty = (h, a = 3) => PH - curY - h + a;
  const addPage = () => { page = pdfDoc.addPage([W, PH]); curY = MT; };
  const checkPage = (needed) => { if (curY + needed > PH - MB) { addPage(); return true; } return false; };

  const secHdr = (title) => {
    const H = 18;
    checkPage(H + 30);
    page.drawRectangle({ x: ML, y: ry(H), width: PW, height: H, color: navy });
    page.drawText(title, { x: ML + 5, y: ty(H, 6), size: 9.5, font: hFont, color: white });
    curY += H + 3;
  };

  // Instruction / helper line in muted text.
  const note = (txt, size = 8) => {
    wrapText(txt, size, PW, (s, z) => rFont.widthOfTextAtSize(s, z)).forEach(ln => {
      checkPage(size + 4);
      page.drawText(ln, { x: ML, y: ry(size), size, font: rFont, color: rgb(0.35, 0.4, 0.5) });
      curY += size + 3;
    });
    curY += 3;
  };

  // Draw one unit as a stacked set of bordered lines. `num` prints in the first
  // line's leading cell. Each line = { h, segs:[seg…] }; segs sum to PW.
  //   seg.t: 'num'   → centered row number (no caption)
  //          'open'  → caption + blank writing area; seg.value pre-prints text
  //          'check' → caption + ☐ boxes; seg.mark pre-X's the matching option
  //   seg: { t, label, w, opts?:[string…], value?, mark? }
  const unitBlock = (num, lines) => {
    const totalH = lines.reduce((a, l) => a + l.h, 0);
    checkPage(totalH + 4);
    const blockTop = curY;               // distance from page top to block's top edge
    let top = curY;
    lines.forEach(ln => {
      const lineTopY = PH - top;         // y of this line's TOP edge
      const lineBotY = PH - (top + ln.h);// y of this line's BOTTOM edge
      page.drawRectangle({ x: ML, y: lineBotY, width: PW, height: ln.h, color: white, borderColor: sky, borderWidth: 0.5 });
      let x = ML;
      ln.segs.forEach(seg => {
        const w = seg.w;
        if (seg.label) page.drawText(seg.label, { x: x + 3, y: lineTopY - 9, size: 6, font: hFont, color: capInk });
        if (seg.t === 'num') {
          const t = String(num);
          page.drawText(t, { x: x + w / 2 - rFont.widthOfTextAtSize(t, 10) / 2, y: (lineTopY + lineBotY) / 2 - 3.5, size: 10, font: rFont, color: numInk });
        } else if (seg.t === 'open') {
          page.drawLine({ start: { x: x + 4, y: lineBotY + 5 }, end: { x: x + w - 4, y: lineBotY + 5 }, thickness: 0.4, color: sky });
          if (seg.value) {
            const v = wrapText(pdfSafe(String(seg.value)), 8, w - 8, (s, z) => rFont.widthOfTextAtSize(s, z))[0] || '';
            page.drawText(v, { x: x + 4, y: lineBotY + 8, size: 8, font: rFont, color: rgb(0.1, 0.13, 0.2) });
          }
        } else if (seg.t === 'check') {
          const bs = 10;                 // box size
          const by = lineBotY + 4;       // boxes sit near the bottom of the line
          let bx = x + 3;
          seg.opts.forEach(op => {
            page.drawRectangle({ x: bx, y: by, width: bs, height: bs, borderColor: boxInk, borderWidth: 1 });
            if (seg.mark && String(seg.mark).toUpperCase() === op.toUpperCase()) {
              page.drawText('X', { x: bx + 1.8, y: by + 1.5, size: 8.5, font: hFont, color: rgb(0.1, 0.13, 0.2) });
            }
            page.drawText(op, { x: bx + bs + 2, y: by + 1.5, size: 7.5, font: hFont, color: boxInk });
            bx += bs + 2 + hFont.widthOfTextAtSize(op, 7.5) + 8;
          });
        }
        x += w;
        if (x < ML + PW - 0.5) page.drawLine({ start: { x, y: lineBotY }, end: { x, y: lineTopY }, thickness: 0.4, color: sky });
      });
      top += ln.h;
    });
    // Thicker outer border groups the stacked lines into one unit.
    page.drawRectangle({ x: ML, y: PH - (blockTop + totalH), width: PW, height: totalH, borderColor: navy, borderWidth: 0.9 });
    curY = top + 3;
  };

  // A block of blank numbered lines for hand-written notes / deficiencies.
  const linedBlock = (title, lines = 6, rowH = 20) => {
    secHdr(title);
    for (let i = 1; i <= lines; i++) {
      checkPage(rowH);
      page.drawRectangle({ x: ML, y: ry(rowH), width: PW, height: rowH, color: white, borderColor: sky, borderWidth: 0.5 });
      page.drawText(i + '.', { x: ML + 4, y: ty(rowH, rowH / 2 - 1), size: 8, font: rFont, color: numInk });
      curY += rowH;
    }
    curY += 8;
  };

  return { secHdr, note, unitBlock, linedBlock };
}

// Draw a self-contained cover header on a fresh first page, pre-filling the
// property (when selected) but leaving Date/Inspector/Frequency blank for hand
// entry. Returns the header page and the curY beneath it.
function _blankFormHeader(pdfDoc, hFont, rFont, title, freqOptions) {
  const rgb = window.PDFLib.rgb;
  const { FIRE_RED, navy, sky, lgray, white } = _blankPalette(rgb);
  const W = 612, PH = 792, ML = 36, PW = 540;
  const page = pdfDoc.addPage([W, PH]);
  const blk = rgb(0.1, 0.13, 0.2);

  // Read the property from whichever page's fields exist (inspection.html step-1
  // or hospital-inspection.html), so the worksheet can be printed before an
  // inspection is started.
  const fv = (id) => (document.getElementById(id)?.value || '').trim();
  const propName = fv('property-name') || fv('property-select') || fv('service-address');
  const propAddr = [fv('service-address'), fv('city-state-zip')].filter(Boolean).join(', ');

  let cy = 20;
  const ry = (h) => PH - cy - h;

  // Title banner
  const titleH = 24;
  page.drawRectangle({ x: 0, y: ry(titleH), width: W, height: titleH, color: navy });
  page.drawText(title, { x: W / 2 - hFont.widthOfTextAtSize(title, 13) / 2, y: ry(titleH) + 7, size: 13, font: hFont, color: white });
  cy += titleH + 4;

  // Company line + accent rule
  page.drawText('Fire Life Protection Systems, Inc.', { x: ML, y: ry(11), size: 10, font: hFont, color: FIRE_RED });
  page.drawText('8201 Shaffer Parkway Suite B, Littleton, CO 80127  ·  Office (720) 974-1570', { x: ML, y: ry(21), size: 7.5, font: rFont, color: rgb(0.35, 0.4, 0.5) });
  cy += 26;
  page.drawRectangle({ x: ML, y: ry(1.2), width: PW, height: 1.2, color: sky });
  cy += 8;

  // Labeled cell: caption + value/blank writing area.
  const cell = (x, w, label, value) => {
    const h = 20;
    page.drawRectangle({ x, y: ry(h), width: w, height: h, color: white, borderColor: sky, borderWidth: 0.6 });
    page.drawText(label, { x: x + 3, y: ry(h) + h - 8, size: 6, font: hFont, color: navy });
    if (value) {
      const v = wrapText(pdfSafe(String(value)), 9, w - 8, (s, z) => rFont.widthOfTextAtSize(s, z))[0] || '';
      page.drawText(v, { x: x + 4, y: ry(h) + 4, size: 9, font: rFont, color: blk });
    }
  };
  cell(ML, PW, 'BUILDING / PROPERTY NAME', propName);
  cy += 22;
  cell(ML, PW, 'STREET, CITY, STATE, ZIP', propAddr);
  cy += 22;

  // Date / Inspector / Frequency row
  const h = 22;
  const wDate = 130, wInsp = 190, wFreq = PW - wDate - wInsp;
  cell(ML, wDate, 'DATE PERFORMED', '');
  cell(ML + wDate, wInsp, 'INSPECTOR', '');
  // Frequency as ☐ boxes
  const fx = ML + wDate + wInsp;
  page.drawRectangle({ x: fx, y: ry(h), width: wFreq, height: h, color: white, borderColor: sky, borderWidth: 0.6 });
  page.drawText('FREQUENCY', { x: fx + 3, y: ry(h) + h - 8, size: 6, font: hFont, color: navy });
  let bx = fx + 4;
  (freqOptions || ['ANNUAL', 'SEMI-ANNUAL', 'MONTHLY']).forEach(op => {
    page.drawRectangle({ x: bx, y: ry(h) + 4, width: 9, height: 9, borderColor: rgb(0.25, 0.3, 0.4), borderWidth: 1 });
    page.drawText(op, { x: bx + 11, y: ry(h) + 5.5, size: 6.5, font: hFont, color: rgb(0.25, 0.3, 0.4) });
    bx += 11 + hFont.widthOfTextAtSize(op, 6.5) + 8;
  });
  cy += h + 8;

  return { page, curY: cy };
}

// ── PORTABLE FIRE EXTINGUISHER — field worksheet ─────────────────────────────
// opts = { count = 100, known = [] } — `count` blank blocks after any `known`
// devices pre-filled from the last inspection.
async function buildBlankExtinguisherFormBytes(opts) {
  if (!window.PDFLib) throw new Error('PDF library not loaded. Please refresh.');
  const { count = 100, known = [] } = opts || {};
  const { PDFDocument, StandardFonts } = window.PDFLib;
  const pdfDoc = await PDFDocument.create();
  const hFont  = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const rFont  = await pdfDoc.embedFont(StandardFonts.Helvetica);

  const { page, curY } = _blankFormHeader(
    pdfDoc, hFont, rFont,
    'PORTABLE FIRE EXTINGUISHER - FIELD WORKSHEET',
    ['ANNUAL', 'SEMI-ANNUAL', 'MONTHLY']
  );
  const ctx = _makeBlankFormCtx(pdfDoc, hFont, rFont, page, curY);

  ctx.secHdr('EXTINGUISHER UNITS');
  ctx.note('One block per extinguisher. Write Location / Floor / MFG Yr / Size / Hydro Due, and mark an X in the box for Mount, Type, and Pass/Fail. Note anything unusual in NOTES.' +
    (known.length ? ' Pre-filled rows are from the last inspection — confirm and mark Pass/Fail.' : ''));

  const extBlock = (num, d) => ctx.unitBlock(num, [
    { h: 26, segs: [
      { t: 'num', w: 28 },
      { t: 'open',  label: 'FLR',      w: 46,  value: d.flr },
      { t: 'open',  label: 'LOCATION', w: 286, value: d.location || d.loc },
      { t: 'check', label: 'MOUNT',    w: 180, opts: ['HK', 'WALL', 'CAB', 'STAND'], mark: d.mount },
    ] },
    { h: 30, segs: [
      { t: 'open',  label: 'MFG YR',     w: 52, value: d.mfgYear || d.mfg },
      { t: 'open',  label: 'SIZE (LB)',  w: 52, value: d.size },
      { t: 'check', label: 'TYPE',       w: 210, opts: ['ABC', 'CO2', 'K', 'WATER', 'HALON'], mark: d.type },
      { t: 'open',  label: 'HYDRO DUE',  w: 52, value: d.hydroDue },
      { t: 'check', label: 'PASS / FAIL',w: 94, opts: ['PASS', 'FAIL'] },
      { t: 'open',  label: 'NOTES',      w: 80 },
    ] },
  ]);

  let n = 0;
  known.forEach(d => extBlock(++n, d || {}));
  for (let i = 0; i < count; i++) extBlock(++n, {});

  ctx.linedBlock('DEFICIENCIES (describe each failed / missing unit)', 6);
  ctx.linedBlock('GENERAL NOTES', 5);

  return await pdfDoc.save();
}

// ── EXIT SIGN & EMERGENCY LIGHTING — field worksheet ─────────────────────────
// opts = { count = 100, knownEL = [], knownES = [] } — `count` blank blocks per
// section after any known devices pre-filled from the last inspection.
async function buildBlankExitSignFormBytes(opts) {
  if (!window.PDFLib) throw new Error('PDF library not loaded. Please refresh.');
  const { count = 100, knownEL = [], knownES = [] } = opts || {};
  const { PDFDocument, StandardFonts } = window.PDFLib;
  const pdfDoc = await PDFDocument.create();
  const hFont  = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const rFont  = await pdfDoc.embedFont(StandardFonts.Helvetica);

  const { page, curY } = _blankFormHeader(
    pdfDoc, hFont, rFont,
    'EXIT SIGN & EMERGENCY LIGHTING - FIELD WORKSHEET',
    ['ANNUAL', 'SEMI-ANNUAL', 'MONTHLY']
  );
  const ctx = _makeBlankFormCtx(pdfDoc, hFont, rFont, page, curY);

  const unitBlock2 = (num, d, checkCols) => ctx.unitBlock(num, [
    { h: 24, segs: [
      { t: 'num',  w: 28 },
      { t: 'open', label: 'LOCATION', w: 340, value: d.loc || d.location },
      { t: 'open', label: 'TYPE',     w: 172, value: d.type },
    ] },
    { h: 30, segs: checkCols.concat([{ t: 'open', label: 'COMMENTS', w: 186 }]) },
  ]);

  ctx.secHdr('EMERGENCY LIGHTING UNITS (NFPA 101 7.9)');
  ctx.note('One block per unit. Write Location / Type / Comments; mark an X in the box for each test result. 30-SEC: button test. 90-MIN: full-duration test. Use N/A when a test was not performed.' +
    (knownEL.length ? ' Pre-filled rows are from the last inspection — confirm and mark results.' : ''));
  const elCols = () => [
    { t: 'check', label: '30-SEC',      w: 90,  opts: ['P', 'F', 'N/A'] },
    { t: 'check', label: '90-MIN',      w: 90,  opts: ['P', 'F', 'N/A'] },
    { t: 'check', label: 'BATTERY',     w: 96,  opts: ['P', 'F', 'N/A'] },
    { t: 'check', label: 'PASS / FAIL', w: 78,  opts: ['P', 'F'] },
  ];
  let en = 0;
  knownEL.forEach(d => unitBlock2(++en, d || {}, elCols()));
  for (let i = 0; i < count; i++) unitBlock2(++en, {}, elCols());

  ctx.secHdr('EXIT SIGNS (NFPA 101 7.10)');
  ctx.note('One block per sign. Write Location / Type / Comments; mark an X in the box for each result. ILLUMINATED: legend lit & legible. ARROWS: correct direction. BATT BKUP: illuminates on battery.' +
    (knownES.length ? ' Pre-filled rows are from the last inspection — confirm and mark results.' : ''));
  const esCols = () => [
    { t: 'check', label: 'ILLUMINATED', w: 96,  opts: ['P', 'F', 'N/A'] },
    { t: 'check', label: 'ARROWS',      w: 84,  opts: ['P', 'F', 'N/A'] },
    { t: 'check', label: 'BATT BKUP',   w: 96,  opts: ['P', 'F', 'N/A'] },
    { t: 'check', label: 'PASS / FAIL', w: 78,  opts: ['P', 'F'] },
  ];
  let sn = 0;
  knownES.forEach(d => unitBlock2(++sn, d || {}, esCols()));
  for (let i = 0; i < count; i++) unitBlock2(++sn, {}, esCols());

  ctx.linedBlock('EXIT SIGN & LIGHTING NOTES / DEFICIENCIES', 6);

  return await pdfDoc.save();
}

// ─────────────────────────────────────────────────────────────────────────────
// DISPATCH + DOWNLOAD — shared by inspection.html AND hospital-inspection.html
// (both load this file). Extinguishers are identical on both pages; the hospital
// stores its device list under the single `hospital` profile record, so the
// prefill falls back to it (this is how the hospital's 145 extinguishers land on
// the worksheet).
// ─────────────────────────────────────────────────────────────────────────────

// Blank printable field worksheet for a system (extinguisher / exit-sign).
// Falls back to the active system when none is passed. Returns null otherwise.
function buildActiveBlankFormBytes(system, opts) {
  switch (system || (typeof activeInspectionSystem !== 'undefined' ? activeInspectionSystem : '')) {
    case 'extinguisher':       return buildBlankExtinguisherFormBytes(opts);
    case 'exit-sign-lighting': return buildBlankExitSignFormBytes(opts);
    default:                   return null;
  }
}

// Read row count + "pre-fill known devices" toggle from the worksheet controls
// (same ids on both pages), and gather known devices from the property profile.
// Extinguishers: prefer the dedicated per-system record, else the hospital
// record (the 145). Exit-sign device lists only exist on the standard flow.
function _blankFormOpts(sys) {
  let count = parseInt(document.getElementById('blank-row-count')?.value, 10);
  if (!Number.isFinite(count) || count < 1) count = 100;
  count = Math.min(count, 300);
  const prefill = !!document.getElementById('blank-prefill-known')?.checked;
  // _propertyProfile is a script-scope `let` (inspection-config.js), not a window
  // property — reference the bare global, guarded for pages that lack it.
  const prof = (typeof _propertyProfile !== 'undefined' && _propertyProfile) ? _propertyProfile : null;
  const byS = (prof && prof.lastInspBySystem) || {};
  if (sys === 'exit-sign-lighting') {
    const rec = prefill ? (byS['exit-sign-lighting'] || byS.hospital) : null;
    return { count, knownEL: rec?.elUnits || [], knownES: rec?.esUnits || [] };
  }
  const rec = prefill ? (byS.extinguisher || byS.hospital) : null;
  return { count, known: rec?.extinguishers || [] };
}

// Build + download the blank worksheet so it can be printed and filled by hand.
// Pass a system explicitly (start-screen / hospital buttons) or omit it to use
// the active system. Pre-fills the property header when one is selected.
async function downloadBlankForm(system) {
  const sys = system || (typeof activeInspectionSystem !== 'undefined' ? activeInspectionSystem : '');
  const opts = _blankFormOpts(sys);
  const build = buildActiveBlankFormBytes(sys, opts);
  if (!build) { if (typeof toast === 'function') toast('⚠ A blank worksheet is available for extinguishers and exit signs/lighting.'); return; }
  try {
    const pdfBytes = await build;
    const propName = (document.getElementById('property-name')?.value || document.getElementById('property-select')?.value || '').trim();
    const propSlug = (propName || 'blank').replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 40);
    const sysSlug  = sys.replace(/-/g, '_');
    const blob = new Blob([pdfBytes], { type: 'application/pdf' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url; a.download = `FLPS_WORKSHEET_${sysSlug}_${propSlug}.pdf`; a.click();
    URL.revokeObjectURL(url);
    if (typeof toast === 'function') toast('🖨 Blank worksheet downloaded — print and fill by hand');
  } catch (e) {
    if (typeof toast === 'function') toast('✗ Worksheet failed: ' + e.message);
    alert('Blank worksheet failed: ' + e.message);
  }
}
