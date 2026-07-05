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
// Only the shared cover header (via drawReportHeader) uses fillable form fields
// and pre-fills the property name/address when a property is selected;
// Job/PO/Date/Inspector print blank for hand entry. Everything else is drawn.
//
// Loaded AFTER inspection-pdf-editable.js (needs drawReportHeader), and after
// inspection-pdf-scale.js / inspection-pdf-components.js (sc, pdfSafe,
// inspPdfColors) and inspection-pdf-layout.js (wrapText).
//
// Dispatched by buildActiveBlankFormBytes() → downloadBlankForm() (inspection-main.js).
// ─────────────────────────────────────────────────────────────────────────────

// Shared page/geometry primitives for a worksheet builder. Seeds onto an existing
// page/cursor (the header page) so the body continues below the cover header.
// Everything is in absolute points (US Letter 612×792), unscaled.
function _makeBlankFormCtx(pdfDoc, hFont, rFont, initialPage, initialCurY) {
  const rgb = window.PDFLib.rgb;
  const { navy, sky, white } = inspPdfColors(rgb);
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
  //          'open'  → caption + blank writing area (with a light baseline)
  //          'check' → caption + ☐ boxes, each followed by its option label
  //   seg: { t, label, w, opts?:[string…] }
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
        } else if (seg.t === 'check') {
          const bs = 10;                 // box size
          const by = lineBotY + 4;       // boxes sit near the bottom of the line
          let bx = x + 3;
          seg.opts.forEach(op => {
            page.drawRectangle({ x: bx, y: by, width: bs, height: bs, borderColor: boxInk, borderWidth: 1 });
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

// Draw the shared cover header on a fresh first page, pre-filling the property
// (when selected) but leaving Job/PO/Date/Inspector blank for hand entry. Returns
// the header page and the curY beneath it.
async function _blankFormHeader(pdfDoc, form, hFont, rFont, title, freqOptions) {
  const rgb = window.PDFLib.rgb;
  const { FIRE_RED, navy, sky, gold, lgray, white } = inspPdfColors(rgb);
  const W = 612, PH = 792, ML = 36, PW = 540;
  const page = pdfDoc.addPage([W, PH]);
  // Read the property straight from the step-1 fields so the worksheet can be
  // printed before an inspection is started (no active system / no row context,
  // so we avoid collectAllData which is system-context-dependent).
  const fv = (id) => (document.getElementById(id)?.value || '').trim();
  const hdrData = {
    property: {
      name: fv('property-name') || fv('property-select') || fv('service-address'),
      address: fv('service-address'),
      cityStateZip: fv('city-state-zip'),
    },
    inspection: {},
  };
  let n = 0;
  const curY = await drawReportHeader({
    pdfDoc, page, form, hFont, rFont, sc, W, PH, ML, PW,
    fid: () => 'blank_' + (++n),
    data: hdrData, fd: {}, dv: () => '',
    title, freqOptions,
    C: { FIRE_RED, navy, sky, gold, lgray, white, blk: rgb(0, 0, 0) },
  });
  return { page, curY: curY + 6 };
}

// ── PORTABLE FIRE EXTINGUISHER — field worksheet ─────────────────────────────
async function buildBlankExtinguisherFormBytes() {
  if (!window.PDFLib) throw new Error('PDF library not loaded. Please refresh.');
  const { PDFDocument, StandardFonts } = window.PDFLib;
  const pdfDoc = await PDFDocument.create();
  const form   = pdfDoc.getForm();
  const hFont  = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const rFont  = await pdfDoc.embedFont(StandardFonts.Helvetica);

  const { page, curY } = await _blankFormHeader(
    pdfDoc, form, hFont, rFont,
    'PORTABLE FIRE EXTINGUISHER - FIELD WORKSHEET',
    ['ANNUAL', 'SEMI-ANNUAL', 'MONTHLY']
  );
  const ctx = _makeBlankFormCtx(pdfDoc, hFont, rFont, page, curY);

  ctx.secHdr('EXTINGUISHER UNITS');
  ctx.note('One block per extinguisher. Write Location / Floor / MFG Yr / Size / Hydro Due, and mark an X in the box for Mount, Type, and Pass/Fail. Note anything unusual in NOTES.');
  for (let i = 1; i <= 20; i++) {
    ctx.unitBlock(i, [
      { h: 26, segs: [
        { t: 'num', w: 28 },
        { t: 'open',  label: 'FLR',      w: 46 },
        { t: 'open',  label: 'LOCATION', w: 286 },
        { t: 'check', label: 'MOUNT',    w: 180, opts: ['HK', 'WALL', 'CAB', 'STAND'] },
      ] },
      { h: 30, segs: [
        { t: 'open',  label: 'MFG YR',     w: 52 },
        { t: 'open',  label: 'SIZE (LB)',  w: 52 },
        { t: 'check', label: 'TYPE',       w: 210, opts: ['ABC', 'CO2', 'K', 'WATER', 'HALON'] },
        { t: 'open',  label: 'HYDRO DUE',  w: 52 },
        { t: 'check', label: 'PASS / FAIL',w: 94, opts: ['PASS', 'FAIL'] },
        { t: 'open',  label: 'NOTES',      w: 80 },
      ] },
    ]);
  }

  ctx.linedBlock('DEFICIENCIES (describe each failed / missing unit)', 6);
  ctx.linedBlock('GENERAL NOTES', 5);

  return await pdfDoc.save();
}

// ── EXIT SIGN & EMERGENCY LIGHTING — field worksheet ─────────────────────────
async function buildBlankExitSignFormBytes() {
  if (!window.PDFLib) throw new Error('PDF library not loaded. Please refresh.');
  const { PDFDocument, StandardFonts } = window.PDFLib;
  const pdfDoc = await PDFDocument.create();
  const form   = pdfDoc.getForm();
  const hFont  = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const rFont  = await pdfDoc.embedFont(StandardFonts.Helvetica);

  const { page, curY } = await _blankFormHeader(
    pdfDoc, form, hFont, rFont,
    'EXIT SIGN & EMERGENCY LIGHTING - FIELD WORKSHEET',
    ['ANNUAL', 'SEMI-ANNUAL', 'MONTHLY']
  );
  const ctx = _makeBlankFormCtx(pdfDoc, hFont, rFont, page, curY);

  ctx.secHdr('EMERGENCY LIGHTING UNITS (NFPA 101 7.9)');
  ctx.note('One block per unit. Write Location / Type / Comments; mark an X in the box for each test result. 30-SEC: button test. 90-MIN: full-duration test. Use N/A when a test was not performed.');
  for (let i = 1; i <= 14; i++) {
    ctx.unitBlock(i, [
      { h: 24, segs: [
        { t: 'num',  w: 28 },
        { t: 'open', label: 'LOCATION', w: 340 },
        { t: 'open', label: 'TYPE',     w: 172 },
      ] },
      { h: 30, segs: [
        { t: 'check', label: '30-SEC',      w: 90,  opts: ['P', 'F', 'N/A'] },
        { t: 'check', label: '90-MIN',      w: 90,  opts: ['P', 'F', 'N/A'] },
        { t: 'check', label: 'BATTERY',     w: 96,  opts: ['P', 'F', 'N/A'] },
        { t: 'check', label: 'PASS / FAIL', w: 78,  opts: ['P', 'F'] },
        { t: 'open',  label: 'COMMENTS',    w: 186 },
      ] },
    ]);
  }

  ctx.secHdr('EXIT SIGNS (NFPA 101 7.10)');
  ctx.note('One block per sign. Write Location / Type / Comments; mark an X in the box for each result. ILLUMINATED: legend lit & legible. ARROWS: correct direction. BATT BKUP: illuminates on battery.');
  for (let i = 1; i <= 14; i++) {
    ctx.unitBlock(i, [
      { h: 24, segs: [
        { t: 'num',  w: 28 },
        { t: 'open', label: 'LOCATION', w: 340 },
        { t: 'open', label: 'TYPE',     w: 172 },
      ] },
      { h: 30, segs: [
        { t: 'check', label: 'ILLUMINATED', w: 96,  opts: ['P', 'F', 'N/A'] },
        { t: 'check', label: 'ARROWS',      w: 84,  opts: ['P', 'F', 'N/A'] },
        { t: 'check', label: 'BATT BKUP',   w: 96,  opts: ['P', 'F', 'N/A'] },
        { t: 'check', label: 'PASS / FAIL', w: 78,  opts: ['P', 'F'] },
        { t: 'open',  label: 'COMMENTS',    w: 186 },
      ] },
    ]);
  }

  ctx.linedBlock('EXIT SIGN & LIGHTING NOTES / DEFICIENCIES', 6);

  return await pdfDoc.save();
}
