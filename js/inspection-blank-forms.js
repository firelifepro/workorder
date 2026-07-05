// ─────────────────────────────────────────────────────────────────────────────
// BLANK FIELD WORKSHEETS — printable, hand-fill PDF forms.
//
// For inspectors/contractors who'd rather write on paper than tap through the
// wizard (e.g. the extinguisher / exit-sign & lighting contractor). We print a
// clean, numbered grid whose columns match the on-screen panels one-for-one, so:
//   1. it's obvious what to write in each cell, and
//   2. the SAME grid scans back reliably in inspection-scan-import.js (a photo of
//      a controlled layout reads far better than a freeform page).
//
// These draw PLAIN bordered cells (no fillable form fields) — this is a worksheet
// meant to be printed and filled by hand. Only the shared cover header (via
// drawReportHeader) uses form fields, and it pre-fills the property name/address
// when a property is selected; Job/PO/Date/Inspector print blank for hand entry.
//
// Loaded AFTER inspection-pdf-editable.js (needs drawReportHeader), and after
// inspection-pdf-scale.js / inspection-pdf-components.js (sc, pdfSafe,
// inspPdfColors) and inspection-pdf-layout.js (wrapText).
//
// Dispatched by buildActiveBlankFormBytes() (js/inspection-main.js).
// ─────────────────────────────────────────────────────────────────────────────

// Shared page/geometry primitives for a worksheet builder. Seeds onto an existing
// page/cursor (the header page) so the body continues below the cover header.
// rowH is intentionally generous (room to write by hand); everything is in
// absolute points (US Letter 612×792), unscaled.
function _makeBlankFormCtx(pdfDoc, hFont, rFont, initialPage, initialCurY) {
  const rgb = window.PDFLib.rgb;
  const { navy, sky, white } = inspPdfColors(rgb);
  const W = 612, PH = 792, ML = 36, PW = 540, MT = 36, MB = 40;

  let page = initialPage;
  let curY = initialCurY;
  const ry = (h) => PH - curY - h;
  const ty = (h, a = 3) => PH - curY - h + a;
  const addPage = () => { page = pdfDoc.addPage([W, PH]); curY = MT; };
  const checkPage = (needed) => { if (curY + needed > PH - MB) { addPage(); return true; } return false; };

  const secHdr = (title) => {
    const H = 18;
    checkPage(H + 22);
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

  // A numbered grid: navy column-header band (re-drawn on each new page) + `rows`
  // empty bordered rows. cols = [{label, w}] (widths must sum to PW). The first
  // column is auto-populated with the printed row number.
  const grid = (cols, rows, rowH = 22) => {
    const HDR = 15;
    const drawHdr = () => {
      checkPage(HDR + rowH);
      let x = ML;
      cols.forEach(c => {
        page.drawRectangle({ x, y: ry(HDR), width: c.w, height: HDR, color: navy });
        const lines = wrapText(c.label, 6.5, c.w - 4, (s, z) => hFont.widthOfTextAtSize(s, z));
        page.drawText(lines[0] || '', { x: x + 2, y: ty(HDR, 5), size: 6.5, font: hFont, color: white });
        x += c.w;
      });
      curY += HDR;
    };
    drawHdr();
    for (let i = 1; i <= rows; i++) {
      if (checkPage(rowH)) drawHdr();
      let x = ML;
      cols.forEach((c, ci) => {
        page.drawRectangle({ x, y: ry(rowH), width: c.w, height: rowH, color: white, borderColor: sky, borderWidth: 0.5 });
        if (ci === 0) {
          const num = String(i);
          const tw = rFont.widthOfTextAtSize(num, 8);
          page.drawText(num, { x: x + c.w / 2 - tw / 2, y: ty(rowH, rowH / 2 - 1), size: 8, font: rFont, color: rgb(0.4, 0.45, 0.55) });
        }
        x += c.w;
      });
      curY += rowH;
    }
    curY += 8;
  };

  // A block of blank numbered lines for hand-written notes / deficiencies.
  const linedBlock = (title, lines = 6, rowH = 20) => {
    secHdr(title);
    for (let i = 1; i <= lines; i++) {
      checkPage(rowH);
      page.drawRectangle({ x: ML, y: ry(rowH), width: PW, height: rowH, color: white, borderColor: sky, borderWidth: 0.5 });
      page.drawText(i + '.', { x: ML + 4, y: ty(rowH, rowH / 2 - 1), size: 8, font: rFont, color: rgb(0.4, 0.45, 0.55) });
      curY += rowH;
    }
    curY += 8;
  };

  return { secHdr, note, grid, linedBlock };
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

  ctx.note('Log every portable fire extinguisher at this property. MOUNT: HK (hook) / WALL / CAB (cabinet) / STAND. TYPE: ABC / CO2 / K / Water / Halon. Mark PASS or FAIL. Note the year hydro/6-yr is due.');
  ctx.grid([
    { label: '#',         w: 24  },
    { label: 'FLR',       w: 30  },
    { label: 'LOCATION',  w: 150 },
    { label: 'MOUNT',     w: 55  },
    { label: 'MFG YR',    w: 45  },
    { label: 'SIZE (lb)', w: 45  },
    { label: 'TYPE',      w: 55  },
    { label: 'HYDRO DUE', w: 50  },
    { label: 'PASS/FAIL', w: 40  },
    { label: 'NOTES',     w: 46  },
  ], 44);

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
  ctx.note('30-SEC: press test button, verify lamps illuminate. 90-MIN: full-duration annual test. BATTERY: condition/charge. Mark P (pass), F (fail), or N/A per column.');
  ctx.grid([
    { label: '#',         w: 24  },
    { label: 'LOCATION',  w: 180 },
    { label: 'TYPE',      w: 90  },
    { label: '30-SEC',    w: 55  },
    { label: '90-MIN',    w: 55  },
    { label: 'BATTERY',   w: 60  },
    { label: 'PASS/FAIL', w: 76  },
  ], 20);

  ctx.secHdr('EXIT SIGNS (NFPA 101 7.10)');
  ctx.note('ILLUMINATED: legend lit & legible. ARROWS: correct directional arrows. BATT BKUP: illuminates on battery. Mark P (pass), F (fail), or N/A per column.');
  ctx.grid([
    { label: '#',          w: 24  },
    { label: 'LOCATION',   w: 170 },
    { label: 'TYPE',       w: 80  },
    { label: 'ILLUMINATED',w: 60  },
    { label: 'ARROWS',     w: 56  },
    { label: 'BATT BKUP',  w: 74  },
    { label: 'PASS/FAIL',  w: 76  },
  ], 20);

  ctx.linedBlock('EXIT SIGN & LIGHTING NOTES / DEFICIENCIES', 6);

  return await pdfDoc.save();
}
