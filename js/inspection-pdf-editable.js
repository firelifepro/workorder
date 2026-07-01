// ─────────────────────────────────────────────────────────────────────────────
// SHARED REPORT HEADER — identical cover header for every editable inspection PDF.
//
// Draws (top → down): red title banner · logo · FLPS company box · right column
// with the FREQUENCY selector + JOB NUMBER / PO NUMBER / DATE PERFORMED / INSPECTOR
// · BUILDING/PROPERTY NAME · STREET, CITY, STATE, ZIP. (Jurisdiction intentionally
// dropped — never filled.) Spacing lives here ONCE so every system's header lines
// up; only the title + frequency labels change per system.
//
// Returns the new curY (distance from the top of the page) after the header so the
// calling builder can continue its content below it.
//   H = { pdfDoc, page, form, hFont, rFont, sc, W, PH, ML, PW, fid, data, fd, dv,
//         title, freqOptions?, C:{FIRE_RED,navy,sky,gold,lgray,white,blk} }
// ─────────────────────────────────────────────────────────────────────────────
async function drawReportHeader(H) {
  const { pdfDoc, page, form, hFont, rFont, sc, W, PH, ML, PW, fid, data, fd, dv, title, C } = H;
  const { FIRE_RED, navy, sky, gold, lgray, white, blk } = C;
  const rgb = window.PDFLib.rgb;
  const freqOptions = H.freqOptions || ['ANNUAL', 'SEMI-ANNUAL', 'QUARTERLY'];

  let cy = 0;
  const ry = (h) => PH - cy - h;
  const ty = (h, a = 3) => PH - cy - h + a;
  const mkField = (val, x, fy, w, h) => {
    page.drawRectangle({ x, y: fy, width: w, height: h, color: gold, borderColor: sky, borderWidth: 0.5 });
    const f = form.createTextField(fid());
    f.setText(String(val || ''));
    f.addToPage(page, { x: x + 1, y: fy + 1, width: w - 2, height: h - 2, font: rFont });
    f.setFontSize(sc(8));
  };
  const dataRow = (cols, fh = 12, lh = 8, gp = 3) => {
    const FH = sc(fh), LH = sc(lh), GP = sc(gp);
    let x = ML;
    cols.forEach(c => {
      page.drawText((c.label || '') + ':', { x: x + 2, y: ty(LH, LH - sc(3)), size: sc(6), font: hFont, color: navy });
      mkField(c.val, x, ry(LH + FH), c.w, FH);
      x += c.w;
    });
    cy += LH + FH + GP;
  };

  // ── Title banner (leave white space above so printers don't clip the top) ──
  const TOP_PAD = 18, titleH = sc(22);
  page.drawRectangle({ x: 0, y: PH - TOP_PAD - titleH, width: W, height: titleH, color: navy });
  page.drawText(title, { x: W / 2 - hFont.widthOfTextAtSize(title, sc(13)) / 2, y: PH - TOP_PAD - titleH + sc(5), size: sc(13), font: hFont, color: white });
  cy = TOP_PAD + titleH + sc(6);

  // ── Logo + company + right (freq + job) block ──
  const logoAreaH = sc(100);
  const logoX = ML, logoW = 84;
  const infoX = ML + logoW + 4, infoW = 214;
  const rtX = infoX + infoW + 6, rtW = ML + PW - rtX;

  // One box holds the logo (left) + company text (right), drawn first so the logo
  // sits inside it.
  page.drawRectangle({ x: ML, y: ry(logoAreaH), width: logoW + 4 + infoW, height: logoAreaH, color: lgray, borderColor: sky, borderWidth: 0.5 });

  try {
    const svgText = await fetch('logo.svg').then(r => r.text());
    const sizedSvg = svgText.replace('<svg ', '<svg width="400" height="600" ');
    const url = URL.createObjectURL(new Blob([sizedSvg], { type: 'image/svg+xml' }));
    await new Promise((resolve) => {
      const img = new Image();
      img.onload = async () => {
        const s = 3, full = document.createElement('canvas');
        full.width = 400 * s; full.height = 600 * s;
        full.getContext('2d').drawImage(img, 0, 0, full.width, full.height);
        const cropW = 400 * s, cropH = 445 * s, crop = document.createElement('canvas');
        crop.width = cropW; crop.height = cropH;
        crop.getContext('2d').drawImage(full, 0, 0, cropW, cropH, 0, 0, cropW, cropH);
        const ab = Uint8Array.from(atob(crop.toDataURL('image/png').split(',')[1]), c => c.charCodeAt(0)).buffer;
        const logoImg = await pdfDoc.embedPng(ab);
        const d = logoImg.scaleToFit(82, 82);
        page.drawImage(logoImg, { x: logoX, y: ry(logoAreaH) + (logoAreaH - d.height) / 2, width: d.width, height: d.height });
        URL.revokeObjectURL(url); resolve();
      };
      img.onerror = () => { URL.revokeObjectURL(url); resolve(); };
      img.src = url;
    });
  } catch (_) {}

  const compLines = [
    { text: 'Fire Life Protection Systems, Inc.', bold: true,  sz: sc(7.5) },
    { text: '8201 Shaffer Parkway Suite B',       bold: false, sz: sc(7)   },
    { text: 'Littleton, CO 80127',                bold: false, sz: sc(7)   },
    { text: 'Cellular: (303) 726-8847',           bold: false, sz: sc(7)   },
    { text: 'Office: (720) 974-1570',             bold: false, sz: sc(7)   },
    { text: 'Alan.antonio@firelifeprotectionsystems.com', bold: false, sz: sc(7) },
  ];
  // Start the text ~2 lines lower so it centers against the logo (box unchanged).
  let compY = ry(logoAreaH) + logoAreaH - sc(26);
  compLines.forEach(cl => {
    const fnt = cl.bold ? hFont : rFont;
    // Auto-shrink any line (e.g. the long email) so it stays on ONE line inside the box.
    let z = cl.sz;
    while (z > sc(4.5) && fnt.widthOfTextAtSize(cl.text, z) > infoW - 8) z -= 0.5;
    page.drawText(cl.text, { x: infoX + 4, y: compY, size: z, font: fnt, color: blk });
    compY -= z + sc(1.5);
  });

  // Frequency selector (top of right column)
  const rtBoxH = sc(14), rtBW = rtW / freqOptions.length;
  const rtCur = (fd['report-type'] || fd['sp-report-type'] || data.inspection?.reportType || '').toUpperCase();
  freqOptions.forEach((t, i) => {
    const sel = rtCur === t || (t === 'SEMI-ANNUAL' && rtCur.includes('SEMI'));
    const bx = rtX + i * rtBW;
    page.drawRectangle({ x: bx, y: ry(logoAreaH) + logoAreaH - rtBoxH, width: rtBW - 1, height: rtBoxH, color: sel ? rgb(1, 0.85, 0) : white, borderColor: sky, borderWidth: 0.5 });
    page.drawText(t, { x: bx + 2, y: ry(logoAreaH) + logoAreaH - rtBoxH + sc(4.5), size: sc(5.5), font: hFont, color: sel ? rgb(0.4, 0.25, 0) : navy });
  });
  // Job info fields
  const jFields = [
    ['JOB NUMBER',         fd['job-num'] || fd['sp-job-num'] || fd['fa-job-num'] || ''],
    ['PO NUMBER (IF ANY)', fd['po-num'] || ''],
    ['DATE PERFORMED',     dv('insp-date') || data.inspection?.date || fd['insp-date'] || ''],
    ['INSPECTOR',          dv('inspector-name') || data.inspection?.inspectorName || fd['inspector-name'] || ''],
  ];
  let jY = ry(logoAreaH) + logoAreaH - rtBoxH - sc(3);
  jFields.forEach(([lbl, val]) => {
    jY -= sc(6.5);
    page.drawText(lbl, { x: rtX + 2, y: jY, size: sc(5.5), font: hFont, color: navy });
    jY -= sc(10);
    page.drawRectangle({ x: rtX, y: jY, width: rtW, height: sc(10), color: gold, borderColor: sky, borderWidth: 0.3 });
    const jf = form.createTextField(fid());
    jf.setText(val); jf.addToPage(page, { x: rtX + 1, y: jY + 1, width: rtW - 2, height: sc(10) - 2, font: rFont }); jf.setFontSize(sc(7));
    jY -= sc(4); // gap below each field box so the next label isn't cramped
  });
  cy += logoAreaH + sc(4);

  // ── Property rows (no Jurisdiction) ── (extra gap after the name row so the
  // STREET label has breathing room above it)
  dataRow([{ label: 'BUILDING/PROPERTY NAME', val: data.property?.name || '', w: PW }], 12, 8, 6);
  dataRow([{ label: 'STREET, CITY, STATE, ZIP CODE', val: (data.property?.address || '') + (data.property?.cityStateZip ? ', ' + data.property.cityStateZip : ''), w: PW }], 12, 8, 4);

  return cy;
}

// SPRINKLER PDF
// ─────────────────────────────────────────────────────────────────────────────
async function buildExtinguisherPDFBytes() {
  if (!window.PDFLib) throw new Error('PDF library not loaded. Please refresh.');
  const data = collectAllData();
  const { PDFDocument, rgb, StandardFonts } = window.PDFLib;
  const pdfDoc = await PDFDocument.create();
  const form   = pdfDoc.getForm();
  const hFont  = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const rFont  = await pdfDoc.embedFont(StandardFonts.Helvetica);

  const W = 612, PH = 792, ML = 36, PW = 540, MT = 36, MB = 36;
  let page, curY, _fid = 0;
  const fid = () => 'ext_' + (++_fid);

  const FIRE_RED = rgb(0.72, 0.08, 0.08);
  const navy  = rgb(0.13, 0.21, 0.42);
  const sky   = rgb(0.71, 0.80, 0.93);
  const gold  = rgb(1.0,  1.0,  0.75);
  const lgray = rgb(0.94, 0.94, 0.94);
  const white = rgb(1, 1, 1);
  const blk   = rgb(0, 0, 0);

  const addPage = () => { page = pdfDoc.addPage([W, PH]); curY = MT; };
  const ry = (h) => PH - curY - h;
  const ty = (h, a = 3) => PH - curY - h + a;
  const checkPage = (needed) => { if (curY + needed > PH - MB) addPage(); };

  const wrap = (text, sz, maxW) => wrapText(text, sz, maxW, (s, z) => rFont.widthOfTextAtSize(s, z));

  const secHdr = (title) => {
    const H = sc(17);
    checkPage(sc(18));
    page.drawRectangle({ x: ML, y: ry(H), width: PW, height: H, color: navy });
    page.drawText(title, { x: ML+4, y: ty(H,sc(5)), size: sc(9), font: hFont, color: white });
    curY += sc(18);
  };
  const mkField = (val, x, fieldY, w, h) => {
    page.drawRectangle({ x, y: fieldY, width: w, height: h, color: gold, borderColor: sky, borderWidth: 0.5 });
    const f = form.createTextField(fid());
    f.setText(String(val || ''));
    f.addToPage(page, { x: x+1, y: fieldY+1, width: w-2, height: h-2, font: rFont });
    f.setFontSize(sc(8));
  };
  const dataRow = (cols, fh = 12, lh = 8, gp = 3) => {
    const FH = sc(fh), LH = sc(lh), GP = sc(gp);
    checkPage(LH + FH + GP);
    let x = ML;
    cols.forEach(c => {
      page.drawText((c.label||'')+':', { x: x+2, y: ty(LH, LH-sc(3)), size: sc(6), font: hFont, color: navy });
      mkField(c.val, x, ry(LH+FH), c.w, FH);
      x += c.w;
    });
    curY += LH + FH + GP;
  };
  const gap = (h) => { curY += sc(h); };

  const dv = (id) => document.getElementById(id)?.value?.trim() || '';
  const fd = data.fieldData || {};

  // ── PAGE 1: COVER (shared header) ────────────────────────────────────────────
  addPage();
  curY = await drawReportHeader({
    pdfDoc, page, form, hFont, rFont, sc, W, PH, ML, PW, fid, data, fd, dv,
    title: 'PORTABLE FIRE EXTINGUISHER INSPECTION REPORT',
    C: { FIRE_RED, navy, sky, gold, lgray, white, blk }
  });
  gap(4);

  // NFPA 10 compliance block
  secHdr('NFPA 10 COMPLIANCE REFERENCES AND PROCEDURE');
  gap(3); // breathing room so the reference box doesn't touch the header bar
  const nfpaLines = [
    { text: 'ALL PORTABLE FIRE EXTINGUISHER UNITS ARE REQUIRED TO BE THOROUGHLY INSPECTED EACH YEAR BY AN APPROVED SERVICING COMPANY IN ACCORDANCE WITH', bold: false },
    { text: 'THE FOLLOWING NFPA CHAPTER REFERENCES:  NFPA 10 - 2010;  7.1.2, 7.2.2, 7.2.4, and 7.3.1', bold: false },
    { text: '', bold: false },
    { text: 'FREQUENCY:  FIRE EXTINGUISHERS SHALL BE SUBJECTED TO MAINTENANCE AT INTERVALS OF NOT MORE THAN ONE YEAR, AT THE TIME OF HYDROSTATIC TEST,', bold: true },
    { text: 'OR WHEN SPECIFICALLY INDICATED BY AN INSPECTION.', bold: true },
    { text: '', bold: false },
    { text: 'INSPECTION PROCEDURE:', bold: true },
    { text: '  1.  Date of last service', bold: false },
    { text: '  2.  Unit located in designated place', bold: false },
    { text: '  3.  No obstruction of access or visibility', bold: false },
    { text: '  4.  Pressure gauge reading is in proper range', bold: false },
    { text: '  5.  Fullness of unit (hefted or weighed)', bold: false },
    { text: '  6.  Condition of mechanical parts, including safety pin and pull tab seal', bold: false },
    { text: '  7.  Examination of physical condition and label', bold: false },
    { text: '  8.  All portable fire extinguishers shall be hydrostatically tested at intervals not exceeding those specified in NFPA 10, Table 5.2', bold: false },
    { text: '  9.  The inspection tag shall be filled out and attached to unit', bold: false },
    { text: '  10. Inspect seals and tamper indicators', bold: false },
    { text: '  11. Check for obvious physical damage, corrosion, leakage, or clogged nozzle', bold: false },
  ];
  const nfpaLH = sc(7.5);
  const nfpaSize = sc(6);
  // Pre-wrap each reference line to the box width so long sentences don't spill out
  // (blank strings stay as spacer rows).
  const nfpaWrapped = [];
  nfpaLines.forEach(ln => {
    if (!ln.text) { nfpaWrapped.push({ text: '', bold: ln.bold }); return; }
    wrap(ln.text, nfpaSize, PW - 12).forEach(w => nfpaWrapped.push({ text: w, bold: ln.bold }));
  });
  const nfpaBlockH = nfpaWrapped.length * nfpaLH + sc(8);
  checkPage(nfpaBlockH);
  page.drawRectangle({ x: ML, y: ry(nfpaBlockH), width: PW, height: nfpaBlockH, color: lgray, borderColor: sky, borderWidth: 0.3 });
  let nfpaY = ry(nfpaBlockH) + nfpaBlockH - sc(9);
  nfpaWrapped.forEach(ln => {
    if (ln.text) page.drawText(ln.text, { x: ML+5, y: nfpaY, size: nfpaSize, font: ln.bold ? hFont : rFont, color: blk });
    nfpaY -= nfpaLH;
  });
  curY += nfpaBlockH + sc(2);

  // Overall status bar (page 1)
  {
    const stH = sc(18);
    const stVal = (data.overallStatus || '').toUpperCase();
    const stColor = stVal === 'COMPLIANT' ? rgb(0.06, 0.50, 0.22) :
                    stVal === 'DEFICIENT' ? rgb(0.76, 0.10, 0.10) :
                    stVal === 'IMPAIRED'  ? rgb(0.75, 0.38, 0.00) :
                                            rgb(0.38, 0.44, 0.54);
    checkPage(stH + sc(6));
    page.drawRectangle({ x: ML, y: ry(stH), width: PW, height: stH, color: stColor });
    page.drawText('OVERALL SYSTEM STATUS', { x: ML + 8, y: ty(stH, sc(6)), size: sc(6.5), font: hFont, color: white });
    page.drawText(stVal || 'PENDING', { x: ML + 8 + hFont.widthOfTextAtSize('OVERALL SYSTEM STATUS', sc(6.5)) + sc(12), y: ty(stH, sc(6)), size: sc(9.5), font: hFont, color: white });
    curY += stH + sc(6);
  }

  // ── PAGE 2: EXTINGUISHER INVENTORY ───────────────────────────────────────────
  addPage();
  secHdr('EXTINGUISHER UNIT INVENTORY');

  const extCols = [
    { label: '#',         w: 20  },
    { label: 'FLR',       w: 22  },
    { label: 'LOCATION',  w: 85  },
    { label: 'MOUNT',     w: 40  },
    { label: 'CABINET',   w: 48  },
    { label: 'MFG YR',    w: 38  },
    { label: 'SIZE',      w: 44  },
    { label: 'TYPE',      w: 54  },
    { label: 'PASS/FAIL', w: 40  },
    { label: 'HYDRO DUE', w: 40  },
    { label: 'RECHARGE',  w: 36  },
    { label: 'NEW UNIT',  w: 36  },
    { label: 'NOTE',      w: 37  },
  ];

  const extHdrH = sc(13);
  const drawExtHdr = () => {
    checkPage(extHdrH);
    let x = ML;
    extCols.forEach(col => {
      page.drawRectangle({ x, y: ry(extHdrH), width: col.w, height: extHdrH, color: navy });
      page.drawText(wrap(col.label, sc(5), col.w-3)[0]||'', { x: x+2, y: ty(extHdrH,sc(4)), size: sc(5), font: hFont, color: white });
      x += col.w;
    });
    curY += extHdrH + sc(1);
  };
  drawExtHdr();

  const EXT_NOTE_I = 12;
  const drawExtRow = (ext) => {
    const pf = (ext.pf || ext.overall || '').toUpperCase();
    const cabMissing = [ext.cabM === 'Y' ? 'Mallet' : '', ext.cabG === 'Y' ? 'Glass' : '', ext.cabS === 'Y' ? 'Sign' : ''].filter(Boolean).join(', ');
    const noteTxt = ext.noteTxt || '';
    const cells = [
      String(ext.rowNum || ''),
      ext.flr || '',
      ext.location || '',
      ext.mount || '',
      cabMissing,
      ext.mfgYear || ext.mfrDate || '',
      ext.size || '',
      ext.type || '',
      pf,
      ext.hydroDue || '',
      ext.recharge === 'Y' ? 'Y' : 'N',
      ext.newUnit === 'Y' ? 'Y' : 'N',
      noteTxt ? '↓ below' : '',   // note text moves to its own full-width line under the row
    ];
    // Keep the inventory row compact — a long note no longer inflates the row height.
    const cellH = sc(14);
    if (curY + cellH + (noteTxt ? sc(12) : 0) > PH - MB) { addPage(); drawExtHdr(); }
    let x = ML;
    extCols.forEach((col, i) => {
      const isStatus = i === 8;
      const bgColor = isStatus && pf === 'FAIL' ? rgb(0.76, 0.10, 0.10)
                    : isStatus && pf === 'PASS' ? rgb(0.06, 0.50, 0.22)
                    : gold;
      const txtColor = (isStatus && (pf === 'FAIL' || pf === 'PASS')) ? white : blk;
      page.drawRectangle({ x, y: ry(cellH), width: col.w, height: cellH, color: bgColor, borderColor: sky, borderWidth: 0.3 });
      if (isStatus && pf) {
        const tw = hFont.widthOfTextAtSize(pf, sc(6));
        page.drawText(pf, { x: x + col.w/2 - tw/2, y: ty(cellH, sc(4)), size: sc(6), font: hFont, color: txtColor });
      } else if (i === EXT_NOTE_I) {
        page.drawText(cells[i], { x: x+2, y: ty(cellH, sc(4.5)), size: sc(5), font: rFont, color: blk });
      } else {
        const f = form.createTextField(fid());
        f.setText(cells[i]);
        f.addToPage(page, { x: x+1, y: ry(cellH)+1, width: col.w-2, height: cellH-2, font: rFont });
        f.setFontSize(sc(5.5));
      }
      x += col.w;
    });
    curY += cellH + sc(1);
    // Full-width NOTE line beneath the row (multiline, auto-height) when present.
    if (noteTxt) {
      const label = 'Unit #' + (ext.rowNum || '') + ' Note: ' + noteTxt;
      const nh = pdfRowHeight(wrap(label, sc(6.5), PW - 12).length, { lineH: sc(9), pad: sc(4), min: sc(12) });
      checkPage(nh + sc(1));
      page.drawRectangle({ x: ML, y: ry(nh), width: PW, height: nh, color: rgb(1, 1, 0.92), borderColor: sky, borderWidth: 0.3 });
      const nf = form.createTextField(fid());
      nf.setText(label); nf.enableMultiline();
      nf.addToPage(page, { x: ML+2, y: ry(nh)+1, width: PW-4, height: nh-2, font: rFont }); nf.setFontSize(sc(6.5));
      curY += nh + sc(1);
    }
  };

  if (data.extinguishers.length > 0) {
    data.extinguishers.forEach(drawExtRow);
  }
  // Pad to at least 3 rows
  const emptyNeeded = Math.max(0, 3 - data.extinguishers.length);
  for (let i = 0; i < emptyNeeded; i++) {
    drawExtRow({ rowNum: data.extinguishers.length + i + 1 });
  }
  gap(4);

  // ── UNIT STATS (Total / Pass / Fail) ─────────────────────────────────────────
  {
    const total = data.extinguishers.length;
    const pass  = data.extinguishers.filter(e => (e.pf||'').toUpperCase() === 'PASS').length;
    const fail  = data.extinguishers.filter(e => (e.pf||'').toUpperCase() === 'FAIL').length;
    const statH = sc(18), statW = PW / 3;
    checkPage(statH + sc(4));
    const statDefs = [
      { label: 'TOTAL UNITS', val: String(total), color: navy },
      { label: 'PASS',        val: String(pass),  color: rgb(0.06, 0.50, 0.22) },
      { label: 'FAIL',        val: String(fail),  color: fail > 0 ? rgb(0.76, 0.10, 0.10) : rgb(0.38, 0.44, 0.54) },
    ];
    statDefs.forEach((s, si) => {
      const sx = ML + si * statW;
      page.drawRectangle({ x: sx, y: ry(statH), width: statW, height: statH, color: s.color });
      page.drawText(s.label, { x: sx + 6, y: ty(statH, sc(11)), size: sc(6.5), font: hFont, color: white });
      page.drawText(s.val,   { x: sx + 6, y: ty(statH, sc(3)),  size: sc(9),   font: hFont, color: white });
    });
    curY += statH + sc(2);
  }
  gap(6);

  // ── SERVICES DUE NOW SUMMARY ──────────────────────────────────────────────────
  if (data.extSvcTable && data.extSvcTable.some(r => r.yr6 || r.hydro || r.recharge || r.newunit || r.notes)) {
    addPage();
    secHdr('SERVICES DUE NOW SUMMARY');
    gap(4);

    // Services due table header
    const svcCols = [
      { label: 'EXTINGUISHER TYPE', w: 130 },
      { label: '6-YEAR MAINT',      w: 70  },
      { label: 'HYDROSTATIC',       w: 70  },
      { label: 'RECHARGE',          w: 70  },
      { label: 'NEW UNIT',          w: 70  },
      { label: 'NOTES',             w: 130 },
    ];
    const svcHdrH = sc(13);
    checkPage(svcHdrH);
    let sx = ML;
    svcCols.forEach(col => {
      page.drawRectangle({ x: sx, y: ry(svcHdrH), width: col.w, height: svcHdrH, color: navy });
      page.drawText(col.label, { x: sx+2, y: ty(svcHdrH,sc(4)), size: sc(5.5), font: hFont, color: white });
      sx += col.w;
    });
    curY += svcHdrH + sc(1);
    (data.extSvcTable || []).forEach(row => {
      const hasData = row.yr6 || row.hydro || row.recharge || row.newunit || row.notes;
      if (!hasData) return;
      const vals = [row.type, row.yr6||'', row.hydro||'', row.recharge||'', row.newunit||'', row.notes||''];
      const SVC_NOTE_I = 5;
      // Auto-grow the row so the NOTES column wraps instead of clipping.
      const rowH = pdfRowHeight(wrap(vals[SVC_NOTE_I], sc(6), svcCols[SVC_NOTE_I].w - 4).length, { lineH: sc(8), pad: sc(4), min: sc(13) });
      checkPage(rowH + sc(1));
      let rx = ML;
      svcCols.forEach((col, ci) => {
        page.drawRectangle({ x: rx, y: ry(rowH), width: col.w, height: rowH, color: gold, borderColor: sky, borderWidth: 0.3 });
        const f = form.createTextField(fid());
        f.setText(vals[ci]);
        if (ci === SVC_NOTE_I) f.enableMultiline();
        f.addToPage(page, { x: rx+1, y: ry(rowH)+1, width: col.w-2, height: rowH-2, font: rFont }); f.setFontSize(sc(6));
        rx += col.w;
      });
      curY += rowH + sc(1);
    });
    gap(8);

    // Total services due
    if (data.extTotalSvcDue) {
      const tsH = sc(16);
      checkPage(sc(20));
      page.drawRectangle({ x: ML, y: ry(tsH), width: PW, height: tsH, color: lgray, borderColor: sky, borderWidth: 0.3 });
      page.drawText('Total Services Due:', { x: ML+4, y: ty(tsH, sc(5)), size: sc(8), font: hFont, color: navy });
      page.drawText(String(data.extTotalSvcDue), { x: ML+160, y: ty(tsH, sc(5)), size: sc(10), font: hFont, color: navy });
      curY += sc(18);
      gap(4);
    }
  }

  // QA questions — rendered independently of the services-due summary so a clean
  // inspection (no services due) still includes the verification questions
  if (data.extQA && data.extQA.some(q => q.ans)) {
    secHdr('INSPECTION VERIFICATION QUESTIONS');
    const qaLW = 460, qaAW = 80;
    const qaHdrH = sc(13);
    checkPage(qaHdrH);
    page.drawRectangle({ x: ML,      y: ry(qaHdrH), width: qaLW, height: qaHdrH, color: navy });
    page.drawText('QUESTION', { x: ML+2, y: ty(qaHdrH,sc(4)), size: sc(6), font: hFont, color: white });
    page.drawRectangle({ x: ML+qaLW, y: ry(qaHdrH), width: qaAW, height: qaHdrH, color: navy });
    page.drawText('ANSWER', { x: ML+qaLW+4, y: ty(qaHdrH,sc(4)), size: sc(6), font: hFont, color: white });
    curY += qaHdrH + sc(1);
    (data.extQA || []).forEach(qa => {
      const qaSz = sc(6), qaLineH = sc(7);
      const qLines = wrap(qa.q, qaSz, qaLW - 4);
      const ansText = (qa.ans || '') + (qa.note ? ' – ' + qa.note : '');
      const aLines = wrap(ansText, qaSz, qaAW - 4);
      // Auto-grow the row to fit the taller of the question and (now multiline) answer.
      const rowH = pdfRowHeight(Math.max(qLines.length, aLines.length), { lineH: qaLineH, pad: sc(6), min: sc(13) });
      checkPage(rowH + sc(1));
      page.drawRectangle({ x: ML, y: ry(rowH), width: qaLW, height: rowH, color: gold, borderColor: sky, borderWidth: 0.3 });
      qLines.forEach((ln, li) => {
        page.drawText(ln, { x: ML+2, y: ry(rowH) + rowH - sc(6) - li*qaLineH, size: qaSz, font: rFont, color: blk });
      });
      page.drawRectangle({ x: ML+qaLW, y: ry(rowH), width: qaAW, height: rowH, color: gold, borderColor: sky, borderWidth: 0.3 });
      const af = form.createTextField(fid());
      af.setText(ansText); af.enableMultiline();
      af.addToPage(page, { x: ML+qaLW+1, y: ry(rowH)+1, width: qaAW-2, height: rowH-2, font: rFont }); af.setFontSize(qaSz);
      curY += rowH + sc(1);
    });
    gap(8);
  }

  // ── DEFICIENCY LIST ──────────────────────────────────────────────────────────
  secHdr('DEFICIENCY LIST');
  const deficTrs = [...(document.getElementById('generic-defic-tbody')?.querySelectorAll('tr') || [])];
  if (deficTrs.length === 0) {
    const dnH = sc(13);
    checkPage(dnH + sc(1));
    page.drawRectangle({ x: ML, y: ry(dnH), width: PW, height: dnH, color: gold, borderColor: sky, borderWidth: 0.3 });
    page.drawText('No deficiencies noted.', { x: ML+4, y: ty(dnH,sc(4)), size: sc(8), font: rFont, color: blk });
    curY += dnH + sc(1);
  } else {
    deficTrs.forEach((tr, i) => {
      const desc = tr.querySelector('td:nth-child(2) input')?.value?.trim() || '';
      const rh = pdfRowHeight(wrap(desc, sc(7), PW-30).length, { lineH: sc(9), pad: sc(4), min: sc(13) });
      checkPage(rh + sc(1));
      page.drawRectangle({ x: ML,    y: ry(rh), width: 24,     height: rh, color: gold, borderColor: sky, borderWidth: 0.3 });
      page.drawText(String(i+1), { x: ML+8, y: ry(rh) + rh - sc(9), size: sc(7), font: hFont, color: blk });
      page.drawRectangle({ x: ML+24, y: ry(rh), width: PW-24,  height: rh, color: gold, borderColor: sky, borderWidth: 0.3 });
      const nf = form.createTextField(fid());
      nf.setText(desc); nf.enableMultiline();
      nf.addToPage(page, { x: ML+25, y: ry(rh)+1, width: PW-26, height: rh-2, font: rFont }); nf.setFontSize(sc(7));
      curY += rh + sc(1);
    });
  }
  gap(6);

  // ── GENERAL NOTES ─────────────────────────────────────────────────────────────
  secHdr('GENERAL NOTES & RECOMMENDATIONS');
  // Collect general notes from dynamic rows
  const extNotesTbody = document.getElementById('ext-notes-tbody');
  const generalNotes = [];
  if (extNotesTbody) {
    extNotesTbody.querySelectorAll('textarea').forEach(ta => {
      const txt = ta.value.trim();
      if (txt) generalNotes.push(txt);
    });
  }
  // Collect unit notes
  const unitNotes = (data.extinguishers || []).filter(e => e.noteTxt).map(e => 'Unit #' + e.rowNum + (e.location ? ' – ' + e.location : '') + ': ' + e.noteTxt);
  const allNotes = [];
  generalNotes.forEach(n => allNotes.push(n));
  unitNotes.forEach(n => allNotes.push(n));
  const noteRowCount = Math.max(allNotes.length, 3);
  for (let i = 0; i < noteRowCount; i++) {
    const ntxt = allNotes[i] || '';
    const rh = pdfRowHeight(wrap(ntxt, sc(7), PW-30).length, { lineH: sc(12), pad: sc(7), min: sc(18) });
    checkPage(rh + sc(1));
    page.drawRectangle({ x: ML,    y: ry(rh), width: 24,     height: rh, color: gold, borderColor: sky, borderWidth: 0.3 });
    page.drawText(String(i+1), { x: ML+8, y: ry(rh) + rh - sc(9), size: sc(7), font: hFont, color: blk });
    page.drawRectangle({ x: ML+24, y: ry(rh), width: PW-24,  height: rh, color: gold, borderColor: sky, borderWidth: 0.3 });
    const nf = form.createTextField(fid());
    nf.setText(ntxt); nf.enableMultiline();
    nf.addToPage(page, { x: ML+25, y: ry(rh)+1, width: PW-26, height: rh-2, font: rFont }); nf.setFontSize(sc(7));
    curY += rh + sc(1);
  }
  gap(6);

  // ── OVERALL STATUS & SIGNATURES ───────────────────────────────────────────────
  checkPage(sc(120));
  gap(10);
  secHdr('OVERALL STATUS & SIGNATURES');
  gap(3); // small padding so the status row's label clears the header bar above
  dataRow([{ label: 'OVERALL INSPECTION STATUS', val: data.overallStatus || '', w: PW }]);
  gap(12); // extra padding so the signature labels' ascenders clear the status box above

  const sigH = sc(40), sigW = PW / 2 - 6;
  page.drawText('INSPECTOR / OWNER SIGNATURE:', { x: ML, y: ty(sigH) + sigH + sc(2), size: sc(7), font: hFont, color: navy });
  page.drawRectangle({ x: ML, y: ry(sigH), width: sigW, height: sigH, color: gold, borderColor: sky, borderWidth: 0.5 });
  if (sigHasData) {
    try {
      const sigCanvas = document.getElementById('sig-canvas');
      const b64 = sigCanvas.toDataURL('image/png').split(',')[1];
      const ab  = Uint8Array.from(atob(b64), c => c.charCodeAt(0)).buffer;
      const sImg = await pdfDoc.embedPng(ab);
      const sDims = sImg.scaleToFit(sigW - 8, sigH - 8);
      page.drawImage(sImg, { x: ML + 4, y: ry(sigH) + 4, width: sDims.width, height: sDims.height });
    } catch(_) {}
  } else {
    const sf = form.createTextField(fid());
    sf.setText(''); sf.addToPage(page, { x: ML+2, y: ry(sigH)+2, width: sigW-4, height: sigH-4, font: rFont }); sf.setFontSize(sc(9));
  }
  page.drawText('CLIENT SIGNATURE:', { x: ML+PW/2+10, y: ty(sigH) + sigH + sc(2), size: sc(7), font: hFont, color: navy });
  page.drawRectangle({ x: ML+PW/2+8, y: ry(sigH), width: sigW, height: sigH, color: gold, borderColor: sky, borderWidth: 0.5 });
  if (custSigHasData) {
    try {
      const cc = document.getElementById('cust-sig-canvas');
      const b64 = cc.toDataURL('image/png').split(',')[1];
      const ab  = Uint8Array.from(atob(b64), c => c.charCodeAt(0)).buffer;
      const cImg = await pdfDoc.embedPng(ab);
      const cDims = cImg.scaleToFit(sigW - 8, sigH - 8);
      page.drawImage(cImg, { x: ML+PW/2+12, y: ry(sigH) + 4, width: cDims.width, height: cDims.height });
    } catch(_) {}
  } else {
    const cf = form.createTextField(fid());
    cf.setText(''); cf.addToPage(page, { x: ML+PW/2+10, y: ry(sigH)+2, width: sigW-4, height: sigH-4, font: rFont }); cf.setFontSize(sc(9));
  }
  curY += sigH + sc(4);
  dataRow([
    { label: 'INSPECTOR DATE',      val: data.signature?.date || data.inspection?.date || '', w: PW/2 },
    { label: 'CLIENT DATE',         val: fd['cust-sig-date'] || '', w: PW/2 },
  ]);
  dataRow([
    { label: 'INSPECTOR PRINT NAME', val: fd['sig-name'] || data.inspection?.inspectorName || '', w: PW/2 },
    { label: 'CLIENT PRINT NAME',    val: fd['cust-sig-name'] || '', w: PW/2 },
  ]);

  // ── PHOTOS ───────────────────────────────────────────────────────────────────
  if (inspectionPhotos.length > 0) {
    addPage();
    secHdr('INSPECTION PHOTOS');
    const photoW = Math.floor((PW - 10) / 2);
    const photoH = sc(140);
    let col = 0;
    for (let i = 0; i < inspectionPhotos.length; i++) {
      const photo = inspectionPhotos[i];
      checkPage(photoH + 30);
      const px = ML + col * (photoW + 10);
      try {
        const b64 = photo.dataUrl.split(',')[1];
        const ab  = Uint8Array.from(atob(b64), c => c.charCodeAt(0)).buffer;
        const img = photo.dataUrl.startsWith('data:image/png')
          ? await pdfDoc.embedPng(ab) : await pdfDoc.embedJpg(ab);
        const dims = img.scaleToFit(photoW, photoH);
        page.drawImage(img, { x: px, y: ry(photoH) + (photoH - dims.height), width: dims.width, height: dims.height });
      } catch(_) {
        page.drawRectangle({ x: px, y: ry(photoH), width: photoW, height: photoH, color: lgray });
      }
      const badgeH = sc(12);
      page.drawRectangle({ x: px+2, y: ry(photoH)+photoH-badgeH-2, width: sc(40), height: badgeH, color: rgb(0,0,0) });
      page.drawText('Photo ' + (i+1), { x: px+4, y: ry(photoH)+photoH-badgeH+sc(3), size: sc(7), font: hFont, color: white });
      if (photo.note) {
        wrap(photo.note, sc(7), photoW).forEach((l, li) => {
          page.drawText(l, { x: px, y: ry(photoH) - sc(10) - li * sc(9), size: sc(7), font: rFont, color: blk });
        });
      }
      col++;
      if (col >= 2) { col = 0; curY += photoH + sc(22); }
    }
    if (col > 0) curY += photoH + sc(22);
  }

  return await pdfDoc.save();
}

async function buildSprinklerPDFBytes() {
  if (!window.PDFLib) throw new Error('PDF library not loaded. Please refresh.');
  const data = collectAllData();
  const { PDFDocument, rgb, StandardFonts } = window.PDFLib;
  const pdfDoc = await PDFDocument.create();
  const form   = pdfDoc.getForm();
  const hFont  = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const rFont  = await pdfDoc.embedFont(StandardFonts.Helvetica);

  const W = 612, PH = 792, ML = 36, PW = 540, MT = 36, MB = 36;
  let page, curY, _fid = 0;
  const fid = () => 'sp_' + (++_fid);

  const FIRE_RED = rgb(0.72, 0.08, 0.08);
  const navy  = rgb(0.13, 0.21, 0.42);
  const sky   = rgb(0.71, 0.80, 0.93);
  const gold  = rgb(1.0,  1.0,  0.75);
  const lgray = rgb(0.94, 0.94, 0.94);
  const white = rgb(1, 1, 1);
  const blk   = rgb(0, 0, 0);

  const addPage = () => { page = pdfDoc.addPage([W, PH]); curY = MT; };
  const ry = (h) => PH - curY - h;
  const ty = (h, a = 3) => PH - curY - h + a;
  const checkPage = (needed) => { if (curY + needed > PH - MB) addPage(); };

  const wrap = (text, sz, maxW) => wrapText(text, sz, maxW, (s, z) => rFont.widthOfTextAtSize(s, z));

  const secHdr = (title) => {
    checkPage(sc(18));
    page.drawRectangle({ x: ML, y: ry(sc(17)), width: PW, height: sc(17), color: navy });
    page.drawText(title, { x: ML+4, y: ty(sc(17), sc(5)), size: sc(9), font: hFont, color: white });
    curY += sc(18);
  };
  const subHdr = (title) => {
    checkPage(sc(14));
    page.drawRectangle({ x: ML, y: ry(sc(13)), width: PW, height: sc(13), color: sky });
    page.drawText(title, { x: ML+4, y: ty(sc(13), sc(4)), size: sc(7.5), font: hFont, color: navy });
    curY += sc(14);
  };
  const mkField = (val, x, fieldY, w, h, multiline) => {
    page.drawRectangle({ x, y: fieldY, width: w, height: h, color: gold, borderColor: sky, borderWidth: 0.5 });
    const f = form.createTextField(fid());
    f.setText(String(val || ''));
    if (multiline) f.enableMultiline();
    f.addToPage(page, { x: x+1, y: fieldY+1, width: w-2, height: h-2, font: rFont });
    f.setFontSize(sc(8));
  };
  const dataRow = (cols, fh = 12, lh = 8, gap = 3) => {
    const FH = sc(fh), LH = sc(lh), GP = sc(gap);
    checkPage(LH + FH + GP);
    let x = ML;
    cols.forEach(c => {
      page.drawText((c.label||'')+':', { x: x+2, y: ty(LH, LH-sc(3)), size: sc(6), font: hFont, color: navy });
      mkField(c.val, x, ry(LH+FH), c.w, FH, false);
      x += c.w;
    });
    curY += LH + FH + GP;
  };
  const gap = (h) => { curY += sc(h); };
  const table = (hdrs, rows, cellH, wrapCol) => {
    cellH = sc(cellH);
    const drawHdr = () => {
      checkPage(sc(13));
      let x = ML;
      hdrs.forEach(h => {
        page.drawRectangle({ x, y: ry(sc(13)), width: h.w, height: sc(13), color: navy });
        page.drawText(wrap(h.label, sc(6), h.w-3)[0]||'', { x: x+2, y: ty(sc(13), sc(4)), size: sc(6), font: hFont, color: white });
        x += h.w;
      });
      curY += sc(14);
    };
    drawHdr();
    rows.forEach(row => {
      // When wrapCol is set, that column auto-grows the row so long LOCATIONS/NOTES
      // text wraps to more lines instead of overflowing on one line.
      const rowH = (wrapCol != null)
        ? pdfRowHeight(wrap(String(row[wrapCol]||''), sc(7), hdrs[wrapCol].w-4).length, { lineH: sc(9), pad: sc(4), min: cellH })
        : cellH;
      if (curY + rowH > PH - MB) { addPage(); drawHdr(); }
      let x = ML;
      hdrs.forEach((h, i) => {
        page.drawRectangle({ x, y: ry(rowH), width: h.w, height: rowH, color: gold, borderColor: sky, borderWidth: 0.3 });
        const f = form.createTextField(fid());
        f.setText(String(row[i]||''));
        if (wrapCol != null && i === wrapCol) f.enableMultiline();
        f.addToPage(page, { x: x+1, y: ry(rowH)+1, width: h.w-2, height: rowH-2, font: rFont });
        f.setFontSize(sc(7));
        x += h.w;
      });
      curY += rowH + 1;
    });
  };

  const dv = (id) => document.getElementById(id)?.value?.trim() || '';
  const fd = data.fieldData || {};
  const spPF = (rowId) => {
    const val = document.getElementById('row-' + rowId)?.dataset?.val || '';
    return val;
  };

  // Inspection row helper for PDF (Y/N/NA columns)
  const LW = 340, BW = 32, NW = PW - LW - BW*3;
  const inspHdr = () => {
    checkPage(sc(13));
    page.drawRectangle({ x: ML,         y: ry(sc(13)), width: LW,  height: sc(13), color: navy });
    page.drawText('QUESTION', { x: ML+2, y: ty(sc(13), sc(4)), size: sc(6), font: hFont, color: white });
    page.drawRectangle({ x: ML+LW,      y: ry(sc(13)), width: BW,  height: sc(13), color: navy });
    page.drawText('Y', { x: ML+LW+BW/2-3, y: ty(sc(13), sc(4)), size: sc(7), font: hFont, color: white });
    page.drawRectangle({ x: ML+LW+BW,   y: ry(sc(13)), width: BW,  height: sc(13), color: navy });
    page.drawText('N', { x: ML+LW+BW*1.5-3, y: ty(sc(13), sc(4)), size: sc(7), font: hFont, color: white });
    page.drawRectangle({ x: ML+LW+BW*2, y: ry(sc(13)), width: BW,  height: sc(13), color: navy });
    page.drawText('N/A', { x: ML+LW+BW*2.5-6, y: ty(sc(13), sc(4)), size: sc(6), font: hFont, color: white });
    page.drawRectangle({ x: ML+LW+BW*3, y: ry(sc(13)), width: NW,  height: sc(13), color: navy });
    page.drawText('NOTES', { x: ML+LW+BW*3+2, y: ty(sc(13), sc(4)), size: sc(6), font: hFont, color: white });
    curY += sc(14);
  };
  const inspRow = (label, rowId) => {
    const val = spPF(rowId);
    const yVal  = val === 'PASS' ? 'X' : '';
    const nVal  = val === 'FAIL' ? 'X' : '';
    const naVal = val === 'N/A'  ? 'X' : '';
    const noteVal = document.getElementById('sp-defic-note-' + rowId)?.value?.trim() || '';
    // Auto-grow the row to fit the taller of the wrapped label and the (multiline) note.
    const labelLines = wrap(label, sc(6.5), LW - 4);
    const noteLines = wrap(noteVal, sc(6), NW - 4);
    const h = pdfRowHeight(Math.max(labelLines.length, noteLines.length), { lineH: sc(7), pad: sc(6), min: sc(13) });
    checkPage(h + sc(1));
    page.drawRectangle({ x: ML, y: ry(h), width: LW, height: h, color: gold, borderColor: sky, borderWidth: 0.3 });
    labelLines.forEach((ln, li) => {
      page.drawText(ln, { x: ML+2, y: ry(h) + h - sc(6) - li*sc(7), size: sc(6.5), font: rFont, color: blk });
    });
    page.drawRectangle({ x: ML+LW,      y: ry(h), width: BW, height: h, color: gold, borderColor: sky, borderWidth: 0.3 });
    const yf = form.createTextField(fid());
    yf.setText(yVal); yf.addToPage(page, { x: ML+LW+1,      y: ry(h)+1, width: BW-2, height: h-2, font: rFont }); yf.setFontSize(sc(8));
    page.drawRectangle({ x: ML+LW+BW,   y: ry(h), width: BW, height: h, color: gold, borderColor: sky, borderWidth: 0.3 });
    const nf2 = form.createTextField(fid());
    nf2.setText(nVal); nf2.addToPage(page, { x: ML+LW+BW+1,  y: ry(h)+1, width: BW-2, height: h-2, font: rFont }); nf2.setFontSize(sc(8));
    page.drawRectangle({ x: ML+LW+BW*2, y: ry(h), width: BW, height: h, color: gold, borderColor: sky, borderWidth: 0.3 });
    const naf = form.createTextField(fid());
    naf.setText(naVal); naf.addToPage(page, { x: ML+LW+BW*2+1, y: ry(h)+1, width: BW-2, height: h-2, font: rFont }); naf.setFontSize(sc(8));
    page.drawRectangle({ x: ML+LW+BW*3, y: ry(h), width: NW, height: h, color: gold, borderColor: sky, borderWidth: 0.3 });
    const nf = form.createTextField(fid());
    nf.setText(noteVal); nf.enableMultiline();
    nf.addToPage(page, { x: ML+LW+BW*3+1, y: ry(h)+1, width: NW-2, height: h-2, font: rFont }); nf.setFontSize(sc(6));
    curY += h + sc(1);
  };

  // ── PAGE 1: COVER (shared header) ────────────────────────────────────────────
  addPage();
  curY = await drawReportHeader({
    pdfDoc, page, form, hFont, rFont, sc, W, PH, ML, PW, fid, data, fd, dv,
    title: 'FIRE SPRINKLER INSPECTION REPORT',
    C: { FIRE_RED, navy, sky, gold, lgray, white, blk }
  });
  gap(4);

  // NFPA References — two columns
  secHdr('NFPA REFERENCES AND PROCEDURE');
  gap(3); // breathing room so the reference box doesn't touch the header bar
  const nfpaLeft = [
    'ANNUAL INSPECTIONS (PROPERTY SPECIFIC/IF APPLICABLE)',
    '',
    'WET SPRINKLER',
    'NFPA 25 CHAPTER 5.2.1 THRU 5.4.1.5',
    '',
    'DRY VALVE PARTIAL',
    'NFPA 25 CHAPTER 13.4.3.1.1 THRU 13.4.4.1.4',
    '',
    'ANTIFREEZE CHEMICAL',
    'NFPA 25 CHAPTER 5.3.3 THRU 5.3.3.4',
    '',
    'DELUGE VALVE',
    'NFPA 25 CHAPTER 13.4.5.2.2 THRU 13.4.5.2.8',
    '',
    'STANDPIPE ANNUAL/QUARTERLY',
    'NFPA 25 CHAPTER 5.2.1 THRU 5.4.1.5',
  ];
  const nfpaRight = [
    '3 & 5 YEAR INSPECTIONS (PROPERTY SPECIFIC/IF APPLICABLE)',
    '',
    'STANDPIPE HYDROSTATIC (5 YEAR)',
    'NFPA 25 CHAPTER 6.3.2.1 THRU 6.3.2.2.1',
    '',
    'FIRE DEPARTMENT CONNECTION HYDROSTATIC (5 YEAR)',
    'NFPA 25 CHAPTER 13.8.5 (FDC)',
    '',
    'PRESSURE REDUCING VALVE (5 YEAR)',
    'NFPA 25 CHAPTER 13.5 THRU 13.5.3',
    'NFPA 25 CHAPTER 13.4.5.2.2 THRU 13.4.5.2.8',
    '',
    'INTERNAL PIPING INSPECTION (5 YEAR)',
    'NFPA 25 CHAPTER 13.4.2.1',
  ];
  const colW = PW / 2 - 2;
  const nfpaStartY = curY;
  const nfpaLineH = sc(8);
  const maxLines = Math.max(nfpaLeft.length, nfpaRight.length);
  const nfpaTopPad = sc(6); // space above the title line inside the box
  const nfpaBoxH = maxLines * nfpaLineH + nfpaTopPad + sc(4);
  checkPage(nfpaBoxH);
  page.drawRectangle({ x: ML,        y: ry(nfpaBoxH), width: colW, height: nfpaBoxH, color: lgray, borderColor: sky, borderWidth: 0.3 });
  page.drawRectangle({ x: ML+colW+4, y: ry(nfpaBoxH), width: colW, height: nfpaBoxH, color: lgray, borderColor: sky, borderWidth: 0.3 });
  // Shrink only the (few) lines wider than the column so titles like
  // "3 & 5 YEAR INSPECTIONS (PROPERTY SPECIFIC/IF APPLICABLE)" stay inside the box.
  const fitSize = (ln, fnt) => { let z = sc(6); while (z > sc(4.5) && fnt.widthOfTextAtSize(ln, z) > colW - 8) z -= 0.5; return z; };
  const nfpaLineY = (i) => ry(nfpaBoxH) + nfpaBoxH - nfpaTopPad - i * nfpaLineH - sc(2);
  nfpaLeft.forEach((ln, i) => {
    const bold = !ln.startsWith('NFPA') && ln !== '';
    const fnt = bold ? hFont : rFont;
    page.drawText(ln, { x: ML+3, y: nfpaLineY(i), size: fitSize(ln, fnt), font: fnt, color: blk });
  });
  nfpaRight.forEach((ln, i) => {
    const bold = !ln.startsWith('NFPA') && ln !== '';
    const fnt = bold ? hFont : rFont;
    page.drawText(ln, { x: ML+colW+7, y: nfpaLineY(i), size: fitSize(ln, fnt), font: fnt, color: blk });
  });
  curY += nfpaBoxH + sc(2);

  // ── OVERALL STATUS — shown on page 1 (also rendered again at end of report) ──
  {
    const stH = sc(18);
    const stVal = (data.overallStatus || '').toUpperCase();
    const stColor = stVal === 'COMPLIANT' ? rgb(0.06, 0.50, 0.22) :
                    stVal === 'DEFICIENT' ? rgb(0.76, 0.10, 0.10) :
                    stVal === 'IMPAIRED'  ? rgb(0.75, 0.38, 0.00) :
                                            rgb(0.38, 0.44, 0.54);
    checkPage(stH + 4);
    page.drawRectangle({ x: ML, y: ry(stH), width: PW, height: stH, color: stColor });
    page.drawText('OVERALL SYSTEM STATUS', { x: ML + 8, y: ty(stH, 6), size: sc(6.5), font: hFont, color: white });
    page.drawText(stVal || 'PENDING', { x: ML + 8 + hFont.widthOfTextAtSize('OVERALL SYSTEM STATUS', sc(6.5)) + sc(12), y: ty(stH, 6), size: sc(9.5), font: hFont, color: white });
    curY += stH + 4;
  }
  gap(4);

  // ── PAGE 2: SYSTEM OVERVIEW ─────────────────────────────────────────────────
  addPage();
  secHdr('SYSTEM CONFIGURATION');
  gap(4);
  dataRow([
    { label: 'SYSTEM TYPE',          val: fd['sp-type']        || '', w: PW/3 },
    { label: 'MANUFACTURER / MAKE',  val: fd['sp-mfr']         || '', w: PW/3 },
    { label: 'YEAR INSTALLED',       val: fd['sp-year']        || '', w: PW/3 },
  ]);
  dataRow([
    { label: '# SPRINKLER HEADS',    val: fd['sp-heads']       || '', w: PW/3 },
    { label: 'COVERAGE AREA (SQ FT)',val: fd['sp-coverage']    || '', w: PW/3 },
    { label: 'HAZARD CLASSIFICATION',val: fd['sp-hazard']      || '', w: PW/3 },
  ]);
  dataRow([
    { label: 'WATER SUPPLY SOURCE',  val: fd['sp-water-src']   || '', w: PW/3 },
    { label: 'STATIC PRESSURE (PSI)',val: fd['sp-static-psi']  || '', w: PW/3 },
    { label: 'RESIDUAL PRESSURE (PSI)',val:fd['sp-residual-psi']|| '', w: PW/3 },
  ]);
  dataRow([
    { label: 'HEAD TYPES / MODELS',  val: fd['sp-head-types']  || '', w: PW/2 },
    { label: 'JOB NUMBER',           val: fd['sp-job-num']     || '', w: PW/2 },
  ]);
  gap(4);

  secHdr('EXISTING SPRINKLER SYSTEMS OVERVIEW');
  const ovRows = [
    ['Wet System(s) Present?',       fd['sp-ov-wet-yn']||'',   fd['sp-ov-wet-cnt']||'',   fd['sp-ov-wet-insp']||'',   fd['sp-ov-wet-loc']||''],
    ['Dry System(s) Present?',       fd['sp-ov-dry-yn']||'',   fd['sp-ov-dry-cnt']||'',   fd['sp-ov-dry-insp']||'',   fd['sp-ov-dry-loc']||''],
    ['Fire Pump(s) Present?',        fd['sp-ov-pump-yn']||'',  fd['sp-ov-pump-cnt']||'',  fd['sp-ov-pump-insp']||'',  fd['sp-ov-pump-loc']||''],
    ['Test Header(s) Present?',      fd['sp-ov-hdr-yn']||'',   fd['sp-ov-hdr-cnt']||'',   fd['sp-ov-hdr-insp']||'',   fd['sp-ov-hdr-loc']||''],
    ['FDC Present?',                 fd['sp-ov-fdc-yn']||'',   fd['sp-ov-fdc-cnt']||'',   fd['sp-ov-fdc-insp']||'',   fd['sp-ov-fdc-loc']||''],
    ['PRV Valve(s) Present?',        fd['sp-ov-prv-yn']||'',   fd['sp-ov-prv-cnt']||'',   fd['sp-ov-prv-insp']||'',   fd['sp-ov-prv-loc']||''],
    ['Antifreeze System(s) Present?',fd['sp-ov-af-yn']||'',    fd['sp-ov-af-cnt']||'',    fd['sp-ov-af-insp']||'',    fd['sp-ov-af-loc']||''],
    ['Standpipe(s) Present?',        fd['sp-ov-standp-yn']||'',fd['sp-ov-standp-cnt']||'',fd['sp-ov-standp-insp']||'',fd['sp-ov-standp-loc']||''],
    ['Deluge Valve(s) Present?',     fd['sp-ov-del-yn']||'',   fd['sp-ov-del-cnt']||'',   fd['sp-ov-del-insp']||'',   fd['sp-ov-del-loc']||''],
  ];
  table(
    [{label:'QUESTION',w:180},{label:'Y/N/NA',w:45},{label:'#',w:35},{label:'INSPECTING?',w:65},{label:'LOCATIONS/NOTES',w:PW-325}],
    ovRows, 14, 4
  );
  gap(4);

  secHdr('3 & 5 YEAR — PREVIOUS INSPECTION YEAR (IF APPLICABLE)');
  const y35Rows = [
    ['Dry Valve (3 Year Full Trip)', fd['sp-35-dv-app']||'',    fd['sp-35-dv-last']||'',    fd['sp-35-dv-next']||'',    fd['sp-35-dv-insp']||'',    fd['sp-35-dv-loc']||''],
    ['Roof Top Flow (5 Year)',       fd['sp-35-rt-app']||'',    fd['sp-35-rt-last']||'',    fd['sp-35-rt-next']||'',    fd['sp-35-rt-insp']||'',    fd['sp-35-rt-loc']||''],
    ['FDC Hydrostatic (5 Year)',     fd['sp-35-fdc-app']||'',   fd['sp-35-fdc-last']||'',   fd['sp-35-fdc-next']||'',   fd['sp-35-fdc-insp']||'',   fd['sp-35-fdc-loc']||''],
    ['Internal Piping (5 Year)',     fd['sp-35-ip-app']||'',    fd['sp-35-ip-last']||'',    fd['sp-35-ip-next']||'',    fd['sp-35-ip-insp']||'',    fd['sp-35-ip-loc']||''],
    ['Standpipe (5 Year)',           fd['sp-35-standp-app']||'',fd['sp-35-standp-last']||'',fd['sp-35-standp-next']||'',fd['sp-35-standp-insp']||'',fd['sp-35-standp-loc']||''],
  ];
  table(
    [{label:'SERVICE',w:155},{label:'APPLICABLE?',w:65},{label:'LAST YEAR',w:70},{label:'NEXT YEAR DUE',w:75},{label:'INSPECTING?',w:65},{label:'LOCATION/NOTES',w:PW-430}],
    y35Rows, 14, 5
  );

  // ── PAGE 3: PRE-INSPECTION + INSPECTION ITEMS ────────────────────────────────
  addPage();
  secHdr('PRE-INSPECTION GENERAL QUESTIONS');
  const preQs = [
    ['Is the building occupied?', spPF('sp-pre-occupied')],
    ['Has the occupancy classification and hazard or contents remained the same since last inspection?', spPF('sp-pre-occ-same')],
    ['All fire protection systems in service?', spPF('sp-pre-in-svc')],
    ['Has the system remained in service without modification since the last inspection?', spPF('sp-pre-no-mod')],
    ['Was the system free of actuation of devices or alarms since the last inspection?', spPF('sp-pre-no-alarm')],
  ];
  table(
    [{label:'QUESTION',w:340},{label:'Y',w:50},{label:'N',w:50},{label:'N/A',w:PW-440}],
    preQs.map(([q,v]) => [q, v==='PASS'?'X':'', v==='FAIL'?'X':'', v==='N/A'?'X':'']),
    13
  );
  gap(4);

  subHdr('FIRE DEPT CONNECTIONS');
  inspHdr();
  ['sp-fdc-visible','sp-fdc-couplings','sp-fdc-caps','sp-fdc-gaskets','sp-fdc-sign','sp-fdc-check','sp-fdc-drain'].forEach(id => {
    const el = document.getElementById('row-' + id);
    const lbl = el?.querySelector('.inspect-label')?.childNodes[0]?.textContent?.trim() || id;
    inspRow(lbl, id);
  });
  gap(3);

  subHdr('VALVES / GAGES');
  inspHdr();
  ['sp-cv-supervised','sp-bfv-position','sp-bfv-sealed','sp-bfv-leaks','sp-bfv-test','sp-gauges-cond','sp-gauges-pressure','sp-prv-open','sp-prv-handles','sp-nameplate','sp-signage'].forEach(id => {
    const el = document.getElementById('row-' + id);
    const lbl = el?.querySelector('.inspect-label')?.childNodes[0]?.textContent?.trim() || id;
    inspRow(lbl, id);
  });
  gap(3);

  subHdr('VISIBLE PIPE');
  inspHdr();
  ['sp-pipe-cond','sp-pipe-damage','sp-pipe-aligned','sp-hangers-cond','sp-pipe-heat'].forEach(id => {
    const el = document.getElementById('row-' + id);
    const lbl = el?.querySelector('.inspect-label')?.childNodes[0]?.textContent?.trim() || id;
    inspRow(lbl, id);
  });
  gap(3);

  subHdr('SPRINKLER HEADS / COMPONENTS');
  inspHdr();
  ['sp-head-box','sp-head-wrench','sp-head-count-ok','sp-heads-corrosion','sp-heads-obstruction','sp-heads-paint','sp-heads-date','sp-heads-fast','sp-heads-standard','sp-dp-heads','sp-escutcheons'].forEach(id => {
    const el = document.getElementById('row-' + id);
    const lbl = el?.querySelector('.inspect-label')?.childNodes[0]?.textContent?.trim() || id;
    inspRow(lbl, id);
  });
  gap(3);

  subHdr('WATERFLOW ALARM');
  inspHdr();
  ['sp-waterflow','sp-waterflow-cs','sp-wf-cv'].forEach(id => {
    const el = document.getElementById('row-' + id);
    const lbl = el?.querySelector('.inspect-label')?.childNodes[0]?.textContent?.trim() || id;
    inspRow(lbl, id);
  });
  dataRow([
    { label: 'WATERFLOW RESPONSE TIME (SEC)', val: fd['sp-wf-time'] || '', w: PW },
  ]);
  gap(3);

  subHdr('MAIN DRAIN OBSERVATIONS');
  inspHdr();
  ['sp-drain-flow','sp-drain-comparable','sp-drain-flowswitch','sp-drain-obstruction'].forEach(id => {
    const el = document.getElementById('row-' + id);
    const lbl = el?.querySelector('.inspect-label')?.childNodes[0]?.textContent?.trim() || id;
    inspRow(lbl, id);
  });
  gap(3);

  subHdr('DRY PIPE / PRE-ACTION (IF APPLICABLE)');
  inspHdr();
  ['sp-air-pressure','sp-dp-valve','sp-low-air','sp-quick-open'].forEach(id => {
    const el = document.getElementById('row-' + id);
    const lbl = el?.querySelector('.inspect-label')?.childNodes[0]?.textContent?.trim() || id;
    inspRow(lbl, id);
  });
  gap(4); // padding above the trip-test row
  dataRow([
    { label: 'LAST TRIP TEST DATE', val: fd['sp-trip-date'] || '', w: PW/2 },
    { label: 'TRIP PRESSURE (PSI)', val: fd['sp-trip-psi']  || '', w: PW/2 },
  ]);
  gap(3);

  subHdr('5-YEAR ITEMS (IF DUE)');
  inspHdr();
  ['sp-5yr-pipe','sp-5yr-fdc','sp-gauges-5yr'].forEach(id => {
    const el = document.getElementById('row-' + id);
    const lbl = el?.querySelector('.inspect-label')?.childNodes[0]?.textContent?.trim() || id;
    inspRow(lbl, id);
  });
  gap(4); // padding above the next-due-date row
  dataRow([{ label: '5-YEAR ITEMS NEXT DUE DATE', val: fd['sp-5yr-due'] || '', w: PW }]);

  // ── PAGE 4: MAIN DRAIN TEST RESULTS ─────────────────────────────────────────
  addPage();
  secHdr('MAIN DRAIN TEST RESULTS');
  const drainDOMRows = [...(document.getElementById('sp-drain-tbody')?.querySelectorAll('tr') || [])];
  const drainRows = drainDOMRows.map((tr, i) => [
    String(i + 1),
    tr.querySelector('input[type=text]')?.value || '',
    tr.querySelectorAll('input[type=number]')[0]?.value || '',
    tr.querySelectorAll('input[type=number]')[1]?.value || '',
    tr.querySelectorAll('input[type=number]')[2]?.value || '',
  ]);
  if (drainRows.length === 0) drainRows.push(['1', '', '', '', '']);
  table(
    [{label:'#',w:28},{label:'SYSTEM LOCATION',w:PW-268},{label:'STATIC (PSI)',w:80},{label:'RESIDUAL (PSI)',w:80},{label:'POST (PSI)',w:80}],
    drainRows, 14
  );
  gap(6);

  // Deficiency list
  secHdr('WET SPRINKLER DEFICIENCY LIST');
  const spDeficRows = [...(document.getElementById('sp-defic-tbody')?.querySelectorAll('tr') || [])];
  if (spDeficRows.length === 0) {
    checkPage(sc(14));
    page.drawRectangle({ x: ML, y: ry(sc(13)), width: PW, height: sc(13), color: gold, borderColor: sky, borderWidth: 0.3 });
    page.drawText('No deficiencies noted.', { x: ML+4, y: ty(sc(13), sc(4)), size: sc(8), font: rFont, color: blk });
    curY += sc(14);
  } else {
    spDeficRows.forEach((tr, i) => {
      const desc = tr.querySelector('td:nth-child(2) input')?.value?.trim() || '';
      const rh = pdfRowHeight(wrap(desc, sc(7), PW-30).length, { lineH: sc(9), pad: sc(4), min: sc(13) });
      checkPage(rh + 1);
      page.drawRectangle({ x: ML,    y: ry(rh), width: 24,     height: rh, color: gold, borderColor: sky, borderWidth: 0.3 });
      page.drawText(String(i+1), { x: ML+8, y: ry(rh) + rh - 9, size: sc(7), font: hFont, color: blk });
      const nf = form.createTextField(fid());
      nf.setText(desc); nf.enableMultiline();
      page.drawRectangle({ x: ML+24, y: ry(rh), width: PW-24, height: rh, color: gold, borderColor: sky, borderWidth: 0.3 });
      nf.addToPage(page, { x: ML+25, y: ry(rh)+1, width: PW-26, height: rh-2, font: rFont });
      nf.setFontSize(sc(7));
      curY += rh + 1;
    });
  }
  gap(6);

  // General notes
  secHdr('GENERAL NOTES & SITE OBSERVATIONS');
  const spNoteRows = [...(document.getElementById('sp-notes-tbody')?.querySelectorAll('tr') || [])];
  const noteRowCount = Math.max(spNoteRows.length, 3);
  for (let i = 0; i < noteRowCount; i++) {
    const note = i < spNoteRows.length ? (spNoteRows[i].querySelector('td:nth-child(2) input')?.value?.trim() || '') : '';
    const rh = pdfRowHeight(wrap(note, sc(7), PW-30).length, { lineH: sc(9), pad: sc(4), min: sc(13) });
    checkPage(rh + 1);
    page.drawRectangle({ x: ML,    y: ry(rh), width: 24,     height: rh, color: gold, borderColor: sky, borderWidth: 0.3 });
    page.drawText(String(i+1), { x: ML+8, y: ry(rh) + rh - 9, size: sc(7), font: hFont, color: blk });
    const nf = form.createTextField(fid());
    nf.setText(note); nf.enableMultiline();
    page.drawRectangle({ x: ML+24, y: ry(rh), width: PW-24, height: rh, color: gold, borderColor: sky, borderWidth: 0.3 });
    nf.addToPage(page, { x: ML+25, y: ry(rh)+1, width: PW-26, height: rh-2, font: rFont });
    nf.setFontSize(sc(7));
    curY += rh + 1;
  }

  // ── SIGNATURES ───────────────────────────────────────────────────────────────
  checkPage(sc(120));
  gap(10);
  secHdr('OVERALL STATUS & SIGNATURES');
  gap(4);

  // Overall status
  const statusVal = data.overallStatus || '';
  dataRow([{ label: 'OVERALL INSPECTION STATUS', val: statusVal, w: PW }]);
  gap(12);

  // Inspector signature
  const sigH = sc(40);
  const sigW = PW / 2 - 6;
  page.drawText('INSPECTOR / OWNER SIGNATURE:', { x: ML, y: ty(sigH) + sigH + 2, size: sc(7), font: hFont, color: navy });
  page.drawRectangle({ x: ML, y: ry(sigH), width: sigW, height: sigH, color: gold, borderColor: sky, borderWidth: 0.5 });
  if (sigHasData) {
    try {
      const sigCanvas = document.getElementById('sig-canvas');
      const b64 = sigCanvas.toDataURL('image/png').split(',')[1];
      const ab  = Uint8Array.from(atob(b64), c => c.charCodeAt(0)).buffer;
      const sImg  = await pdfDoc.embedPng(ab);
      const sDims = sImg.scaleToFit(sigW - 8, sigH - 8);
      page.drawImage(sImg, { x: ML + 4, y: ry(sigH) + 4, width: sDims.width, height: sDims.height });
    } catch(_) {}
  } else {
    const sf = form.createTextField(fid());
    sf.setText('');
    sf.addToPage(page, { x: ML+2, y: ry(sigH)+2, width: sigW-4, height: sigH-4, font: rFont });
    sf.setFontSize(sc(9));
  }
  // Client signature
  page.drawText('CLIENT SIGNATURE:', { x: ML+PW/2+10, y: ty(sigH) + sigH + 2, size: sc(7), font: hFont, color: navy });
  page.drawRectangle({ x: ML+PW/2+8, y: ry(sigH), width: sigW, height: sigH, color: gold, borderColor: sky, borderWidth: 0.5 });
  if (custSigHasData) {
    try {
      const cc  = document.getElementById('cust-sig-canvas');
      const b64 = cc.toDataURL('image/png').split(',')[1];
      const ab  = Uint8Array.from(atob(b64), c => c.charCodeAt(0)).buffer;
      const cImg  = await pdfDoc.embedPng(ab);
      const cDims = cImg.scaleToFit(sigW - 8, sigH - 8);
      page.drawImage(cImg, { x: ML+PW/2+12, y: ry(sigH) + 4, width: cDims.width, height: cDims.height });
    } catch(_) {}
  } else {
    const cf = form.createTextField(fid());
    cf.setText('');
    cf.addToPage(page, { x: ML+PW/2+10, y: ry(sigH)+2, width: sigW-4, height: sigH-4, font: rFont });
    cf.setFontSize(sc(9));
  }
  curY += sigH + 4;
  dataRow([
    { label: 'INSPECTOR DATE', val: data.signature?.date || data.inspection?.date || '', w: PW/2 },
    { label: 'CLIENT DATE',    val: fd['cust-sig-date'] || '', w: PW/2 },
  ]);
  dataRow([
    { label: 'INSPECTOR PRINT NAME', val: fd['sig-name'] || data.inspection?.inspectorName || '', w: PW/2 },
    { label: 'CLIENT PRINT NAME',    val: fd['cust-sig-name'] || '', w: PW/2 },
  ]);

  // Photos page
  if (inspectionPhotos.length > 0) {
    addPage();
    secHdr('INSPECTION PHOTOS');
    const photoW = Math.floor((PW - 10) / 2);
    const photoH = sc(140);
    let col = 0;
    for (let i = 0; i < inspectionPhotos.length; i++) {
      const photo = inspectionPhotos[i];
      checkPage(photoH + 30);
      const px = ML + col * (photoW + 10);
      try {
        const b64 = photo.dataUrl.split(',')[1];
        const ab  = Uint8Array.from(atob(b64), c => c.charCodeAt(0)).buffer;
        const img = photo.dataUrl.startsWith('data:image/png')
          ? await pdfDoc.embedPng(ab) : await pdfDoc.embedJpg(ab);
        const dims = img.scaleToFit(photoW, photoH);
        page.drawImage(img, { x: px, y: ry(photoH) + (photoH - dims.height), width: dims.width, height: dims.height });
      } catch(_) {
        page.drawRectangle({ x: px, y: ry(photoH), width: photoW, height: photoH, color: lgray });
      }
      page.drawRectangle({ x: px+2, y: ry(photoH)+photoH-14, width: 40, height: sc(12), color: rgb(0,0,0) });
      page.drawText('Photo ' + (i+1), { x: px+4, y: ry(photoH)+photoH-7, size: sc(7), font: hFont, color: white });
      if (photo.note) {
        const noteLines = wrap(photo.note, sc(7), photoW);
        noteLines.forEach((l, li) => {
          page.drawText(l, { x: px, y: ry(photoH) - sc(10) - li*sc(9), size: sc(7), font: rFont, color: blk });
        });
      }
      col++;
      if (col >= 2) { col = 0; curY += photoH + 22; }
    }
    if (col > 0) curY += photoH + 22;
  }

  return await pdfDoc.save();
}

// ─────────────────────────────────────────────────────────────────────────────
// GENERIC SYSTEM PDF (fire-pump, standpipe, hood, hydrant, bda, smoke-control,
// gas-detection, special-suppression, backflow) — pdf-lib editable format
// ─────────────────────────────────────────────────────────────────────────────
async function buildGenericSystemPDFBytes() {
  if (!window.PDFLib) throw new Error('PDF library not loaded. Please refresh.');
  const data = collectAllData();
  const { PDFDocument, rgb, StandardFonts } = window.PDFLib;
  const pdfDoc = await PDFDocument.create();
  const form   = pdfDoc.getForm();
  const hFont  = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const rFont  = await pdfDoc.embedFont(StandardFonts.Helvetica);

  const W = 612, PH = 792, ML = 36, PW = 540, MT = 36, MB = 36;
  let page, curY, _fid = 0;
  const fid = () => 'gen_' + (++_fid);

  const FIRE_RED = rgb(0.72, 0.08, 0.08);
  const navy  = rgb(0.13, 0.21, 0.42);
  const sky   = rgb(0.71, 0.80, 0.93);
  const gold  = rgb(1.0, 1.0, 0.75);
  const lgray = rgb(0.94, 0.94, 0.94);
  const white = rgb(1, 1, 1);
  const green = rgb(0.06, 0.50, 0.22);
  const red   = rgb(0.76, 0.10, 0.10);
  const amber = rgb(0.75, 0.38, 0.00);
  const slate = rgb(0.39, 0.45, 0.55);

  const addPage = () => { page = pdfDoc.addPage([W, PH]); curY = MT; };
  const ry = (h) => PH - curY - h;
  const ty = (h, a = 3) => PH - curY - h + a;
  const checkPage = (needed) => { if (curY + needed > PH - MB) addPage(); };
  const gap = (h) => { curY += sc(h); };

  const wrap = (text, sz, maxW) => wrapText(text, sz, maxW, (s, z) => rFont.widthOfTextAtSize(s, z));

  const secHdr = (title) => {
    checkPage(sc(20));
    page.drawRectangle({ x: ML, y: ry(sc(17)), width: PW, height: sc(17), color: navy });
    page.drawText(title, { x: ML+4, y: ty(sc(17), sc(5)), size: sc(9), font: hFont, color: white });
    curY += sc(18);
  };
  const subHdr = (title) => {
    checkPage(sc(14));
    page.drawRectangle({ x: ML, y: ry(sc(12)), width: PW, height: sc(12), color: sky });
    page.drawText(title, { x: ML+4, y: ty(sc(12), sc(4)), size: sc(7.5), font: hFont, color: navy });
    curY += sc(13);
  };
  const mkField = (val, x, fieldY, w, h, ml) => {
    page.drawRectangle({ x, y: fieldY, width: w, height: h, color: gold, borderColor: sky, borderWidth: 0.5 });
    const f = form.createTextField(fid());
    f.setText(String(val || ''));
    if (ml) f.enableMultiline();
    f.addToPage(page, { x: x+1, y: fieldY+1, width: w-2, height: h-2, font: rFont });
    f.setFontSize(sc(8));
  };
  const dataRow = (cols, fh = 12, lh = 8, gp = 3) => {
    const FH = sc(fh), LH = sc(lh), GP = sc(gp);
    checkPage(LH + FH + GP);
    let x = ML;
    cols.forEach(c => {
      page.drawText((c.label||'')+':', { x: x+2, y: ty(LH, LH-sc(3)), size: sc(6), font: hFont, color: navy });
      mkField(c.val, x, ry(LH+FH), c.w, FH);
      x += c.w;
    });
    curY += LH + FH + GP;
  };

  const sys = activeInspectionSystem;
  const meta = SYS_META[sys] || { label: sys, icon: '' };

  // System title map
  const SYS_TITLE = {
    'fire-pump':           'FIRE PUMP INSPECTION REPORT',
    'standpipe':           'STANDPIPE SYSTEM INSPECTION REPORT',
    'hood':                'KITCHEN HOOD SUPPRESSION INSPECTION REPORT',
    'hydrant':             'PRIVATE HYDRANT INSPECTION REPORT',
    'bda':                 'BDA / EMERGENCY RADIO INSPECTION REPORT',
    'smoke-control':       'SMOKE CONTROL SYSTEM INSPECTION REPORT',
    'fire-smoke-damper':   'FIRE & SMOKE DAMPER INSPECTION REPORT',
    'gas-detection':       'GAS DETECTION SYSTEM INSPECTION REPORT',
    'special-suppression': 'SPECIAL SUPPRESSION SYSTEM INSPECTION REPORT',
    'backflow':            'BACKFLOW PREVENTION DEVICE TEST REPORT',
  };
  const NFPA_REF = {
    'fire-pump':'NFPA 25 Ch. 8','standpipe':'NFPA 25 Ch. 6','hood':'NFPA 17A',
    'hydrant':'NFPA 25 Ch. 7','bda':'NFPA 72 Ch. 24','smoke-control':'NFPA 92',
    'fire-smoke-damper':'NFPA 80 Ch.19 / NFPA 105',
    'gas-detection':'NFPA 72','special-suppression':'NFPA 2001 / 12 / 17','backflow':'NFPA 25 13.6 / AWWA',
  };

  // System data fields (ids → labels)
  const SYS_FIELDS = {
    'fire-pump': { sections: [
      { title: 'PUMP INFORMATION', rows: [
        [{label:'Manufacturer',id:'fp-mfr',w:180},{label:'Model',id:'fp-model',w:180},{label:'Serial #',id:'fp-serial',w:180}],
        [{label:'Driver Type',id:'fp-type',w:180},{label:'Rated GPM',id:'fp-rated-gpm',w:180},{label:'Rated PSI',id:'fp-rated-psi',w:180}],
        [{label:'Rated RPM',id:'fp-rpm',w:180},{label:'Horsepower',id:'fp-hp',w:180},{label:'Year Installed',id:'fp-year',w:180}],
      ]},
      { title: 'CHURN / NO-FLOW TEST DATA', rows: [
        [{label:'Churn Suction PSI',id:'fp-churn-suction',w:180},{label:'Churn Discharge PSI',id:'fp-churn-discharge',w:180},{label:'Churn RPM',id:'fp-churn-rpm',w:180}],
        [{label:'Voltage — All Phases',id:'fp-churn-volts',w:270},{label:'Amps — All Phases',id:'fp-churn-amps',w:270}],
      ]},
      { title: '100% FLOW TEST DATA (ANNUAL)', rows: [
        [{label:'Flow Rate (GPM)',id:'fp-flow-gpm',w:135},{label:'Suction PSI',id:'fp-flow-suction',w:135},{label:'Discharge PSI',id:'fp-flow-discharge',w:135},{label:'RPM at Flow',id:'fp-flow-rpm',w:135}],
        [{label:'Voltage at Flow',id:'fp-flow-volts',w:270},{label:'Amps at Flow',id:'fp-flow-amps',w:270}],
      ]},
      { title: 'DIESEL ENGINE DATA (IF APPLICABLE)', rows: [
        [{label:'Oil Pressure (PSI)',id:'fp-diesel-oil',w:180},{label:'Coolant Temp (°F)',id:'fp-diesel-temp',w:180},{label:'Engine Hours',id:'fp-diesel-hours',w:180}],
      ]},
    ]},
    'standpipe': { sections: [
      { title: 'SYSTEM INFORMATION', rows: [
        [{label:'Standpipe Class',id:'std-class',w:180},{label:'System Type',id:'std-type',w:180},{label:'# Standpipes / Risers',id:'std-count',w:180}],
        [{label:'# Floors Served',id:'std-floors',w:270},{label:'# Hose Stations',id:'std-hose-stations',w:270}],
      ]},
      { title: 'PRESSURE READINGS & FLOW TEST', rows: [
        [{label:'PRV Static PSI',id:'std-prv-static',w:180},{label:'PRV Residual PSI',id:'std-prv-residual',w:180},{label:'Flow Test PSI',id:'std-flow-psi',w:180}],
        [{label:'Flow Rate (GPM)',id:'std-flow-gpm',w:270},{label:'Last Flow Test Date',id:'std-flow-date',w:270}],
      ]},
    ]},
    'hood': [
      [{label:'Manufacturer',id:'hood-mfr',w:180},{label:'Model / Cylinder #',id:'hood-model',w:180},{label:'Year Installed',id:'hood-install',w:180}],
      [{label:'Agent Type',id:'hood-agent',w:180},{label:'# Nozzles',id:'hood-nozzle-count',w:180},{label:'Last Service Date',id:'hood-last-service',w:180}],
      [{label:'Cylinder Wt (actual)',id:'hood-cyl-wt-actual',w:180},{label:'Min Acceptable Wt (lbs)',id:'hood-cyl-wt-min',w:180},{label:'Next Service Due',id:'hood-next-service',w:180}],
    ],
    'hydrant': { sections: [
      { title: 'HYDRANT INVENTORY', rows: [
        [{label:'# Private Hydrants',id:'hy-count',w:180},{label:'Hydrant Type',id:'hy-type',w:180},{label:'Last Flow Test Date',id:'hy-last-flow',w:180}],
      ]},
      { title: 'FLOW TEST RESULTS', rows: [
        [{label:'Static Pressure (PSI)',id:'hy-flow-static',w:180},{label:'Residual Pressure (PSI)',id:'hy-flow-residual',w:180},{label:'Flow Rate (GPM)',id:'hy-flow-gpm',w:180}],
      ]},
    ]},
    'bda': { sections: [
      { title: 'SYSTEM INFORMATION', rows: [
        [{label:'BDA Manufacturer',id:'bda-mfr',w:180},{label:'Model',id:'bda-model',w:180},{label:'Year Installed',id:'bda-install',w:180}],
        [{label:'Frequencies Covered',id:'bda-freqs',w:180},{label:'Floors / Areas Covered',id:'bda-coverage-floors',w:180},{label:'AHJ Cert / FCC License',id:'bda-ahj-cert',w:180}],
      ]},
      { title: 'SIGNAL READINGS', rows: [
        [{label:'Min Signal Recorded (dBm)',id:'bda-min-signal',w:270},{label:'Worst Coverage Location',id:'bda-worst-loc',w:270}],
      ]},
      { title: 'SCHEDULING', rows: [
        [{label:'Next Required Test Date',id:'bda-next-test',w:540}],
      ]},
    ]},
    'smoke-control': { sections: [
      { title: 'SYSTEM CONFIGURATION', rows: [
        [{label:'System Type',id:'sc-type',w:180},{label:'# Smoke Zones',id:'sc-zones',w:180},{label:'Year Installed',id:'sc-year',w:180}],
        [{label:'# Supply/Exhaust Fans',id:'sc-fans',w:180},{label:'# Smoke/Fire Dampers',id:'sc-dampers',w:180},{label:'Measured ΔP (in. w.g.)',id:'sc-pressure-val',w:180}],
      ]},
    ]},
    'gas-detection': { sections: [
      { title: 'SYSTEM INFORMATION', rows: [
        [{label:'Manufacturer',id:'gd-mfr',w:180},{label:'Model',id:'gd-model',w:180},{label:'Gas Type Monitored',id:'gd-gas-type',w:180}],
        [{label:'# Sensors',id:'gd-sensor-count',w:180},{label:'# Zones',id:'gd-zones',w:180},{label:'Year Installed',id:'gd-install-date',w:180}],
      ]},
      { title: 'ALARM SETPOINTS', rows: [
        [{label:'Low Alarm Setpoint',id:'gd-alarm-setpoint-lo',w:270},{label:'High Alarm Setpoint',id:'gd-alarm-setpoint-hi',w:270}],
      ]},
      { title: 'SENSOR REPLACEMENT', rows: [
        [{label:'Sensor Age / Last Replaced',id:'gd-sensor-age',w:270},{label:'Next Replacement Due',id:'gd-sensor-due',w:270}],
      ]},
    ]},
    'special-suppression': { sections: [
      { title: 'SYSTEM INFORMATION', rows: [
        [{label:'System Type',id:'ss-type',w:180},{label:'Manufacturer',id:'ss-mfr',w:180},{label:'Protected Hazard / Area',id:'ss-area',w:180}],
        [{label:'Agent Name / Chemical',id:'ss-agent',w:180},{label:'# Cylinders / Containers',id:'ss-cylinders',w:180},{label:'Year Installed',id:'ss-install',w:180}],
      ]},
      { title: 'AGENT QUANTITY & PRESSURE', rows: [
        [{label:'Actual Weight (lbs)',id:'ss-actual-wt',w:180},{label:'Min. Required (lbs)',id:'ss-min-wt',w:180},{label:'Cylinder PSI',id:'ss-pressure',w:180}],
      ]},
      { title: 'SERVICE DATES', rows: [
        [{label:'Last Full Service',id:'ss-last-service',w:270},{label:'Next Service Due',id:'ss-next-service',w:270}],
      ]},
    ]},
    'backflow': { sections: [
      { title: 'DEVICE INFORMATION', rows: [
        [{label:'Manufacturer',id:'bf-mfr',w:180},{label:'Model',id:'bf-model',w:180},{label:'Serial #',id:'bf-serial',w:180}],
        [{label:'Device Type',id:'bf-type',w:180},{label:'Size',id:'bf-size',w:180},{label:'Location',id:'bf-location',w:180}],
        [{label:'Year Installed',id:'bf-install',w:270},{label:'Service (Fire / Irrigation / Domestic)',id:'bf-purpose',w:270}],
      ]},
      { title: 'TEST RESULTS', rows: [
        [{label:'Check 1 Open PSI',id:'bf-check1-open',w:135},{label:'Check 1 Close PSI',id:'bf-check1-close',w:135},{label:'Check 2 Open PSI',id:'bf-check2-open',w:135},{label:'Check 2 Close PSI',id:'bf-check2-close',w:135}],
        [{label:'RV Diff PSI',id:'bf-rv-open',w:180},{label:'Test Date',id:'bf-test-date',w:180},{label:"Tester's Cert #",id:'bf-cert-number',w:180}],
        [{label:'Cert. Expiration Date',id:'bf-cert-exp',w:540}],
      ]},
    ]},
  };

  // Inspection item IDs per system (flat list, used for fire-pump and as fallback)
  const SYS_ITEMS = {
    'fire-pump':   ['fp-controller-cond','fp-controller-auto','fp-jockey-type','fp-jockey-cycles','fp-churn-test','fp-flow-test','fp-diesel-start','fp-diesel-fuel','fp-diesel-battery','fp-diesel-coolant','fp-diesel-run','fp-power-fail-alarm','fp-phase-alarm','fp-room-temp','fp-suction-valve'],
    'hood':        ['hood-cylinder-wt','hood-pull-station','hood-auto-detect','hood-micro-switch','hood-nozzle-cond','hood-nozzle-coverage','hood-duct-protected','hood-gas-shutoff','hood-power-shutoff','hood-fa-integration','hood-ansul-reset','hood-grease-buildup','hood-filter-cond','hood-service-tag'],
  };

  // Sectioned inspection items — when present, INSPECTION RESULTS renders with sub-section headers
  // mirroring the structure of the input panels.
  const SYS_ITEMS_SECTIONED = {
    'standpipe': [
      { title: 'HOSE CONNECTIONS & VALVES', ids: ['std-fdc','std-fdc-sign','std-hose-valves','std-prv','std-check-valve'] },
      { title: 'FLOW TEST',                  ids: ['std-flow-test'] },
      { title: 'HOSE EQUIPMENT (CLASS II/III)', ids: ['std-hose-cond','std-nozzle','std-cabinet'] },
    ],
    'hydrant': [
      { title: 'ANNUAL INSPECTION ITEMS', ids: ['hy-caps','hy-drainage','hy-painted','hy-clearance','hy-operation','hy-gate-valve','hy-outlet-threads'] },
      { title: 'FLOW TEST',               ids: ['hy-flow-test'] },
    ],
    'bda': [
      { title: 'SIGNAL STRENGTH TESTING', ids: ['bda-uplink','bda-downlink','bda-coverage'] },
      { title: 'EQUIPMENT CONDITION',     ids: ['bda-power','bda-backup-power','bda-donor-antenna','bda-internal-antenna','bda-alarms','bda-fa-interface'] },
      { title: 'DOCUMENTATION',           ids: ['bda-permit','bda-coverage-map'] },
    ],
    'smoke-control': [
      { title: 'FAN & EQUIPMENT TESTING', ids: ['sc-fans-op','sc-cfm','sc-pressure'] },
      { title: 'DAMPERS',                 ids: ['sc-dampers-op','sc-fire-dampers','sc-damper-access'] },
      { title: 'CONTROLS & INTEGRATION',  ids: ['sc-control-panel','sc-fa-integration','sc-override','sc-detector-input'] },
    ],
    'gas-detection': [
      { title: 'SENSOR TESTING',     ids: ['gd-sensor-test','gd-alarm-test','gd-gas-shutoff','gd-ventilation'] },
      { title: 'ELECTRONICS & POWER', ids: ['gd-power','gd-backup','gd-control-panel','gd-fa-integration'] },
      { title: 'DOCUMENTATION',       ids: ['gd-calibration-cert'] },
    ],
    'special-suppression': [
      { title: 'AGENT QUANTITY & PRESSURE', ids: ['ss-agent-wt'] },
      { title: 'ACTUATION & DETECTION',     ids: ['ss-detection','ss-pull','ss-abort','ss-discharge-time'] },
      { title: 'NOZZLES & DISTRIBUTION',    ids: ['ss-nozzles','ss-coverage','ss-room-integrity'] },
      { title: 'INTERLOCKS & ALARMS',       ids: ['ss-hvac-shutoff','ss-power-shutoff','ss-fa-integration'] },
      { title: 'DOCUMENTATION',             ids: ['ss-recharge-cert'] },
    ],
    'backflow': [
      { title: 'TEST RESULTS',       ids: ['bf-test','bf-passed'] },
      { title: 'PHYSICAL CONDITION', ids: ['bf-casing','bf-shutoffs','bf-clearance','bf-freeze'] },
    ],
  };
  const NOTES_ID = {
    'standpipe':'std-notes','hood':'hood-notes','hydrant':'hy-notes',
    'bda':'bda-notes','smoke-control':'sc-notes','fire-smoke-damper':'fsd-notes','gas-detection':'gd-notes',
    'special-suppression':'ss-notes','backflow':'bf-notes',
  };

  // ── PAGE 1: HEADER ──────────────────────────────────────────────────────────
  addPage();

  curY = await drawReportHeader({
    pdfDoc, page, form, hFont, rFont, sc, W, PH, ML, PW, fid, data,
    fd: data.fieldData || {},
    dv: (id) => document.getElementById(id)?.value?.trim() || '',
    title: SYS_TITLE[sys] || (meta.label.toUpperCase() + ' INSPECTION REPORT'),
    freqOptions: (sys === 'fire-smoke-damper') ? ['1 YEAR', '4 YEAR', '6 YEAR'] : undefined,
    C: { FIRE_RED, navy, sky, gold, lgray, white, blk: rgb(0, 0, 0) }
  });
  gap(4);

  // Overall status bar
  const stVal = (data.overallStatus || '').toUpperCase();
  const stColor = stVal === 'COMPLIANT' ? green : stVal === 'DEFICIENT' ? red : stVal === 'IMPAIRED' ? amber : slate;
  checkPage(sc(22));
  page.drawRectangle({ x: ML, y: ry(sc(18)), width: PW, height: sc(18), color: stColor });
  page.drawText('OVERALL SYSTEM STATUS', { x: ML+8, y: ty(sc(18), sc(6)), size: sc(6.5), font: hFont, color: white });
  page.drawText(stVal || 'PENDING', { x: ML + 8 + hFont.widthOfTextAtSize('OVERALL SYSTEM STATUS', sc(6.5)) + sc(12), y: ty(sc(18), sc(6)), size: sc(9.5), font: hFont, color: white });
  curY += sc(18);
  gap(6);

  // ── FIRE & SMOKE DAMPERS: test cycle + auto inventory + per-damper table ──────
  // (SYS_FIELDS / SYS_ITEMS_SECTIONED have no 'fire-smoke-damper' entry, so the
  // generic system-info + checklist blocks below skip; deficiencies/notes/photos/
  // signatures still render from the shared code that follows.)
  if (sys === 'fire-smoke-damper') {
    const gv = id => (document.getElementById(id)?.value || '').trim();

    secHdr('TEST CYCLE');
    gap(4);
    dataRow([{ label: 'Test Interval', val: gv('fsd-interval'), w: 540 }]);
    gap(4);

    secHdr('DAMPER INVENTORY');
    gap(4);
    dataRow([
      { label: '# Smoke',        val: gv('dmp-inv-smoke')    || '0', w: 108 },
      { label: '# Fire',         val: gv('dmp-inv-fire')     || '0', w: 108 },
      { label: '# Comb. F/S',    val: gv('dmp-inv-combo')    || '0', w: 108 },
      { label: '# Ceiling Rad.', val: gv('dmp-inv-ceiling')  || '0', w: 108 },
      { label: '# Corridor',     val: gv('dmp-inv-corridor') || '0', w: 108 },
    ]);
    dataRow([
      { label: 'Total Dampers',       val: gv('dmp-inv-total')  || '0', w: 270 },
      { label: '# Tested This Cycle', val: gv('dmp-inv-tested') || '0', w: 270 },
    ]);
    gap(6);

    const dampers = data.dampers || [];
    const CHK = (typeof DAMPER_CHECKS !== 'undefined') ? DAMPER_CHECKS : [];
    secHdr('DAMPER TEST RESULTS — ' + dampers.length + ' DAMPER(S)');
    gap(2);

    dampers.forEach((d, idx) => {
      // Damper header bar: #, address · type · location, with derived result
      const res     = d.result || '';
      const resTxt  = res || 'UNTESTED';
      const resCol  = res === 'PASS' ? green : res === 'FAIL' ? red : slate;
      const hdrTxt  = `#${idx + 1}  ${d.address || '(unlabeled)'}   ·   ${d.type || '—'}${d.location ? '   ·   ' + d.location : ''}`;
      const hdrLines = wrap(hdrTxt, sc(8), PW - 70);
      const hdrH    = Math.max(sc(14), hdrLines.length * sc(9) + sc(4));
      // Rough space for the header + all check rows + note, so a damper block
      // isn't split awkwardly right after its header.
      checkPage(hdrH + Math.ceil(CHK.length / 3) * 11 + (d.note ? 14 : 0) + 4);
      const bg = res === 'PASS' ? rgb(0.94, 0.99, 0.95) : res === 'FAIL' ? rgb(0.99, 0.93, 0.93) : lgray;
      page.drawRectangle({ x: ML, y: ry(hdrH), width: PW, height: hdrH, color: bg, borderColor: sky, borderWidth: 0.4 });
      hdrLines.forEach((ln, li) => page.drawText(ln, { x: ML + 4, y: ry(hdrH) + hdrH - sc(9) - li*sc(9), size: sc(8), font: hFont, color: navy }));
      page.drawText(resTxt, { x: ML + PW - hFont.widthOfTextAtSize(resTxt, sc(8)) - 5, y: ry(hdrH) + hdrH - 10, size: sc(8), font: hFont, color: resCol });
      curY += hdrH + 1;

      // Sub-checks in 3 columns
      const checks = d.checks || {};
      const colW   = PW / 3;
      const chkRowH = sc(11);
      for (let i = 0; i < CHK.length; i++) {
        const c   = CHK[i];
        const col = i % 3;
        if (col === 0) checkPage(chkRowH);
        const cx  = ML + col * colW;
        const val = checks[c.id] || '';
        const vCol = val === 'PASS' ? green : val === 'FAIL' ? red : slate;
        const lbl = c.short + ': ';
        page.drawText(lbl, { x: cx + 4, y: ry(chkRowH) + 2, size: sc(6.5), font: rFont, color: navy });
        page.drawText(val || '—', { x: cx + 4 + rFont.widthOfTextAtSize(lbl, sc(6.5)), y: ry(chkRowH) + 2, size: sc(6.5), font: hFont, color: vCol });
        if (col === 2 || i === CHK.length - 1) curY += chkRowH;
      }

      if (d.note) {
        curY += sc(3); // small gap between the last check row and the note box
        const nLines = [];
        ('Note: ' + d.note).split(/\r?\n/).forEach(seg => wrap(seg, sc(6.5), PW - 8).forEach(l => nLines.push(l)));
        const nH = Math.max(sc(12), nLines.length * sc(8) + sc(6)); // scaled so the box fits every wrapped line
        checkPage(nH);
        page.drawRectangle({ x: ML, y: ry(nH), width: PW, height: nH, color: rgb(0.985, 0.985, 0.985), borderColor: sky, borderWidth: 0.2 });
        nLines.forEach((ln, li) => page.drawText(ln, { x: ML + 4, y: ry(nH) + nH - sc(8) - li*sc(8), size: sc(6.5), font: rFont, color: slate }));
        curY += nH;
      }
      gap(4);
    });
    gap(2);
  }

  // System info fields
  const sysFields = SYS_FIELDS[sys];
  if (sysFields) {
    if (sysFields.sections) {
      // Sectioned format (e.g. fire pump)
      secHdr('SYSTEM INFORMATION');
      gap(4);
      sysFields.sections.forEach(sec => {
        subHdr(sec.title);
        gap(3);
        sec.rows.forEach(row => {
          const cols = row.map(c => ({ label: c.label, val: document.getElementById(c.id)?.value?.trim() || '', w: c.w }));
          dataRow(cols);
        });
        gap(8);
      });
      gap(2);
    } else if (sysFields.length) {
      // Flat array format
      secHdr('SYSTEM INFORMATION');
      gap(4);
      sysFields.forEach(row => {
        const cols = row.map(c => ({ label: c.label, val: document.getElementById(c.id)?.value?.trim() || '', w: c.w }));
        dataRow(cols);
      });
      gap(4);
    }
  }

  // Deficiencies
  if (data.deficiencies.length > 0) {
    secHdr('DEFICIENCIES — ' + data.deficiencies.length + ' ITEM(S)');
    gap(2);
    data.deficiencies.forEach(d => {
      const sanitize = s => (s || '').replace(/≥/g, '>=').replace(/≤/g, '<=');
      const text = sanitize(d.item) + (d.description ? ': ' + sanitize(d.description) : '');
      // Count wrapped lines per hard newline so multi-line deficiency notes get a
      // tall-enough (auto-growing) box instead of being clipped.
      const lineCount = text.split(/\r?\n/).reduce((n, seg) => n + wrap(seg, sc(7.5), PW-18).length, 0);
      const rowH = pdfRowHeight(lineCount, { lineH: sc(10), pad: sc(4), min: sc(13) });
      checkPage(rowH + 2);
      page.drawRectangle({ x: ML, y: ry(rowH), width: 12, height: rowH, color: rgb(0.99, 0.93, 0.93), borderColor: red, borderWidth: 0.3 });
      page.drawText('\u2022', { x: ML+4, y: ry(rowH) + rowH - 10, size: sc(8), font: hFont, color: red });
      page.drawRectangle({ x: ML+12, y: ry(rowH), width: PW-12, height: rowH, color: rgb(0.99, 0.93, 0.93), borderColor: red, borderWidth: 0.3 });
      const dff = form.createTextField(fid());
      dff.setText(text); dff.enableMultiline();
      dff.addToPage(page, { x: ML+14, y: ry(rowH)+1, width: PW-16, height: rowH-2, font: rFont });
      dff.setFontSize(sc(7.5));
      curY += rowH + 2;
    });
    gap(4);
  }

  // Inspection checklist row renderer (shared across flat and sectioned formats)
  const drawInspRow = (id) => {
    const row = document.getElementById('row-' + id);
    if (!row) return;
    const label = (row.querySelector('.inspect-label')?.childNodes[0]?.textContent?.trim() || id).replace(/≥/g, '>=').replace(/≤/g, '<=');
    const result = (row.dataset.val || '').toUpperCase();
    const deficTxt = document.getElementById('defic-txt-' + id)?.value?.trim() || '';
    const labelLines = wrap(label, sc(7.5), PW - 50);
    const rowH = Math.max(sc(13), labelLines.length * sc(9) + sc(5)); // scaled so multi-line labels aren't clipped
    checkPage(rowH + (result === 'FAIL' && deficTxt ? sc(13) : 0) + 1);
    const bg = result === 'PASS' ? rgb(0.94, 0.99, 0.95) : result === 'FAIL' ? rgb(0.99, 0.93, 0.93) : rgb(0.97, 0.97, 0.97);
    page.drawRectangle({ x: ML, y: ry(rowH), width: PW, height: rowH, color: bg, borderColor: sky, borderWidth: 0.3 });
    labelLines.forEach((line, li) => {
      page.drawText(line, { x: ML+4, y: ry(rowH) + rowH - sc(7) - li*sc(9), size: sc(7.5), font: rFont, color: navy });
    });
    const bColor = result === 'PASS' ? green : result === 'FAIL' ? red : (result ? slate : lgray);
    const bW = 36;
    const bX = ML + PW - bW - 2;
    page.drawRectangle({ x: bX, y: ry(rowH)+1, width: bW, height: rowH-2, color: bColor });
    const rf = form.createTextField(fid());
    rf.setText(result || '');
    rf.addToPage(page, { x: bX+1, y: ry(rowH)+2, width: bW-2, height: rowH-4, font: hFont });
    rf.setFontSize(sc(7));
    curY += rowH + 3;
    if (result === 'FAIL' && deficTxt) {
      const defH = sc(12);
      checkPage(defH + 2);
      page.drawRectangle({ x: ML+4, y: ry(defH), width: PW-4, height: defH, color: rgb(0.99, 0.93, 0.93), borderColor: red, borderWidth: 0.3 });
      const defField = form.createTextField(fid());
      defField.setText('Deficiency: ' + deficTxt);
      defField.addToPage(page, { x: ML+6, y: ry(defH)+1, width: PW-10, height: defH-2, font: rFont });
      defField.setFontSize(sc(7));
      curY += defH + 3;
    }
  };

  // Inspection checklist — sectioned format takes precedence over flat list
  const sectionedItems = SYS_ITEMS_SECTIONED[sys];
  if (sectionedItems) {
    secHdr('INSPECTION RESULTS');
    gap(2);
    sectionedItems.forEach(sec => {
      const visibleIds = sec.ids.filter(id => document.getElementById('row-' + id));
      if (!visibleIds.length) return;
      subHdr(sec.title);
      gap(2);
      visibleIds.forEach(drawInspRow);
      gap(4);
    });
  } else {
    const inspItems = SYS_ITEMS[sys] || [];
    if (inspItems.length) {
      secHdr('INSPECTION RESULTS');
      gap(2);
      inspItems.forEach(drawInspRow);
      gap(4);
    }
  }

  // Notes — the system panel's own notes field (NOTES_ID) PLUS the step-4
  // "General Notes & Site Observations" rows (#fa-notes-tbody, shown for every
  // non-sprinkler system). Previously only the panel notes rendered, so anything
  // typed on the final page was dropped from generic reports.
  const notesId = NOTES_ID[sys];
  const noteBlocks = [];
  const panelNotes = notesId ? document.getElementById(notesId)?.value?.trim() : '';
  if (panelNotes) noteBlocks.push(panelNotes);
  document.querySelectorAll('#fa-notes-tbody input[type=text], #fa-notes-tbody textarea').forEach(el => {
    const t = (el.value || '').trim();
    if (t) noteBlocks.push(t);
  });
  if (noteBlocks.length) {
    secHdr('GENERAL NOTES & SITE OBSERVATIONS');
    noteBlocks.forEach(block => {
      block.split(/\r?\n/).forEach(seg => {
        wrap(seg, sc(8), PW - 8).forEach(line => {
          checkPage(sc(12));
          page.drawText(line, { x: ML+4, y: ry(sc(12))+3, size: sc(8), font: rFont, color: navy });
          curY += sc(12);
        });
      });
    });
    gap(4);
  }

  // Signatures
  checkPage(sc(120));
  secHdr('OVERALL STATUS & SIGNATURES');
  gap(4);
  dataRow([{ label: 'OVERALL INSPECTION STATUS', val: data.overallStatus || '', w: PW }]);
  gap(14);
  const genSigH = sc(40), genSigW = PW / 2 - 6;
  page.drawText('INSPECTOR SIGNATURE:', { x: ML, y: ry(sc(0)) + 2, size: sc(7), font: hFont, color: navy });
  page.drawText('CLIENT SIGNATURE:',    { x: ML+PW/2+10, y: ry(sc(0)) + 2, size: sc(7), font: hFont, color: navy });
  gap(10);
  page.drawRectangle({ x: ML, y: ry(genSigH), width: genSigW, height: genSigH, color: gold, borderColor: sky, borderWidth: 0.5 });
  if (sigHasData) {
    try {
      const sigCanvas = document.getElementById('sig-canvas');
      const b64 = sigCanvas.toDataURL('image/png').split(',')[1];
      const ab  = Uint8Array.from(atob(b64), c => c.charCodeAt(0)).buffer;
      const sImg = await pdfDoc.embedPng(ab);
      const sDims = sImg.scaleToFit(genSigW - 8, genSigH - 8);
      page.drawImage(sImg, { x: ML + 4, y: ry(genSigH) + 4, width: sDims.width, height: sDims.height });
    } catch(_) {}
  } else {
    const sf2 = form.createTextField(fid());
    sf2.setText(''); sf2.addToPage(page, { x: ML+2, y: ry(genSigH)+2, width: genSigW-4, height: genSigH-4, font: rFont }); sf2.setFontSize(sc(9));
  }
  page.drawRectangle({ x: ML+PW/2+8, y: ry(genSigH), width: genSigW, height: genSigH, color: gold, borderColor: sky, borderWidth: 0.5 });
  if (custSigHasData) {
    try {
      const cc = document.getElementById('cust-sig-canvas');
      const b64 = cc.toDataURL('image/png').split(',')[1];
      const ab  = Uint8Array.from(atob(b64), c => c.charCodeAt(0)).buffer;
      const cImg = await pdfDoc.embedPng(ab);
      const cDims = cImg.scaleToFit(genSigW - 8, genSigH - 8);
      page.drawImage(cImg, { x: ML+PW/2+12, y: ry(genSigH) + 4, width: cDims.width, height: cDims.height });
    } catch(_) {}
  } else {
    const cf2 = form.createTextField(fid());
    cf2.setText(''); cf2.addToPage(page, { x: ML+PW/2+10, y: ry(genSigH)+2, width: genSigW-4, height: genSigH-4, font: rFont }); cf2.setFontSize(sc(9));
  }
  curY += genSigH + 4;
  dataRow([
    { label: 'INSPECTOR DATE',      val: data.signature?.date || data.inspection?.date || '', w: PW/2 },
    { label: 'CLIENT DATE',         val: document.getElementById('cust-sig-date')?.value || '', w: PW/2 },
  ]);
  dataRow([
    { label: 'INSPECTOR PRINT NAME', val: data.signature?.name || data.inspection?.inspectorName || '', w: PW/2 },
    { label: 'CLIENT PRINT NAME',    val: document.getElementById('cust-sig-name')?.value || '', w: PW/2 },
  ]);
  gap(4);

  // Photos — rendered LAST (on their own page) so long captions can't overwrite
  // the signatures section above.
  if (inspectionPhotos && inspectionPhotos.length > 0) {
    addPage();
    secHdr('INSPECTION PHOTOS');
    const photoW = Math.floor((PW - 10) / 2);
    const photoH = sc(140);
    let col = 0;
    for (let i = 0; i < inspectionPhotos.length; i++) {
      const photo = inspectionPhotos[i];
      checkPage(photoH + 30);
      const px = ML + col * (photoW + 10);
      try {
        const b64 = photo.dataUrl.split(',')[1];
        const ab  = Uint8Array.from(atob(b64), c => c.charCodeAt(0)).buffer;
        const img = photo.dataUrl.startsWith('data:image/png')
          ? await pdfDoc.embedPng(ab) : await pdfDoc.embedJpg(ab);
        const dims = img.scaleToFit(photoW, photoH);
        page.drawImage(img, { x: px, y: ry(photoH) + (photoH - dims.height), width: dims.width, height: dims.height });
      } catch(_) {
        page.drawRectangle({ x: px, y: ry(photoH), width: photoW, height: photoH, color: lgray });
      }
      page.drawRectangle({ x: px+2, y: ry(photoH)+photoH-14, width: 40, height: sc(12), color: rgb(0,0,0) });
      page.drawText('Photo ' + (i+1), { x: px+4, y: ry(photoH)+photoH-7, size: sc(7), font: hFont, color: white });
      if (photo.note) {
        wrap(photo.note, sc(7), photoW).forEach((l, li) => {
          page.drawText(l, { x: px, y: ry(photoH) - sc(10) - li*sc(9), size: sc(7), font: rFont, color: navy });
        });
      }
      col++;
      if (col >= 2) { col = 0; curY += photoH + 22; }
    }
    if (col > 0) curY += photoH + 22;
  }

  return await pdfDoc.save();
}

// ─────────────────────────────────────────────────────────────────────────────
// EXIT SIGN & LIGHTING PDF — pdf-lib editable format
// ─────────────────────────────────────────────────────────────────────────────
async function buildExitSignLightingPDFBytes() {
  if (!window.PDFLib) throw new Error('PDF library not loaded. Please refresh.');
  const data = collectAllData();
  const { PDFDocument, rgb, StandardFonts } = window.PDFLib;
  const pdfDoc = await PDFDocument.create();
  const form   = pdfDoc.getForm();
  const hFont  = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const rFont  = await pdfDoc.embedFont(StandardFonts.Helvetica);

  const W = 612, PH = 792, ML = 36, PW = 540, MT = 36, MB = 36;
  let page, curY, _fid = 0;
  const fid = () => 'esl_' + (++_fid);

  const FIRE_RED = rgb(0.72, 0.08, 0.08);
  const navy  = rgb(0.13, 0.21, 0.42);
  const sky   = rgb(0.71, 0.80, 0.93);
  const gold  = rgb(1.0, 1.0, 0.75);
  const lgray = rgb(0.94, 0.94, 0.94);
  const white = rgb(1, 1, 1);
  const green = rgb(0.06, 0.50, 0.22);
  const red   = rgb(0.76, 0.10, 0.10);
  const amber = rgb(0.75, 0.38, 0.00);
  const slate = rgb(0.39, 0.45, 0.55);

  const addPage = () => { page = pdfDoc.addPage([W, PH]); curY = MT; };
  const ry = (h) => PH - curY - h;
  const ty = (h, a = 3) => PH - curY - h + a;
  const checkPage = (needed) => { if (curY + needed > PH - MB) addPage(); };
  const gap = (h) => { curY += sc(h); };

  const wrap = (text, sz, maxW) => wrapText(text, sz, maxW, (s, z) => rFont.widthOfTextAtSize(s, z));

  const secHdr = (title) => {
    checkPage(sc(20));
    page.drawRectangle({ x: ML, y: ry(sc(17)), width: PW, height: sc(17), color: navy });
    page.drawText(title, { x: ML+4, y: ty(sc(17), sc(5)), size: sc(9), font: hFont, color: white });
    curY += sc(18);
  };

  // ── HEADER (same logo pattern as other PDFs) ─────────────────────────────
  addPage();
  curY = await drawReportHeader({
    pdfDoc, page, form, hFont, rFont, sc, W, PH, ML, PW, fid, data,
    fd: data.fieldData || {},
    dv: (id) => document.getElementById(id)?.value?.trim() || '',
    title: 'EXIT SIGN & EMERGENCY LIGHTING INSPECTION REPORT',
    C: { FIRE_RED, navy, sky, gold, lgray, white, blk: rgb(0, 0, 0) }
  });
  gap(4);

  // Overall status
  const stVal2 = (data.overallStatus || '').toUpperCase();
  const stColor2 = stVal2 === 'COMPLIANT' ? green : stVal2 === 'DEFICIENT' ? red : stVal2 === 'IMPAIRED' ? amber : slate;
  checkPage(sc(22));
  page.drawRectangle({ x: ML, y: ry(sc(18)), width: PW, height: sc(18), color: stColor2 });
  page.drawText('OVERALL STATUS', { x: ML+8, y: ty(sc(18), sc(6)), size: sc(6.5), font: hFont, color: white });
  page.drawText(stVal2 || 'PENDING', { x: ML+100, y: ty(sc(18), sc(6)), size: sc(9.5), font: hFont, color: white });
  curY += sc(18);
  gap(6);

  // Deficiencies
  if (data.deficiencies.length > 0) {
    secHdr('DEFICIENCIES — ' + data.deficiencies.length + ' ITEM(S)');
    gap(2);
    data.deficiencies.forEach(d => {
      const text = d.item + (d.description ? ': ' + d.description : '');
      const rowH = pdfRowHeight(wrap(text, sc(7.5), PW-18).length, { lineH: sc(10), pad: sc(4), min: sc(13) });
      checkPage(rowH + 2);
      page.drawRectangle({ x: ML, y: ry(rowH), width: 12, height: rowH, color: rgb(0.99, 0.93, 0.93), borderColor: red, borderWidth: 0.3 });
      page.drawText('\u2022', { x: ML+4, y: ry(rowH) + rowH - 10, size: sc(8), font: hFont, color: red });
      page.drawRectangle({ x: ML+12, y: ry(rowH), width: PW-12, height: rowH, color: rgb(0.99, 0.93, 0.93), borderColor: red, borderWidth: 0.3 });
      const dff = form.createTextField(fid());
      dff.setText(text); dff.enableMultiline();
      dff.addToPage(page, { x: ML+14, y: ry(rowH)+1, width: PW-16, height: rowH-2, font: rFont });
      dff.setFontSize(sc(7.5));
      curY += rowH + 2;
    });
    gap(4);
  }

  // Helper: draw a device table
  const drawDeviceTable = (title, units, colDefs) => {
    if (!units || !units.length) return;
    secHdr(title);
    // Table header
    checkPage(sc(14));
    let hx = ML;
    colDefs.forEach(c => {
      page.drawRectangle({ x: hx, y: ry(sc(13)), width: c.w, height: sc(13), color: navy });
      page.drawText(c.label, { x: hx+2, y: ty(sc(13), sc(4)), size: sc(5.5), font: hFont, color: white });
      hx += c.w;
    });
    curY += sc(14);

    units.forEach((u, idx) => {
      const rowH = sc(13);
      checkPage(rowH + 1);
      const bg = u.pf === 'FAIL' ? rgb(0.99, 0.93, 0.93) : u.pf === 'PASS' ? rgb(0.94, 0.99, 0.95) : rgb(0.97, 0.97, 0.97);
      page.drawRectangle({ x: ML, y: ry(rowH), width: PW, height: rowH, color: bg, borderColor: sky, borderWidth: 0.3 });
      let cx = ML;
      colDefs.forEach(c => {
        const val = String(c.get(u, idx) || '');
        const color = (c.isPF && val === 'FAIL') ? red : (c.isPF && val === 'PASS') ? green : navy;
        page.drawText(val.slice(0, Math.floor(c.w / 4.5)), { x: cx+2, y: ty(rowH, 4), size: sc(7), font: c.isPF ? hFont : rFont, color });
        cx += c.w;
      });
      curY += rowH + 1;
    });
    gap(6);
  };

  // EL table
  drawDeviceTable('EMERGENCY LIGHTING UNITS (NFPA 101 7.9)', data.elUnits, [
    { label: '#',          w: 22,  get: (u, i) => String(i+1) },
    { label: 'LOCATION',   w: 140, get: u => u.loc },
    { label: 'TYPE',       w: 80,  get: u => u.type },
    { label: '30-SEC',     w: 56,  get: u => u.pf30s },
    { label: '90-MIN',     w: 56,  get: u => u.pf90m },
    { label: 'BATTERY',    w: 56,  get: u => u.pfBatt },
    { label: 'PASS/FAIL',  w: 56,  get: u => u.pf, isPF: true },
    { label: 'COMMENTS',   w: 74,  get: u => u.comments },
  ]);

  // ES table
  drawDeviceTable('EXIT SIGNS (NFPA 101 7.10)', data.esUnits, [
    { label: '#',          w: 22,  get: (u, i) => String(i+1) },
    { label: 'LOCATION',   w: 140, get: u => u.loc },
    { label: 'TYPE',       w: 80,  get: u => u.type },
    { label: 'ILLUMINATED',w: 60,  get: u => u.pfIllum },
    { label: 'ARROWS',     w: 52,  get: u => u.pfArrows },
    { label: 'BATT. BKUP', w: 52,  get: u => u.pfBatt },
    { label: 'PASS/FAIL',  w: 60,  get: u => u.pf, isPF: true },
    { label: 'COMMENTS',   w: 74,  get: u => u.comments },
  ]);

  // Notes
  const notesVal = document.getElementById('esl-notes')?.value?.trim() || '';
  if (notesVal) {
    secHdr('NOTES');
    wrap(notesVal, sc(8), PW - 8).forEach(line => {
      checkPage(sc(12));
      page.drawText(line, { x: ML+4, y: ry(sc(12))+3, size: sc(8), font: rFont, color: navy });
      curY += sc(12);
    });
    gap(4);
  }

  // Signature
  checkPage(sc(88));
  secHdr('INSPECTOR CERTIFICATION');
  gap(8); // clear the header bar before the INSPECTOR SIGNATURE label below
  const sigName2 = data.signature?.name || data.inspection?.inspectorName || '';
  const sigDate2 = data.signature?.date || data.inspection?.date || '';
  const halfW2 = PW / 2 - 4;

  // Drawn signature (matches sprinkler/other reports) — embed the sig-canvas PNG
  const eslSigH = sc(40);
  page.drawText('INSPECTOR SIGNATURE:', { x: ML+2, y: ry(sc(0)) + 2, size: sc(7), font: hFont, color: navy });
  gap(11);
  page.drawRectangle({ x: ML, y: ry(eslSigH), width: PW, height: eslSigH, color: gold, borderColor: sky, borderWidth: 0.5 });
  if (sigHasData) {
    try {
      const sigCanvas = document.getElementById('sig-canvas');
      const b64 = sigCanvas.toDataURL('image/png').split(',')[1];
      const ab  = Uint8Array.from(atob(b64), c => c.charCodeAt(0)).buffer;
      const sImg = await pdfDoc.embedPng(ab);
      const sDims = sImg.scaleToFit(PW - 8, eslSigH - 8);
      page.drawImage(sImg, { x: ML + 4, y: ry(eslSigH) + 4, width: sDims.width, height: sDims.height });
    } catch(_) {}
  }
  curY += eslSigH + 6;

  // Printed name + date row below the signature
  page.drawText('INSPECTOR PRINT NAME:', { x: ML+2, y: ry(sc(0)) + 2, size: sc(6.5), font: hFont, color: navy });
  page.drawText('DATE:', { x: ML+halfW2+10, y: ry(sc(0)) + 2, size: sc(6.5), font: hFont, color: navy });
  gap(10);
  page.drawRectangle({ x: ML, y: ry(sc(18)), width: halfW2, height: sc(18), color: gold, borderColor: sky, borderWidth: 0.5 });
  const sf2 = form.createTextField(fid());
  sf2.setText(sigName2); sf2.addToPage(page, { x: ML+2, y: ry(sc(18))+2, width: halfW2-4, height: sc(14), font: rFont }); sf2.setFontSize(sc(9));
  page.drawRectangle({ x: ML+halfW2+8, y: ry(sc(18)), width: halfW2, height: sc(18), color: gold, borderColor: sky, borderWidth: 0.5 });
  const df2 = form.createTextField(fid());
  df2.setText(sigDate2); df2.addToPage(page, { x: ML+halfW2+10, y: ry(sc(18))+2, width: halfW2-4, height: sc(14), font: rFont }); df2.setFontSize(sc(9));
  curY += sc(22);

  return await pdfDoc.save();
}

// ─────────────────────────────────────────────────────────────────────────────
// PDF GENERATION — returns a Uint8Array of the PDF bytes
// ─────────────────────────────────────────────────────────────────────────────
async function buildEditablePDFBytes() {
  if (!window.PDFLib) throw new Error('PDF library not loaded. Please refresh.');
  const data = collectAllData();
  const { PDFDocument, rgb, StandardFonts } = window.PDFLib;
    const pdfDoc = await PDFDocument.create();
    const form = pdfDoc.getForm();
    const hFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    const rFont = await pdfDoc.embedFont(StandardFonts.Helvetica);

    const W = 612, PH = 792, ML = 36, PW = 540, MT = 36, MB = 36;
    let page, curY, _fid = 0;
    const fid = () => 'fld_' + (++_fid);

    // Colors
    const navy  = rgb(0.13, 0.21, 0.42);
    const sky   = rgb(0.71, 0.80, 0.93);
    const gold  = rgb(1.0,  1.0,  0.75);
    const lgray = rgb(0.94, 0.94, 0.94);
    const white = rgb(1, 1, 1);
    const blk   = rgb(0, 0, 0);

    const addPage = () => { page = pdfDoc.addPage([W, PH]); curY = MT; };
    // pdf-lib: origin bottom-left. ry() gives bottom-y of a strip at curY with height h.
    const ry = (h) => PH - curY - h;
    const ty = (h, a = 3) => PH - curY - h + a; // text baseline

    const checkPage = (needed) => { if (curY + needed > PH - MB) addPage(); };

    // Word-wrap helper (delegates to the shared, unit-tested wrapText)
    const wrap = (text, sz, maxW) => wrapText(text, sz, maxW, (s, z) => rFont.widthOfTextAtSize(s, z));

    // Section header (navy bar)
    const secHdr = (title) => {
      checkPage(sc(18));
      page.drawRectangle({ x: ML, y: ry(sc(17)), width: PW, height: sc(17), color: navy });
      page.drawText(title, { x: ML+4, y: ty(sc(17), sc(5)), size: sc(9), font: hFont, color: white });
      curY += sc(18);
    };
    // Sub-header (sky bar) — advance leaves a few pts below the bar so the
    // following row's label doesn't ride up into the header.
    const subHdr = (title) => {
      checkPage(sc(18));
      page.drawRectangle({ x: ML, y: ry(sc(13)), width: PW, height: sc(13), color: sky });
      page.drawText(title, { x: ML+4, y: ty(sc(13), sc(4)), size: sc(7.5), font: hFont, color: navy });
      curY += sc(18);
    };

    // Single editable text field (no label, no curY advance)
    const mkField = (val, x, fieldY, w, h, multiline) => {
      page.drawRectangle({ x, y: fieldY, width: w, height: h, color: gold, borderColor: sky, borderWidth: 0.5 });
      const f = form.createTextField(fid());
      f.setText(String(val || ''));
      if (multiline) f.enableMultiline();
      f.addToPage(page, { x: x+1, y: fieldY+1, width: w-2, height: h-2, font: rFont });
      f.setFontSize(sc(8));
    };

    // Draw a row of labeled fields and advance curY
    const dataRow = (cols, fh = 12, lh = 8, gap = 3) => {
      const FH = sc(fh), LH = sc(lh), GP = sc(gap);
      checkPage(LH + FH + GP);
      let x = ML;
      cols.forEach(c => {
        page.drawText((c.label||'')+':', { x: x+2, y: ty(LH, LH-sc(3)), size: sc(6), font: hFont, color: navy });
        mkField(c.val, x, ry(LH+FH), c.w, FH, false);
        x += c.w;
      });
      curY += LH + FH + GP;
    };

    // Multi-line text area spanning full width
    const textArea = (val, h) => {
      checkPage(h + 2);
      mkField(val, ML, ry(h), PW, h, true);
      curY += h + 2;
    };

    // Static wrapped text (no field)
    const staticText = (text, sz, indent) => {
      sz = sc(sz);
      wrap(text, sz, PW - indent - 4).forEach(line => {
        checkPage(sz + 3);
        page.drawText(line, { x: ML+indent, y: ry(sz+3)+2, size: sz, font: rFont, color: blk });
        curY += sz + 3;
      });
    };
    const bulletText = (text, sz) => {
      sz = sc(sz);
      wrap(text, sz, PW - 12).forEach((line, i) => {
        checkPage(sz + 3);
        if (i === 0) page.drawText('\u2022', { x: ML+4, y: ry(sz+3)+2, size: sz, font: rFont, color: blk });
        page.drawText(line, { x: ML+10, y: ry(sz+3)+2, size: sz, font: rFont, color: blk });
        curY += sz + 3;
      });
    };
    const gap = (h) => { curY += sc(h); };

    // Table: draws header + rows of editable cells, handles page breaks.
    // Pass wrapCol (column index) to let that column's text wrap onto multiple
    // lines — the row grows to fit and that cell becomes a multiline field.
    const table = (hdrs, rows, cellH, wrapCol, pfCols) => {
      cellH = sc(cellH);
      const isPF = (i) => Array.isArray(pfCols) && pfCols.includes(i);
      const drawHdr = () => {
        checkPage(sc(13));
        let x = ML;
        hdrs.forEach(h => {
          page.drawRectangle({ x, y: ry(sc(13)), width: h.w, height: sc(13), color: navy });
          page.drawText(wrap(h.label, sc(6), h.w-3)[0]||'', { x: x+2, y: ty(sc(13), sc(4)), size: sc(6), font: hFont, color: white });
          x += h.w;
        });
        curY += sc(14);
      };
      drawHdr();
      rows.forEach(row => {
        const rowH = (wrapCol != null)
          ? pdfRowHeight(wrap(String(row[wrapCol]||''), sc(7), hdrs[wrapCol].w-4).length, { lineH: sc(9), pad: sc(4), min: cellH })
          : cellH;
        if (curY + rowH > PH - MB) { addPage(); drawHdr(); }
        let x = ML;
        hdrs.forEach((h, i) => {
          const val = String(row[i]||'');
          const pf = isPF(i) ? val.toUpperCase() : '';
          // PASS/FAIL columns render as a colored cell with centered text (like the
          // extinguisher/sprinkler tables) instead of a cramped input box.
          if (pf === 'PASS' || pf === 'FAIL') {
            page.drawRectangle({ x, y: ry(rowH), width: h.w, height: rowH, color: pf === 'PASS' ? rgb(0.06,0.50,0.22) : rgb(0.76,0.10,0.10), borderColor: sky, borderWidth: 0.3 });
            const tw = hFont.widthOfTextAtSize(pf, sc(6.5));
            page.drawText(pf, { x: x + h.w/2 - tw/2, y: ty(rowH, sc(4)), size: sc(6.5), font: hFont, color: white });
          } else {
            page.drawRectangle({ x, y: ry(rowH), width: h.w, height: rowH, color: gold, borderColor: sky, borderWidth: 0.3 });
            const f = form.createTextField(fid());
            f.setText(val);
            if (wrapCol != null && i === wrapCol) f.enableMultiline();
            f.addToPage(page, { x: x+1, y: ry(rowH)+1, width: h.w-2, height: rowH-2, font: rFont });
            f.setFontSize(sc(7));
          }
          x += h.w;
        });
        curY += rowH + 1;
      });
    };

    // Helpers to read DOM values
    const dv = (id) => document.getElementById(id)?.value?.trim() || '';
    const fd = data.fieldData || {};
    const getYNA = (el) => {
      if (!el) return 'N/A';
      if (el.querySelector('.yna-btn.y.selected'))  return 'Y';
      if (el.querySelector('.yna-btn.n.selected'))  return 'N';
      if (el.querySelector('.yna-btn.na.selected')) return 'N/A';
      return 'N/A';
    };
    const getPF = (cardId, rowIdx, grpIdx) => {
      const rows = document.getElementById(cardId)?.querySelectorAll('.inspect-row') || [];
      return rows[rowIdx]?.querySelectorAll('.pf-group')[grpIdx]?.querySelector('.pf-btn.selected')?.textContent?.trim() || '';
    };
    // Returns [leftBoxVal, rightBoxVal] routing FAIL to the right box, PASS/other to the left
    // Draw a value as a colored PASS/FAIL/N-A cell (like the other reports) instead
    // of a plain input box; falls back to a normal field for anything else.
    const pfCell = (val, x, fieldY, w, h) => {
      const u = (val || '').toUpperCase();
      const col = (u === 'PASS' || u === 'YES') ? rgb(0.06, 0.50, 0.22)
                : u === 'FAIL' ? rgb(0.76, 0.10, 0.10)
                : u === 'N/A' ? rgb(0.45, 0.50, 0.60) : null;
      if (col) {
        page.drawRectangle({ x, y: fieldY, width: w, height: h, color: col, borderColor: sky, borderWidth: 0.3 });
        const tw = hFont.widthOfTextAtSize(u, sc(6.5));
        page.drawText(u, { x: x + w / 2 - tw / 2, y: fieldY + (h - sc(6.5)) / 2 + sc(0.5), size: sc(6.5), font: hFont, color: white });
      } else {
        mkField(val, x, fieldY, w, h, false);
      }
    };
    const pfBoxes = (cardId, rowIdx) => {
      const rows = document.getElementById(cardId)?.querySelectorAll('.inspect-row') || [];
      const grps = rows[rowIdx]?.querySelectorAll('.pf-group') || [];
      const g0 = grps[0]?.querySelector('.pf-btn.selected')?.textContent?.trim() || '';
      const g1 = grps.length >= 2 ? (grps[1]?.querySelector('.pf-btn.selected')?.textContent?.trim() || '') : null;
      if (g1 !== null) {
        // Two-group row (Present/Operational): if present=N/A, whole row N/A
        if (g0 === 'N/A') return ['N/A', ''];
        // Route operational result: PASS/N/A → left, FAIL → right
        return [g1 !== 'FAIL' ? g1 : '', g1 === 'FAIL' ? 'FAIL' : ''];
      }
      // Single-group: PASS/YES/N/A → left, FAIL → right
      return [g0 !== 'FAIL' ? g0 : '', g0 === 'FAIL' ? 'FAIL' : ''];
    };

    // Render an auxiliary check as a fire-pump-style "inspection result" row: a
    // full-width tinted row (green PASS / red FAIL / gray N/A) with a colored result
    // pill on the right, and — on FAIL — the deficiency box beneath it.
    const green = rgb(0.06, 0.50, 0.22), red = rgb(0.76, 0.10, 0.10), slate = rgb(0.45, 0.50, 0.60);
    const auxResultRow = (cardId, rowIdx, label) => {
      const rows = document.getElementById(cardId)?.querySelectorAll('.inspect-row') || [];
      const rowEl = rows[rowIdx];
      const [v1, v2] = pfBoxes(cardId, rowIdx);
      let result = (v2 === 'FAIL') ? 'FAIL' : (v1 || '').toUpperCase(); // PASS / YES / N/A / FAIL
      const disp = result === 'YES' ? 'PASS' : result;
      const deficTxt = rowEl?.querySelector('.fa-static-defic input')?.value?.trim() || '';
      const labelLines = wrap(label, sc(7), PW - 54);
      const rowH = Math.max(sc(14), labelLines.length * sc(8) + sc(6));
      checkPage(rowH + (result === 'FAIL' && deficTxt ? sc(13) : 0) + 1);
      const bg = disp === 'PASS' ? rgb(0.94, 0.99, 0.95) : disp === 'FAIL' ? rgb(0.99, 0.93, 0.93) : rgb(0.97, 0.97, 0.97);
      page.drawRectangle({ x: ML, y: ry(rowH), width: PW, height: rowH, color: bg, borderColor: sky, borderWidth: 0.3 });
      labelLines.forEach((line, li) => page.drawText(line, { x: ML+4, y: ry(rowH) + rowH - sc(7) - li*sc(8), size: sc(7), font: rFont, color: navy }));
      const bColor = disp === 'PASS' ? green : disp === 'FAIL' ? red : (disp ? slate : lgray);
      const bW = 44, bX = ML + PW - bW - 2;
      page.drawRectangle({ x: bX, y: ry(rowH)+1, width: bW, height: rowH-2, color: bColor });
      if (disp) {
        const tw = hFont.widthOfTextAtSize(disp, sc(6.5));
        page.drawText(disp, { x: bX + bW/2 - tw/2, y: ry(rowH) + rowH/2 - sc(2.5), size: sc(6.5), font: hFont, color: white });
      }
      curY += rowH + 3;
      if (result === 'FAIL' && deficTxt) {
        const dLines = wrap('Deficiency: ' + deficTxt, sc(7), PW - 12);
        const defH = Math.max(sc(12), dLines.length * sc(9) + sc(4));
        checkPage(defH + 2);
        page.drawRectangle({ x: ML+4, y: ry(defH), width: PW-4, height: defH, color: rgb(0.99, 0.93, 0.93), borderColor: red, borderWidth: 0.3 });
        const df = form.createTextField(fid());
        df.setText('Deficiency: ' + deficTxt); df.enableMultiline();
        df.addToPage(page, { x: ML+6, y: ry(defH)+1, width: PW-10, height: defH-2, font: rFont });
        df.setFontSize(sc(7));
        curY += defH + 3;
      }
    };

    // Collect device table rows — query DOM directly so gaps from deletions are handled
    const collectRows = (prefix, fields) =>
      [...document.querySelectorAll(`[id^="${prefix}-row-"]`)].map(row => {
        const n = row.id.slice((prefix + '-row-').length);
        return fields.map(f => dv(f + '-' + n));
      });
    const detRows    = collectRows('fa-det',    ['fa-det-type','fa-det-loc','fa-det-scan','fa-det-addr','fa-det-alarm','fa-det-sup']);
    const flowRows   = collectRows('fa-flow',   ['fa-flow-type','fa-flow-loc','fa-flow-scan','fa-flow-addr','fa-flow-sup','fa-flow-secs']);
    const tamperRows = collectRows('fa-tamper', ['fa-tamper-type','fa-tamper-loc','fa-tamper-scan','fa-tamper-addr','fa-tamper-sup','fa-tamper-notes']);
    const spRows     = collectRows('fa-sp',     ['fa-sp-loc','fa-sp-make','fa-sp-circuit','fa-sp-amps','fa-sp-lbatt','fa-sp-rbatt','fa-sp-spvsd','fa-sp-pf']);
    const batRows    = collectRows('fa-bat',    ['fa-bat-size','fa-bat-type','fa-bat-count','fa-bat-loc']);
    const preRows  = [...(document.getElementById('fa-pre-checklist')?.querySelectorAll('.inspect-row')  || [])];
    const postRows = [...(document.getElementById('fa-post-checklist')?.querySelectorAll('.inspect-row') || [])];

    // ── PAGE 1: Header + Property + NFPA ─────────────────────────────────────
    addPage();

    curY = await drawReportHeader({
      pdfDoc, page, form, hFont, rFont, sc, W, PH, ML, PW, fid, data,
      fd: data.fieldData || {},
      dv: (id) => document.getElementById(id)?.value?.trim() || '',
      title: 'FIRE ALARM INSPECTION REPORT',
      C: { FIRE_RED: rgb(0.72, 0.08, 0.08), navy, sky, gold, lgray, white, blk }
    });

    // Overall System Status bar — full width, prominently colored
    {
      const stH = sc(18);
      const stVal = (data.overallStatus || '').toUpperCase();
      const stColor = stVal === 'COMPLIANT' ? rgb(0.06, 0.50, 0.22) :
                      stVal === 'DEFICIENT' ? rgb(0.76, 0.10, 0.10) :
                      stVal === 'IMPAIRED'  ? rgb(0.75, 0.38, 0.00) :
                                              rgb(0.38, 0.44, 0.54);
      page.drawRectangle({ x: ML, y: ry(stH), width: PW, height: stH, color: stColor });
      page.drawText('OVERALL SYSTEM STATUS', { x: ML + 8, y: ty(stH, 6), size: sc(6.5), font: hFont, color: white });
      page.drawText(stVal || 'PENDING', { x: ML + 8 + hFont.widthOfTextAtSize('OVERALL SYSTEM STATUS', sc(6.5)) + sc(12), y: ty(stH, 6), size: sc(9.5), font: hFont, color: white });
      curY += stH + 4;
    }

    // Property name + address are drawn by the shared header above; continue with contact info.
    gap(6);
    subHdr('SITE CONTACT INFORMATION');
    dataRow([
      { label: 'PRIMARY CONTACT NAME',  val: data.property?.contact || '',      w: PW/2 },
      { label: 'COMPANY',               val: data.property?.company || '',       w: PW/2 },
    ]);
    dataRow([{ label: 'PRIMARY CONTACT EMAIL', val: data.property?.contactEmail || '', w: PW }]);
    gap(8);
    subHdr('NFPA REFERENCES AND PROCEDURE');
    gap(2);
    [
      'YOUR ENTIRE FIRE ALARM SYSTEM IS REQUIRED TO BE THROUGHLY INSPECTED, TESTED AND MAINTAINED EACH YEAR BY AN APPROVED SERVICING COMPANY IN ACCORDANCE WITH THE FOLLOWING NFPA CHAPTER REFERENCES:',
      'CHAPTER 14 OF NFPA 72 (SEE NFPA 72(10), TABLES 14.3.1 AND 14.4.5; SEE ALSO: NFPA 90A(12), SEC.6.4.1).',
      'TESTING MUST INCLUDE CONTROL EQUIPMENT, REMOTE ANNUNCIATORS, INITIATING DEVICES, HVAC SHUTDOWN DEVICES AND ALARM NOTIFICATION APPLIANCES. SEE THE BELOW LIST OF VARIOUS TESTING DEVICES:',
    ].forEach(p => { staticText(p, 6.5, 2); gap(2); });
    [
      'VISUAL AND FUNCTIONAL TESTING OF THE FIRE ALARM CONTROL PANEL (FACP) AND COMPONENTS',
      'VISUAL AND FUNCTIONAL TESTING OF THE REMOTE POWER SUPPLIES (IF APPLICABLE)',
      'VISUAL AND FUNCTIONAL LOAD TESTING OF THE FACP AND REMOTE POWER SUPPLY BATTERIES. (ANNUAL & SEMI ANNUAL)',
      'VISUAL AND FUNCTIONAL TESTING OF THE AUTOMATIC AND MANUAL ALARM INITIATING DEVICES. (ANNUAL ONLY/FUNCTIONAL)',
      'VISUAL AND FUNCTIONAL TESTING OF THE TAMPER AND WATER FLOW DEVICES',
      'VISUAL AND FUNCTIONAL TESTING OF THE AUDIBLE AND VISUAL NOTIFICATION APPLIANCES (ANNUAL ONLY/FUNCTIONAL)',
      'ALARM SIGNAL TRANSMISSION TO CENTRAL STATION VERIFICATION (IF APPLICABLE)',
      'VISUAL AND FUNCTIONAL TESTING OF THE GRAPHIC MAP DEVICE LOCATION VERIFICATION & ACCURACY (IF APPLICABLE)',
      'HVAC AND DAMPER CONTROL RELAYS FUNCTIONAL TESTING (ANNUAL ONLY/FUNCTIONAL).',
      'DOOR RELEASING RELAYS FUNCTIONAL TESTING (IF APPLICABLE) (ANNUAL ONLY/FUNCTIONAL).',
      'DOCUMENTATION OF SYSTEM TESTING AND WHEN APPLICABLE GENERATION OF SYSTEM DEFICIENCIES REPORT',
    ].forEach(b => bulletText(b, 6.5));
    gap(4);

    // ── PAGE 2: Panel + Monitoring + Checklists ───────────────────────────────
    addPage();
    secHdr('MAIN FIRE ALARM CONTROL PANEL & MONITORING INFORMATION');
    subHdr('CONTROL PANEL SPECIFICATION');
    dataRow([
      { label:'MAKE',  val: fd['fa-cp-make'],  w: PW/3 },
      { label:'MODEL', val: fd['fa-cp-model'], w: PW/3 },
      { label:'TYPE',  val: fd['fa-cp-type'],  w: PW/3 },
    ]);
    dataRow([
      { label:'LOCATION', val: fd['fa-cp-location'], w: PW },
    ]);
    dataRow([
      { label:'SERIAL #',       val: fd['fa-cp-serial'],    w: PW/3 },
      { label:'# ZONES/LOOPS',  val: fd['fa-cp-zones'],     w: PW/3 },
      { label:'YEAR INSTALLED', val: fd['fa-cp-year'],      w: PW/3 },
    ]);
    dataRow([
      { label:'BATTERY INSTALL DATE', val: fd['fa-cp-batt-date'], w: PW/2 },
    ]);
    subHdr('DIALER/RADIO SPECIFICATIONS');
    dataRow([
      { label:'MAKE',  val: fd['fa-dr-make'],  w: PW/3 },
      { label:'MODEL', val: fd['fa-dr-model'], w: PW/3 },
      { label:'TYPE',  val: fd['fa-dr-type'],  w: PW/3 },
    ]);
    dataRow([
      { label:'LOCATION', val: fd['fa-dr-location'] || '', w: PW },
    ]);
    subHdr('PANEL TESTING / DISABLE INSTRUCTIONS');
    textArea(fd['fa-panel-instructions'], 35);
    subHdr('MONITORING SPECIFICATIONS');
    dataRow([
      { label:'IS SYSTEM MONITORED?',  val: fd['fa-monitored'],        w: PW/4 },
      { label:'MONITORING COMPANY',    val: fd['fa-monitor-company'],   w: PW/4 },
      { label:'PHONE',                 val: fd['fa-monitor-phone'],     w: PW/4 },
      { label:'ACCOUNT #',             val: fd['fa-monitor-account'],   w: PW/4 },
    ]);
    dataRow([
      { label:'TIME OFFLINE', val: fd['fa-monitor-offline'], w: PW/2 },
      { label:'TIME ONLINE',  val: fd['fa-monitor-online'],  w: PW/2 },
    ]);
    // NOTES on their own full-width, auto-growing line so long text doesn't run off.
    page.drawText('MONITORING NOTES:', { x: ML+2, y: ry(sc(9)) + sc(2), size: sc(6), font: hFont, color: navy });
    curY += sc(9);
    textArea(fd['fa-monitor-notes'] || '', pdfRowHeight(wrap(fd['fa-monitor-notes'] || '', sc(7), PW - 6).length, { lineH: sc(9), pad: sc(4), min: sc(16) }));
    gap(4);
    subHdr('PRE & POST INSPECTION CHECKLIST');
    const preLabels  = ['CHECK IN WITH THE ENGINEER?','WERE KEYS PROVIDED?','ALL FIRE EQUIPMENT IN WORKING ORDER?','PANEL SHOWING "NORMAL" UPON ARRIVAL?','PANEL TAKEN OFFLINE/DISABLED?','ALL LAMPS/LEDs/LCDs FUNCTIONING?','ALL FUSES IN GOOD CONDITION/FUNCTIONAL'];
    const postLabels = ['SIGNALS RECEIVED AT CENTRAL STATION?','PANEL "NORMAL" STATE UPON DEPARTURE?','PANEL REENABLED & PLACED ONLINE?','APPLICABLE DEVICE TAGS UPDATED?','CHECKOUT WITH ENG/KEYS RETURNED','CUSTOMER NOTIFIED OF DEFICIENCIES?','FCC LEFT CLEAN & ORGANIZED?'];
    for (let i = 0; i < preLabels.length; i++) {
      checkPage(sc(20));
      const halfW = PW / 2 - 5;
      // Pre (left)
      const pLines = wrap(preLabels[i], sc(6), halfW - 38);
      pLines.forEach((l, li) => page.drawText(l, { x: ML+2, y: ry(sc(16))+(pLines.length-1-li)*8+4, size: sc(6), font: rFont, color: blk }));
      mkField(getYNA(preRows[i]), ML+halfW-32, ry(sc(14))+1, 30, 12, false);
      // Post (right)
      const poLines = wrap(postLabels[i]||'', sc(6), halfW - 38);
      poLines.forEach((l, li) => page.drawText(l, { x: ML+halfW+8, y: ry(sc(16))+(poLines.length-1-li)*8+4, size: sc(6), font: rFont, color: blk }));
      mkField(getYNA(postRows[i]), ML+PW-32, ry(sc(14))+1, 30, 12, false);
      curY += sc(17);
    }

    // ── PAGE 3: Device Testing Summary + On-Site Notes ────────────────────────
    addPage();
    secHdr('DEVICE/SIGNAL TESTING SUMMARY');
    const PDF_FA_DEVICES = [
      ['Smoke Detector','SD'],['Combo Smoke/CO2/Other','CBO'],['Heat Detector','HD'],
      ['Manual Pull Station','PS'],['Duct Detector','DD'],['Beam Detector','BD'],
      ['CO2 Detector','CO'],['Wet Flow Switch','FS'],['Dry Pressure Switch','PRS'],
      ['Tamper Switch','TS'],['Low Air Switch','LA'],['High Air Switch','HA'],
      ['Power Supply','PWR'],['Batteries','BAT'],['Annunciator','ANN'],
      ['Elevator Recall Bank','ELV'],['Phone Jack','PJ'],['Fire Phone','FP'],['Other (Specify)',''],
    ];
    const sumData = {};
    PDF_FA_DEVICES.forEach((d, i) => {
      const id = 'fa-dev-' + i;
      sumData[d[1]] = {
        total:   document.getElementById(id+'-total')?.value || '',
        passN:   document.getElementById(id+'-pass')?.value  || '',
        failN:   document.getElementById(id+'-fail')?.value  || '',
        passPct: document.getElementById(id+'-pct-pass')?.textContent?.trim() || '',
        failPct: document.getElementById(id+'-pct-fail')?.textContent?.trim() || '',
        nt:      document.getElementById(id+'-nt')?.value    || '',
        nf:      document.getElementById(id+'-nf')?.value    || '',
        notes:   document.getElementById(id+'-notes')?.value || '',
      };
    });
    const sumCols = [
      {label:'DEVICES/SIGNALS/SYSTEMS',w:120},{label:'KEY',w:30},{label:'TOTAL',w:40},
      {label:'PASS #',w:40},{label:'FAIL #',w:40},{label:'PASS %',w:40},{label:'FAIL %',w:40},
      {label:'NT',w:30},{label:'NF',w:30},{label:'NOTES',w:130},
    ]; // 540
    table(sumCols, PDF_FA_DEVICES.map(([name,key]) => {
      const d = sumData[key] || {};
      return [name,key,d.total||'',d.passN||'',d.failN||'',d.passPct||'',d.failPct||'',d.nt||'',d.nf||'',d.notes||''];
    }), 13);
    gap(6);
    subHdr('ON SITE SYSTEM NOTES');
    table(
      [{label:'EQUIPMENT',w:130},{label:'CONDITION',w:130},{label:'NOTES & OBSERVATIONS',w:280}],
      [1,2,3,4,5].map(n => {
        const row = document.getElementById('fa-onsite-row-'+n);
        const selBtn = row?.querySelector('.pf-btn.selected');
        const cond = selBtn ? (selBtn.classList.contains('pass') ? 'PASS' : selBtn.classList.contains('fail') ? 'FAIL' : 'N/A') : '';
        return [dv('fa-onsite-eq-'+n), cond, dv('fa-onsite-notes-'+n)];
      }),
      14, 2, [1]   // wrapCol: NOTES auto-grow; pfCols: CONDITION as colored PASS/FAIL
    );

    // ── PAGE 4: AV / Door / HVAC + Additional Notes ───────────────────────────
    addPage();
    secHdr('AUXILIARY SYSTEM INFORMATION & INSPECTION RESULTS');
    subHdr('AUDIO/VISUAL FUNCTIONALITY - ANNUAL ONLY');
    [
      'VISUAL NOTIFICATION PRESENT? (TO INCLUDE STROBES & COMBOS)',
      'IF PRESENT - WHEN IN ALARM, LIGHTING IS SYNCHRONIZED?',
      'IF PRESENT - ALL LIGHTING APPLIANCES ARE UNOBSTRUCTED AND CLEARLY VISIBLE?',
      'AUDIBLE NOTIFICATION PRESENT? (TO INCLUDE BELLS, CHIMES, & HORNS & COMBOS)',
    ].forEach((lbl, i) => auxResultRow('fa-av-card', i, lbl));
    dataRow([{ label:'A/V NOTES', val: dv('fa-av-notes'), w: PW }], 16, 8, 3);
    gap(4);
    subHdr('DOOR HOLDER FUNCTIONALITY - ANNUAL ONLY');
    [
      'DOOR HOLDER HARDWARE PRESENT (TO INCLUDE MAGNETIC LOCKS, CARD ACCESS)',
      'IF PRESENT - ALL DOOR HARDWARE FREE FROM DAMAGE?',
      'IF PRESENT - ALL DOOR RELEASE AND CLOSE AS INTENDED UPON ALARM ACTIVATION?',
    ].forEach((lbl, i) => auxResultRow('fa-door-card', i, lbl));
    dataRow([{ label:'DOOR HOLDER NOTES', val: dv('fa-door-notes'), w: PW }], 16, 8, 3);
    gap(4);
    subHdr('HVAC CONTROL - ANNUAL ONLY');
    auxResultRow('fa-hvac-card', 0, 'HVAC SHUT DOWN PRESENT?');
    dataRow([
      { label:'HVAC METHOD', val: dv('fa-hvac-method'), w: PW/2 },
      { label:'HVAC NOTES',  val: dv('fa-hvac-notes'),  w: PW/2 },
    ]);
    gap(6);
    subHdr('ADDITIONAL NOTES/OBSERVATIONS/SITE SPECIFIC NOTES');
    const onsiteNotesEl = document.getElementById('fa-onsite-notes-text');
    textArea(onsiteNotesEl?.value?.trim() || '', 50);

    // ── PAGE 5: Sub Panel ─────────────────────────────────────────────────────
    addPage();
    secHdr('SUB PANEL / POWER SUPPLY INFORMATION');
    while (spRows.length < 15) spRows.push(Array(8).fill(''));
    table(
      [{label:'LOCATION',w:80},{label:'MAKE',w:60},{label:'CIRCUIT',w:55},{label:'AMPS',w:45},
       {label:'L BATT',w:50},{label:'R BATT',w:50},{label:'SPVSD?',w:50},{label:'PASS/FAIL',w:50},{label:'NOTES',w:100}],
      spRows.map(r => [...r, '']), 13, null, [4, 5, 6, 7]
    );

    // ── PAGE 6: Detection Devices ─────────────────────────────────────────────
    addPage();
    secHdr('DEVICES — FIRE DETECTION');
    while (detRows.length < 20) detRows.push(Array(6).fill(''));
    table(
      [{label:'TYPE',w:60},{label:'LOCATION',w:200},{label:'SCAN ID',w:60},{label:'ADDRESS',w:60},{label:'ALARM',w:80},{label:'SUPERVISORY',w:80}],
      detRows, 13, null, [4, 5]
    );

    // ── PAGE 7: Flow Switches ─────────────────────────────────────────────────
    addPage();
    secHdr('FLOW SWITCHES (SPRINKLER SYSTEMS)');
    while (flowRows.length < 20) flowRows.push(Array(6).fill(''));
    table(
      [{label:'TYPE',w:60},{label:'LOCATION',w:200},{label:'SCAN ID',w:60},{label:'ADDRESS',w:60},{label:'SUPERVISORY',w:80},{label:'SECONDS',w:80}],
      flowRows, 13, null, [4]
    );

    // ── PAGE 8: Tamper Switches ───────────────────────────────────────────────
    addPage();
    secHdr('TAMPER SWITCHES (SPRINKLER SYSTEMS)');
    while (tamperRows.length < 20) tamperRows.push(Array(6).fill(''));
    table(
      [{label:'TYPE',w:60},{label:'LOCATION',w:200},{label:'SCAN ID',w:60},{label:'ADDRESS',w:60},{label:'SUPERVISORY',w:80},{label:'NOTES',w:80}],
      tamperRows, 13, null, [4]
    );

    // ── PAGE 9: Deficiency + Batteries + Notes + Signatures ───────────────────
    addPage();
    secHdr('DEFICIENCY LIST');
    const deficList = [];
    document.querySelectorAll('#fa-defic-tbody tr').forEach((r, i) => {
      deficList.push([String(i+1), r.querySelector('td:nth-child(2) input')?.value?.trim()||'', '']);
    });
    (data.deficiencies||[]).forEach((d,i) => {
      if (!deficList.find(r => r[1]===d.item)) deficList.push([String(deficList.length+1), d.item||'', '']);
    });
    while (deficList.length < 10) deficList.push(Array(3).fill(''));
    table(
      [{label:'#',w:25},{label:'DEFICIENCY',w:515}],
      deficList.map(r => [r[0], r[1]]), 14, 1
    );
    gap(6);
    subHdr('FAILED BATTERIES (IF APPLICABLE)');
    while (batRows.length < 4) batRows.push(Array(4).fill(''));
    // One battery per row (was two-per-row); LOCATIONS wraps.
    table(
      [{label:'SIZE (AH)',w:90},{label:'TYPE',w:120},{label:'COUNT',w:80},{label:'LOCATIONS',w:250}],
      batRows.map(r => [r[0]||'', r[1]||'', r[2]||'', r[3]||'']), 14, 3
    );
    gap(6);
    subHdr('GENERAL NOTES & SITE OBSERVATIONS');
    const notesList = [];
    document.querySelectorAll('#fa-notes-tbody tr').forEach((r, i) => {
      const txt = r.querySelector('td:nth-child(2) input')?.value?.trim()||'';
      notesList.push([String(i+1), txt]);
    });
    while (notesList.length < 3) notesList.push(['','']);
    table([{label:'#',w:25},{label:'NOTE',w:515}], notesList, 14, 1);
    gap(10);
    // Signatures
    checkPage(sc(60));
    const sigH = sc(35), sigW = PW/2-10;
    page.drawRectangle({ x:ML, y:ry(sigH), width:sigW, height:sigH, color:lgray, borderColor:navy, borderWidth:0.5 });
    page.drawText('INSPECTOR SIGNATURE:', { x:ML+3, y:ry(sigH)+sigH-8, size:7, font:hFont, color:navy });
    if (sigHasData) {
      try {
        const sigCanvas = document.getElementById('sig-canvas');
        const b64 = sigCanvas.toDataURL('image/png').split(',')[1];
        const ab  = Uint8Array.from(atob(b64), c => c.charCodeAt(0)).buffer;
        const sImg  = await pdfDoc.embedPng(ab);
        const sDims = sImg.scaleToFit(sigW - 8, sigH - 14);
        page.drawImage(sImg, { x: ML + 4, y: ry(sigH) + 3, width: sDims.width, height: sDims.height });
      } catch(_) {}
    } else {
      const sf = form.createTextField(fid());
      sf.setText(''); // blank, signable box (name goes in the PRINT NAME field below) — matches other reports
      sf.addToPage(page, { x:ML+2, y:ry(sigH)+2, width:sigW-4, height:sigH-12, font: rFont });
      sf.setFontSize(sc(9));
    }
    page.drawRectangle({ x:ML+PW/2+10, y:ry(sigH), width:sigW, height:sigH, color:lgray, borderColor:navy, borderWidth:0.5 });
    page.drawText('CLIENT SIGNATURE:', { x:ML+PW/2+13, y:ry(sigH)+sigH-8, size:7, font:hFont, color:navy });
    if (custSigHasData) {
      try {
        const cc  = document.getElementById('cust-sig-canvas');
        const b64 = cc.toDataURL('image/png').split(',')[1];
        const ab  = Uint8Array.from(atob(b64), c => c.charCodeAt(0)).buffer;
        const cImg  = await pdfDoc.embedPng(ab);
        const cDims = cImg.scaleToFit(sigW - 8, sigH - 14);
        page.drawImage(cImg, { x: ML+PW/2+14, y: ry(sigH) + 3, width: cDims.width, height: cDims.height });
      } catch(_) {}
    } else {
      const cf = form.createTextField(fid());
      cf.setText('');
      cf.addToPage(page, { x:ML+PW/2+12, y:ry(sigH)+2, width:sigW-4, height:sigH-12, font: rFont });
      cf.setFontSize(sc(9));
    }
    curY += sigH + 4;
    dataRow([
      { label:'INSPECTOR DATE', val: data.signature?.date || data.inspection?.date || '', w: PW/2 },
      { label:'CLIENT DATE',    val: fd['cust-sig-date'] || '', w: PW/2 },
    ]);
    dataRow([
      { label:'INSPECTOR PRINT NAME', val: data.signature?.name || data.inspection?.inspectorName || '', w: PW/2 },
      { label:'CLIENT PRINT NAME',    val: fd['cust-sig-name'] || '', w: PW/2 },
    ]);

    // ── Photos page ───────────────────────────────────────────────────────────
    if (inspectionPhotos.length > 0) {
      addPage();
      secHdr('INSPECTION PHOTOS');
      const photoW = Math.floor((PW - 10) / 2);
      const photoH = sc(140);
      let col = 0;
      for (let i = 0; i < inspectionPhotos.length; i++) {
        const photo = inspectionPhotos[i];
        checkPage(photoH + 30);
        const px = ML + col * (photoW + 10);
        try {
          const b64 = photo.dataUrl.split(',')[1];
          const ab  = Uint8Array.from(atob(b64), c => c.charCodeAt(0)).buffer;
          const img = photo.dataUrl.startsWith('data:image/png')
            ? await pdfDoc.embedPng(ab)
            : await pdfDoc.embedJpg(ab);
          const dims = img.scaleToFit(photoW, photoH);
          page.drawImage(img, { x: px, y: ry(photoH) + (photoH - dims.height), width: dims.width, height: dims.height });
        } catch(_) {
          page.drawRectangle({ x: px, y: ry(photoH), width: photoW, height: photoH, color: rgb(0.93,0.93,0.93) });
          page.drawText('Image unavailable', { x: px + photoW/2 - 30, y: ry(photoH) + photoH/2, size: sc(8), font: rFont, color: rgb(0.5,0.5,0.5) });
        }
        // Photo number badge
        page.drawRectangle({ x: px+2, y: ry(photoH)+photoH-14, width: 40, height: sc(12), color: rgb(0,0,0) });
        page.drawText('Photo ' + (i+1), { x: px+4, y: ry(photoH)+photoH-7, size: sc(7), font: hFont, color: white });
        // Note below photo
        if (photo.note) {
          const noteLines = wrap(photo.note, sc(7), photoW);
          noteLines.forEach((l, li) => {
            page.drawText(l, { x: px, y: ry(photoH) - sc(10) - li*sc(9), size: sc(7), font: rFont, color: blk });
          });
        }
        col++;
        if (col >= 2) { col = 0; curY += photoH + 22; }
      }
      if (col > 0) curY += photoH + 22;
    }

    // Return bytes to caller
    return await pdfDoc.save();
}

// ─────────────────────────────────────────────────────────────────────────────
// KITCHEN HOOD SUPPRESSION PDF — fire-alarm-style editable format
// ─────────────────────────────────────────────────────────────────────────────
async function buildHoodPDFBytes() {
  if (!window.PDFLib) throw new Error('PDF library not loaded. Please refresh.');
  const data = collectAllData();
  const { PDFDocument, rgb, StandardFonts } = window.PDFLib;
  const pdfDoc = await PDFDocument.create();
  const form   = pdfDoc.getForm();
  const hFont  = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const rFont  = await pdfDoc.embedFont(StandardFonts.Helvetica);

  const W = 612, PH = 792, ML = 36, PW = 540, MT = 36, MB = 36;
  let page, curY, _fid = 0;
  let _pageCount = 0;
  const fid = () => 'hood_' + (++_fid);

  const FIRE_RED = rgb(0.72, 0.08, 0.08);
  const amber  = rgb(0.85, 0.47, 0.00);
  const navy   = rgb(0.13, 0.21, 0.42);
  const sky    = rgb(0.71, 0.80, 0.93);
  const gold   = rgb(1.0,  1.0,  0.75);
  const lgray  = rgb(0.94, 0.94, 0.94);
  const cream  = rgb(0.99, 0.98, 0.92);
  const white  = rgb(1, 1, 1);
  const blk    = rgb(0, 0, 0);
  const green  = rgb(0.06, 0.50, 0.22);
  const red    = rgb(0.76, 0.10, 0.10);
  const slate  = rgb(0.39, 0.45, 0.55);

  const propName = data.property?.name || '';
  const inspDate = data.inspection?.date || '';

  // Pad below the top edge so printers don't clip the running header bar.
  const HDR_PAD = 10;
  const drawPageHeader = () => {
    page.drawRectangle({ x: 0, y: PH - HDR_PAD - 20, width: W, height: sc(20), color: navy });
    page.drawText(propName, { x: ML, y: PH - HDR_PAD - 14, size: sc(8), font: hFont, color: white });
    const dtW = hFont.widthOfTextAtSize(inspDate, sc(8));
    page.drawText(inspDate, { x: W - ML - dtW, y: PH - HDR_PAD - 14, size: sc(8), font: hFont, color: white });
  };

  const addPage = () => {
    page = pdfDoc.addPage([W, PH]);
    _pageCount++;
    curY = MT;
    if (_pageCount > 1) { drawPageHeader(); curY = 28 + HDR_PAD; }
  };
  const ry = (h) => PH - curY - h;
  const ty = (h, a = 3) => PH - curY - h + a;
  const checkPage = (needed) => { if (curY + needed > PH - MB) addPage(); };
  const gap = (h) => { curY += sc(h); };

  const wrap = (text, sz, maxW) => wrapText(text, sz, maxW, (s, z) => rFont.widthOfTextAtSize(s, z));

  const secHdr = (title) => {
    checkPage(sc(18));
    page.drawRectangle({ x: ML, y: ry(sc(17)), width: PW, height: sc(17), color: navy });
    page.drawText(title, { x: ML+4, y: ty(sc(17), sc(5)), size: sc(9), font: hFont, color: white });
    curY += sc(18);
  };
  const subHdr = (title) => {
    checkPage(sc(14));
    page.drawRectangle({ x: ML, y: ry(sc(13)), width: PW, height: sc(13), color: sky });
    page.drawText(title, { x: ML+4, y: ty(sc(13), sc(4)), size: sc(7.5), font: hFont, color: navy });
    curY += sc(14);
  };
  const mkField = (val, x, fieldY, w, h, multiline) => {
    page.drawRectangle({ x, y: fieldY, width: w, height: h, color: gold, borderColor: sky, borderWidth: 0.5 });
    const f = form.createTextField(fid());
    f.setText(String(val || ''));
    if (multiline) f.enableMultiline();
    f.addToPage(page, { x: x+1, y: fieldY+1, width: w-2, height: h-2, font: rFont });
    f.setFontSize(sc(8));
  };
  const dataRow = (cols, fh = 12, lh = 8, gp = 3) => {
    const FH = sc(fh), LH = sc(lh), GP = sc(gp);
    checkPage(LH + FH + GP);
    let x = ML;
    cols.forEach(c => {
      page.drawText((c.label||'')+':', { x: x+2, y: ty(LH, LH-sc(3)), size: sc(6), font: hFont, color: navy });
      mkField(c.val, x, ry(LH+FH), c.w, FH, false);
      x += c.w;
    });
    curY += LH + FH + GP;
  };

  const dv   = (id) => document.getElementById(id)?.value?.trim() || '';
  const ddat = (id) => document.getElementById(id)?.dataset?.val?.trim() || '';

  // ── PAGE 1 ─────────────────────────────────────────────────────────────────
  addPage();

  curY = await drawReportHeader({
    pdfDoc, page, form, hFont, rFont, sc, W, PH, ML, PW, fid, data,
    fd: data.fieldData || {},
    dv,
    title: 'KITCHEN HOOD SUPPRESSION INSPECTION REPORT',
    C: { FIRE_RED, navy, sky, gold, lgray, white, blk }
  });

  // Overall status bar
  const stVal = (data.overallStatus || '').toUpperCase();
  const stColor = stVal === 'COMPLIANT' ? green : stVal === 'DEFICIENT' ? red : stVal === 'IMPAIRED' ? amber : slate;
  checkPage(sc(22));
  page.drawRectangle({ x: ML, y: ry(sc(18)), width: PW, height: sc(18), color: stColor });
  page.drawText('OVERALL SYSTEM STATUS', { x: ML+8, y: ty(sc(18), sc(6)), size: sc(6.5), font: hFont, color: white });
  page.drawText(stVal || 'PENDING', { x: ML + 8 + hFont.widthOfTextAtSize('OVERALL SYSTEM STATUS', sc(6.5)) + sc(12), y: ty(sc(18), sc(6)), size: sc(9.5), font: hFont, color: white });
  curY += sc(18);
  gap(6);

  // Property name + address are drawn by the shared header above; continue with contact info.
  const phoneVal = dv('property-contact-phone');
  dataRow([
    { label: 'PROPERTY CONTACT', val: data.property?.contact || '', w: PW / 3 },
    { label: 'CONTACT PHONE',    val: phoneVal,                     w: PW / 3 },
    { label: 'COMPANY',          val: data.property?.company || '', w: PW / 3 },
  ]);
  gap(6);

  // Deficiencies
  if (data.deficiencies && data.deficiencies.length > 0) {
    secHdr('DEFICIENCIES — ' + data.deficiencies.length + ' ITEM(S)');
    data.deficiencies.forEach(d => {
      const text = d.item + (d.description ? ': ' + d.description : '');
      const defLines = wrap(text, sc(8), PW - 20);
      const defRowH = Math.max(sc(18), defLines.length * sc(11) + sc(8));
      checkPage(defRowH + 2);
      page.drawRectangle({ x: ML, y: ry(defRowH), width: PW, height: defRowH, color: rgb(0.99, 0.93, 0.93), borderColor: red, borderWidth: 0.5 });
      page.drawText('•', { x: ML+4, y: ry(defRowH) + defRowH - 9, size: sc(8), font: hFont, color: red });
      defLines.forEach((line, li) => {
        page.drawText(line, { x: ML+14, y: ry(defRowH) + defRowH - sc(10) - li*sc(11), size: sc(8), font: rFont, color: blk });
      });
      curY += defRowH + 3;
    });
    gap(4);
  }

  // NFPA References and Procedure
  const NFPA_LINES = [
    'YOUR KITCHEN HOOD EXTINGUISHING SYSTEM(S) ARE REQUIRED TO BE THOROUGHLY INSPECTED, TESTED AND MAINTAINED EVERY 6',
    'MONTHS BY AN APPROVED SERVICING COMPANY IN ACCORDANCE WITH THE FOLLOWING NFPA CHAPTER REFERENCES:',
    'NFPA 96 2017 EDITION',
    'TESTING MUST INCLUDE CONTROL EQUIPMENT, INITIATING DEVICES, HVAC/ ELECTRICAL/GAS SHUTDOWN, LINKAGE REPLACEMENT',
    '(ANNUALLY) AND ALARM NOTIFICATION APPLIANCES. SEE THE BELOW LIST OF VARIOUS TESTING DEVICES:',
    'VISUAL AND FUNCTIONAL TESTING OF THE INITIATING COMPONENTS.',
    'VISUAL INSPECTION TO VERIFY PROPER SUPPRESSION APPLICATION.',
    'VISUAL INSPECTION & VERIFICATION OF CYLINDER SERVICE DATES.',
    'REPLACEMENT OF COMPONENTS PER CODE REQUIREMENTS (SEMI-ANNUALLY).',
    'VISUAL AND FUNCTIONAL TESTING OF ALL SHUNT OPERATIONS AND SHUTDOWN.',
    'ALARM SIGNAL TRANSMISSION TO CENTRAL STATION VERIFICATION (IF APPLICABLE)',
    'VISUAL AND FUNCTIONAL VERIFICATION OF ALARM SIGNALS SENT TO THE FIRE ALARM PANEL.',
    'VISUAL INSPECTION OF PORTABLE EXTINGUISHER UNITS AND VERIFICATION OF PROPER CLASS RATING FOR APPLICATION',
  ];
  const nfpaLineH = sc(9);
  const nfpaBoxH = NFPA_LINES.length * nfpaLineH + 14;
  checkPage(sc(18) + nfpaBoxH + sc(4));
  secHdr('NFPA REFERENCES AND PROCEDURE');
  page.drawRectangle({ x: ML, y: ry(nfpaBoxH), width: PW, height: nfpaBoxH, color: cream, borderColor: sky, borderWidth: 0.5 });
  let ntY = ry(nfpaBoxH) + nfpaBoxH - nfpaLineH - 2;
  NFPA_LINES.forEach(line => {
    page.drawText(line, { x: ML+6, y: ntY, size: sc(7), font: rFont, color: navy });
    ntY -= nfpaLineH;
  });
  curY += nfpaBoxH + 6;

  // ── PAGE 2+: PER-HOOD CONTENT ───────────────────────────────────────────────
  addPage();

  const activeHoods = typeof getActiveHoods === 'function'
    ? getActiveHoods()
    : (activeHoodList || []).filter(h => !h.excluded);

  const CHECKLIST_KEYS = [
    'no-fire-signs','no-design-change','fusible-link-test','pull-station-op','conduit-secured',
    'blown-down','hazard-covered','nozzle-caps','pressure-gauge','chem-weight',
    'actuation-hose','exhaust-fan','makeup-air-pb','elec-shutdown1','makeup-air',
    'elec-shutdown2','gas-valve','fan-warning-sign','filters-replaced','service-tag',
    'compliant','reset-normal','no-deficiencies','portable-ext','class-k',
  ];
  const CHECKLIST_LABELS = {
    'no-fire-signs':    'SYSTEM SHOWS NO VISIBLE SIGNS THAT IT HAS FIRED OR BEEN TAMPERED WITH',
    'no-design-change': 'SYSTEM DESIGN HAS NOT BEEN CHANGED',
    'fusible-link-test':'FUSIBLE LINK TESTED & SYSTEM ACTIVATED UPON TEST',
    'pull-station-op':  'MANUAL PULL STATION OPERATION & SUCCESSFULLY ACTIVATED SYSTEMS',
    'conduit-secured':  'CONFIRMED ALL CONDUIT & PIPING IS SECURED',
    'blown-down':       'PROPER BLOWN DOWN PERFORMED',
    'hazard-covered':   'EACH HAZARD PROPERLY COVERED WITH CORRECT NOZZLES',
    'nozzle-caps':      'ALL NOZZLE CAPS/SEALS ARE REPLACED & CLEAR OF BLOCKAGE',
    'pressure-gauge':   'CHECKED PRESSURE GAUGE INDICATOR FOR OPERABLE RANGE',
    'chem-weight':      'INTERNAL INSPECTION & CHEMICAL WEIGHT VERIFIED (ANSUL)',
    'actuation-hose':   'ACTUATION HOSE INSPECTED FOR DAMAGE',
    'exhaust-fan':      'VERIFIED EXHAUST FAN IS OPERATIONAL',
    'makeup-air-pb':    'VERIFIED MAKE-UP AIR IS OPERATIONAL (PAINT BOOTH)',
    'elec-shutdown1':   'ELECTRIC SHUT DOWN OPERATIONAL',
    'makeup-air':       'VERIFIED MAKE-UP AIR IS OPERATIONAL',
    'elec-shutdown2':   'ELECTRIC SHUTDOWN OPERATIONAL',
    'gas-valve':        'PROPER OPERATION OF WORKING GAS VALVE(S)',
    'fan-warning-sign': 'FAN WARNING SIGN ON HOOD',
    'filters-replaced': 'ALL FILTERS ARE REPLACED',
    'service-tag':      'INSPECTION & SERVICE TAG ON SYSTEM CYLINDER/MANUAL PULL',
    'compliant':        'SYSTEM IS COMPLIANT',
    'reset-normal':     'SYSTEM RESET TO NORMAL OPERATION',
    'no-deficiencies':  'NO DEFICIENCIES WITH OPERATION OR COVERAGE',
    'portable-ext':     'PROPER HAND HELD PORTABLE EXTINGUISHER(S)',
    'class-k':          'PROPERLY SERVICED (CLASS K IN KITCHEN)',
  };

  for (let hi = 0; hi < activeHoods.length; hi++) {
    const hood = activeHoods[hi];
    const hid = hood.id;
    if (hi > 0) addPage();

    // Amber identifier bar
    checkPage(sc(22));
    page.drawRectangle({ x: ML, y: ry(sc(20)), width: PW, height: sc(20), color: amber });
    page.drawText('HOOD:', { x: ML+8, y: ty(sc(20), sc(6)), size: sc(7), font: hFont, color: white });
    page.drawText(hood.identifier || '(not specified)', { x: ML+44, y: ty(sc(20), sc(7)), size: sc(10), font: hFont, color: white });
    curY += sc(20);
    gap(4);

    // 4×4 System Info table
    secHdr('SYSTEM INFORMATION');
    gap(2);
    const sysFields = [
      ['SYSTEM TYPE',           dv(`h${hid}-sys-type`)],
      ['MANUFACTURER',          dv(`h${hid}-mfr`)],
      ['MODEL',                 dv(`h${hid}-model`)],
      ['TEST DATE / LAST HYDRO',dv(`h${hid}-test-date`)],
      ['CARTRIDGE DATE',        dv(`h${hid}-cart-date`)],
      ['CARTRIDGE WEIGHT',      dv(`h${hid}-cart-weight`)],
      ['6 YR / HYDRO DUE DATE', dv(`h${hid}-hydro-due`)],
      ['U.L 300 COMPLIANT',     dv(`h${hid}-ul300`)],
    ];
    const cellW = PW / 4;
    const cellH = sc(24);
    for (let row = 0; row < 2; row++) {
      checkPage(cellH + 4);
      let cx = ML;
      for (let col = 0; col < 4; col++) {
        const fi = row * 4 + col;
        const [lbl, val] = sysFields[fi];
        page.drawRectangle({ x: cx, y: ry(cellH), width: cellW, height: cellH, color: lgray, borderColor: sky, borderWidth: 0.4 });
        page.drawText(lbl, { x: cx+3, y: ry(cellH)+cellH-8, size: sc(5.5), font: hFont, color: navy });
        page.drawRectangle({ x: cx+1, y: ry(cellH)+1, width: cellW-2, height: sc(12), color: gold, borderColor: sky, borderWidth: 0.3 });
        const vf = form.createTextField(fid());
        vf.setText(val);
        vf.addToPage(page, { x: cx+2, y: ry(cellH)+2, width: cellW-4, height: sc(10), font: rFont });
        vf.setFontSize(sc(7));
        cx += cellW;
      }
      curY += cellH + 2;
    }
    gap(4);

    // Inspection Results — 25-item Y/N/N/A checklist
    secHdr('INSPECTION RESULTS');
    CHECKLIST_KEYS.forEach(key => {
      const rowId = `h${hid}-${key}`;
      const result = ddat(`row-${rowId}`).toUpperCase();
      const noteVal = dv(`note-${rowId}`);
      const rowH = sc(14);
      const hasNote = !!noteVal;
      checkPage(rowH + (hasNote ? 12 : 0) + 1);
      const bg = result === 'Y' ? rgb(0.94, 0.99, 0.95) : result === 'N' ? rgb(0.99, 0.93, 0.93) : lgray;
      page.drawRectangle({ x: ML, y: ry(rowH), width: PW, height: rowH, color: bg, borderColor: sky, borderWidth: 0.3 });
      const lbl = CHECKLIST_LABELS[key] || key;
      let dispLbl = lbl;
      while (dispLbl.length > 4 && rFont.widthOfTextAtSize(dispLbl, sc(7)) > PW - 50) {
        dispLbl = dispLbl.slice(0, -4) + '...';
        break;
      }
      page.drawText(dispLbl, { x: ML+4, y: ty(rowH, rowH-8), size: sc(7), font: rFont, color: navy });
      const bW = 30;
      const bColor = result === 'Y' ? green : result === 'N' ? red : rgb(0.6, 0.6, 0.6);
      page.drawRectangle({ x: ML+PW-bW-2, y: ry(rowH)+2, width: bW, height: rowH-4, color: bColor });
      const bTxt = result || 'N/A';
      page.drawText(bTxt, {
        x: ML+PW-bW-2 + (bW - hFont.widthOfTextAtSize(bTxt, sc(7)))/2,
        y: ry(rowH)+4, size: sc(7), font: hFont, color: white
      });
      curY += rowH + 1;
      if (hasNote) {
        const nH = sc(11);
        checkPage(nH + 1);
        page.drawRectangle({ x: ML+8, y: ry(nH), width: PW-8, height: nH, color: rgb(1, 1, 0.88), borderColor: sky, borderWidth: 0.3 });
        page.drawText('-> ' + noteVal, { x: ML+12, y: ry(nH)+3, size: sc(6.5), font: rFont, color: blk });
        curY += nH + 1;
      }
    });
    gap(4);

    // Date Items
    subHdr('DATE ITEMS');
    const dateItems = [
      { key: 'battery',  label: 'DATES ON MODULAR BATTERY' },
      { key: 'actuator', label: 'LINEAR ACTUATOR MANUFACTURER DATE' },
    ];
    dateItems.forEach(item => {
      const rowId = `h${hid}-${item.key}`;
      const result = ddat(`row-${rowId}`).toUpperCase();
      const dateVal = dv(`h${hid}-${item.key}-date`);
      const noteVal = dv(`note-${rowId}`);
      const rowH = sc(16);
      checkPage(rowH + (noteVal ? 12 : 0) + 1);
      page.drawRectangle({ x: ML, y: ry(rowH), width: PW, height: rowH, color: lgray, borderColor: sky, borderWidth: 0.3 });
      page.drawText(item.label, { x: ML+4, y: ty(rowH, rowH-8), size: sc(7), font: hFont, color: navy });
      page.drawText('DATE:', { x: ML+PW-120, y: ty(rowH, rowH-8), size: sc(6), font: hFont, color: navy });
      mkField(dateVal, ML+PW-100, ry(rowH)+2, 64, rowH-4, false);
      const bW = 28;
      const bColor = result === 'Y' ? green : result === 'N' ? red : rgb(0.6, 0.6, 0.6);
      page.drawRectangle({ x: ML+PW-bW-2, y: ry(rowH)+2, width: bW, height: rowH-4, color: bColor });
      const bTxt = result || 'N/A';
      page.drawText(bTxt, {
        x: ML+PW-bW-2 + (bW - hFont.widthOfTextAtSize(bTxt, sc(7)))/2,
        y: ry(rowH)+4, size: sc(7), font: hFont, color: white
      });
      curY += rowH + 1;
      if (noteVal) {
        const nH = sc(11);
        checkPage(nH + 1);
        page.drawRectangle({ x: ML+8, y: ry(nH), width: PW-8, height: nH, color: rgb(1, 1, 0.88), borderColor: sky, borderWidth: 0.3 });
        page.drawText('-> ' + noteVal, { x: ML+12, y: ry(nH)+3, size: sc(6.5), font: rFont, color: blk });
        curY += nH + 1;
      }
    });
    gap(4);

    // Operations
    secHdr('OPERATIONS');

    // Shunt location
    checkPage(sc(20));
    page.drawText('ELECTRICAL SHUNT LOCATION:', { x: ML+2, y: ty(sc(14), sc(9)), size: sc(6.5), font: hFont, color: navy });
    mkField(dv(`h${hid}-shunt-loc`), ML+142, ry(sc(14)), PW-142, 13, false);
    curY += sc(14) + sc(3);

    // Grease accumulation
    checkPage(sc(20));
    page.drawText('GREASE ACCUMULATION:', { x: ML+2, y: ty(sc(14), sc(9)), size: sc(6.5), font: hFont, color: navy });
    const greaseVal = dv(`h${hid}-grease`).toUpperCase();
    const greaseColors = { LOW: green, MODERATE: amber, EXCESSIVE: red };
    ['LOW','MODERATE','EXCESSIVE'].forEach((g, gi) => {
      const sel = greaseVal === g;
      const gx = ML + 122 + gi * 68;
      const gColor = sel ? greaseColors[g] : lgray;
      page.drawRectangle({ x: gx, y: ry(sc(14))+1, width: 63, height: sc(12), color: gColor, borderColor: sky, borderWidth: 0.4 });
      page.drawText(g, { x: gx + (63 - hFont.widthOfTextAtSize(g, sc(6.5)))/2, y: ry(sc(14))+4, size: sc(6.5), font: hFont, color: sel ? white : navy });
    });
    curY += sc(14) + sc(2);
    const greaseNoteVal = dv(`h${hid}-grease-note`);
    if (greaseNoteVal) {
      const gnLines = wrap(greaseNoteVal, sc(8), PW - 10);
      const gnH = Math.max(sc(12), gnLines.length * sc(11) + sc(6));
      checkPage(gnH + 2);
      page.drawRectangle({ x: ML, y: ry(gnH), width: PW, height: gnH, color: gold, borderColor: sky, borderWidth: 0.5 });
      gnLines.forEach((line, li) => {
        page.drawText(line, { x: ML+4, y: ry(gnH) + gnH - sc(10) - li*sc(11), size: sc(8), font: rFont, color: blk });
      });
      curY += gnH + 2;
    }
    gap(2);

    // Verified Operations
    checkPage(sc(20));
    page.drawText('VERIFIED OPERATIONS:', { x: ML+2, y: ty(sc(14), sc(9)), size: sc(6.5), font: hFont, color: navy });
    const verifItems = [
      { key: 'alarm', label: 'ALARM' },
      { key: 'elec',  label: 'ELEC/LIGHTS' },
      { key: 'appl',  label: 'APPLIANCES' },
    ];
    verifItems.forEach((vi, vii) => {
      const vVal = ddat(`row-h${hid}-verif-${vi.key}`).toUpperCase();
      const vx = ML + 122 + vii * 95;
      page.drawText(vi.label + ':', { x: vx, y: ty(sc(14), sc(9)), size: sc(6), font: hFont, color: navy });
      const bW = 26;
      const bColor = vVal === 'Y' ? green : vVal === 'N' ? red : rgb(0.6, 0.6, 0.6);
      page.drawRectangle({ x: vx+58, y: ry(sc(14))+2, width: bW, height: sc(10), color: bColor });
      const vTxt = vVal || 'N/A';
      page.drawText(vTxt, { x: vx+58+(bW-hFont.widthOfTextAtSize(vTxt,6.5))/2, y: ry(sc(14))+4, size: sc(6.5), font: hFont, color: white });
    });
    curY += sc(14) + sc(2);
    const verifNoteVal = dv(`h${hid}-verif-note`);
    if (verifNoteVal) {
      checkPage(sc(14));
      mkField(verifNoteVal, ML, ry(sc(12)), PW, 12, false);
      curY += sc(13);
    }
    gap(2);

    // Replace Fusible Links — title bar, then label row, then field row
    checkPage(sc(42));
    subHdr('REPLACE FUSIBLE LINKS (SEMI-ANNUAL)');
    gap(3);
    const fusGroups = [
      { label:'COUNT 1', val:dv(`h${hid}-fusible-count1`) },
      { label:'COUNT 2', val:dv(`h${hid}-fusible-count2`) },
      { label:'COUNT 3', val:dv(`h${hid}-fusible-count3`) },
      { label:'TEMP 1 (°F)', val:dv(`h${hid}-fusible-temp1`) },
      { label:'TEMP 2 (°F)', val:dv(`h${hid}-fusible-temp2`) },
      { label:'TEMP 3 (°F)', val:dv(`h${hid}-fusible-temp3`) },
    ];
    const fusColW = PW / 6;
    const fusLblH = sc(10), fusFldH = sc(13);
    checkPage(fusLblH + fusFldH + 4);
    let flx = ML;
    fusGroups.forEach(fg => {
      page.drawText(fg.label, { x: flx+2, y: ty(fusLblH, fusLblH-3), size: sc(6.5), font: hFont, color: navy });
      flx += fusColW;
    });
    curY += fusLblH;
    flx = ML;
    fusGroups.forEach(fg => {
      mkField(fg.val, flx, ry(fusFldH), fusColW-2, fusFldH, false);
      flx += fusColW;
    });
    curY += fusFldH + 4;

    // System Dimensions — always starts on a new page with a continuation header
    addPage();
    const contBarH = sc(14);
    page.drawRectangle({ x: ML, y: ry(contBarH), width: PW, height: contBarH, color: amber });
    page.drawText(`HOOD: ${hood.identifier || '(not specified)'} (continued)`, { x: ML+8, y: ty(contBarH, 4), size: sc(8), font: hFont, color: white });
    curY += contBarH + 4;
    secHdr('SYSTEM DIMENSIONS');
    gap(2);
    const dimFields = [
      ['PLENUM SIZE',  dv(`h${hid}-plenum-size`)],
      ['DUCT SIZE',    dv(`h${hid}-duct-size`)],
      ['NOZZLE TYPE',  dv(`h${hid}-nozzle-type`)],
      ['NOZZLE #',     dv(`h${hid}-nozzle-num`)],
    ];
    const dimCellW = PW / 4;
    const dimCellH = sc(24);
    checkPage(dimCellH + 4);
    let dcx = ML;
    dimFields.forEach(([lbl, val]) => {
      page.drawRectangle({ x: dcx, y: ry(dimCellH), width: dimCellW, height: dimCellH, color: lgray, borderColor: sky, borderWidth: 0.4 });
      page.drawText(lbl, { x: dcx+3, y: ry(dimCellH)+dimCellH-8, size: sc(5.5), font: hFont, color: navy });
      page.drawRectangle({ x: dcx+1, y: ry(dimCellH)+1, width: dimCellW-2, height: sc(12), color: gold, borderColor: sky, borderWidth: 0.3 });
      const vf = form.createTextField(fid());
      vf.setText(val);
      vf.addToPage(page, { x: dcx+2, y: ry(dimCellH)+2, width: dimCellW-4, height: sc(10), font: rFont });
      vf.setFontSize(sc(7));
      dcx += dimCellW;
    });
    curY += dimCellH + 4;

    // Appliances
    const appContainer = document.getElementById(`h${hid}-appliances`);
    const appRows = appContainer ? Array.from(appContainer.querySelectorAll('.hood-appliance-row')) : [];
    if (appRows.length > 0) {
      subHdr('APPLIANCES');
      const appColW = PW / 4;
      checkPage(sc(14));
      const appHdrCols = ['APPLIANCE','DIMENSIONS','NOZZLE #','NOZZLE HEIGHT'];
      let ahx = ML;
      appHdrCols.forEach(lbl => {
        page.drawRectangle({ x: ahx, y: ry(sc(12)), width: appColW, height: sc(12), color: sky });
        page.drawText(lbl, { x: ahx+2, y: ry(sc(12))+3, size: sc(6), font: hFont, color: navy });
        ahx += appColW;
      });
      curY += sc(12) + sc(1);

      appRows.forEach((row, ri) => {
        const appId = row.dataset.hoodAppId;
        const appVals = [
          dv(`h${hid}-app-name-${appId}`),
          dv(`h${hid}-app-dims-${appId}`),
          dv(`h${hid}-app-nozzle-${appId}`),
          dv(`h${hid}-app-height-${appId}`),
        ];
        const aRowH = sc(14);
        checkPage(aRowH + 1);
        const aBg = ri % 2 === 0 ? lgray : white;
        let arx = ML;
        appVals.forEach(val => {
          page.drawRectangle({ x: arx, y: ry(aRowH), width: appColW, height: aRowH, color: aBg, borderColor: sky, borderWidth: 0.3 });
          const af = form.createTextField(fid());
          af.setText(val);
          af.addToPage(page, { x: arx+2, y: ry(aRowH)+2, width: appColW-4, height: aRowH-4, font: rFont });
          af.setFontSize(sc(7));
          arx += appColW;
        });
        curY += aRowH + 1;
      });
    }
    gap(6);
  }

  // ── General Notes & Site Observations ──────────────────────────────────────
  const notesTbody = document.getElementById('fa-notes-tbody');
  const noteRows = notesTbody
    ? [...notesTbody.querySelectorAll('tr')].filter(r => r.querySelector('td:nth-child(2) input')?.value?.trim())
    : [];
  if (noteRows.length > 0) {
    secHdr('GENERAL NOTES & SITE OBSERVATIONS');
    gap(2);
    noteRows.forEach((nrow, idx) => {
      const ntxt = nrow.querySelector('td:nth-child(2) input')?.value?.trim() || '';
      const noteLines = wrap(ntxt, sc(8), PW - 20);
      const rowH = Math.max(sc(16), noteLines.length * sc(11) + sc(8));
      checkPage(rowH + 3);
      page.drawRectangle({ x: ML, y: ry(rowH), width: PW, height: rowH, color: lgray, borderColor: sky, borderWidth: 0.5 });
      page.drawText(String(idx + 1) + '.', { x: ML+4, y: ry(rowH) + rowH - 10, size: sc(7.5), font: hFont, color: navy });
      noteLines.forEach((line, li) => {
        page.drawText(line, { x: ML+16, y: ry(rowH) + rowH - sc(10) - li*sc(11), size: sc(8), font: rFont, color: blk });
      });
      curY += rowH + 3;
    });
    gap(4);
  }

  // ── Signatures ─────────────────────────────────────────────────────────────
  checkPage(sc(80));
  secHdr('CERTIFICATION & SIGNATURES');
  gap(4);
  const sigH = sc(35), sigW = PW / 2 - 10;

  page.drawRectangle({ x: ML, y: ry(sigH), width: sigW, height: sigH, color: lgray, borderColor: navy, borderWidth: 0.5 });
  page.drawText('INSPECTOR SIGNATURE:', { x: ML+3, y: ry(sigH)+sigH-8, size: sc(7), font: hFont, color: navy });
  if (sigHasData) {
    try {
      const sigCanvas = document.getElementById('sig-canvas');
      const b64 = sigCanvas.toDataURL('image/png').split(',')[1];
      const ab  = Uint8Array.from(atob(b64), c => c.charCodeAt(0)).buffer;
      const sImg  = await pdfDoc.embedPng(ab);
      const sDims = sImg.scaleToFit(sigW - 8, sigH - 14);
      page.drawImage(sImg, { x: ML+4, y: ry(sigH)+3, width: sDims.width, height: sDims.height });
    } catch(_) {}
  } else {
    const sf = form.createTextField(fid());
    sf.setText(data.signature?.name || '');
    sf.addToPage(page, { x: ML+2, y: ry(sigH)+2, width: sigW-4, height: sigH-12, font: rFont });
    sf.setFontSize(sc(9));
  }

  page.drawRectangle({ x: ML+PW/2+10, y: ry(sigH), width: sigW, height: sigH, color: lgray, borderColor: navy, borderWidth: 0.5 });
  page.drawText('CLIENT / REPRESENTATIVE SIGNATURE:', { x: ML+PW/2+13, y: ry(sigH)+sigH-8, size: sc(7), font: hFont, color: navy });
  if (typeof custSigHasData !== 'undefined' && custSigHasData) {
    try {
      const cc  = document.getElementById('cust-sig-canvas');
      const b64 = cc.toDataURL('image/png').split(',')[1];
      const ab  = Uint8Array.from(atob(b64), c => c.charCodeAt(0)).buffer;
      const cImg  = await pdfDoc.embedPng(ab);
      const cDims = cImg.scaleToFit(sigW - 8, sigH - 14);
      page.drawImage(cImg, { x: ML+PW/2+14, y: ry(sigH)+3, width: cDims.width, height: cDims.height });
    } catch(_) {}
  } else {
    const cf = form.createTextField(fid());
    cf.setText('');
    cf.addToPage(page, { x: ML+PW/2+12, y: ry(sigH)+2, width: sigW-4, height: sigH-12, font: rFont });
    cf.setFontSize(sc(9));
  }
  curY += sigH + 4;

  dataRow([
    { label: 'INSPECTOR DATE', val: data.signature?.date || data.inspection?.date || '', w: PW/2 },
    { label: 'CLIENT DATE',    val: '', w: PW/2 },
  ]);
  gap(4);
  dataRow([
    { label: 'INSPECTOR PRINTED NAME', val: data.signature?.name || '', w: PW/2 },
    { label: 'CLIENT PRINTED NAME',    val: dv('cust-sig-name') || '', w: PW/2 },
  ]);

  // ── Photos ────────────────────────────────────────────────────────────────
  if (inspectionPhotos && inspectionPhotos.length > 0) {
    addPage();
    secHdr('INSPECTION PHOTOS');
    const photoW = Math.floor((PW - 10) / 2);
    const photoH = sc(140);
    let col = 0;
    for (let i = 0; i < inspectionPhotos.length; i++) {
      const photo = inspectionPhotos[i];
      checkPage(photoH + 30);
      const px = ML + col * (photoW + 10);
      try {
        const b64 = photo.dataUrl.split(',')[1];
        const ab  = Uint8Array.from(atob(b64), c => c.charCodeAt(0)).buffer;
        const img = photo.dataUrl.startsWith('data:image/png')
          ? await pdfDoc.embedPng(ab)
          : await pdfDoc.embedJpg(ab);
        const dims = img.scaleToFit(photoW, photoH);
        page.drawImage(img, { x: px, y: ry(photoH) + (photoH - dims.height), width: dims.width, height: dims.height });
      } catch(_) {
        page.drawRectangle({ x: px, y: ry(photoH), width: photoW, height: photoH, color: rgb(0.93, 0.93, 0.93) });
        page.drawText('Image unavailable', { x: px+photoW/2-30, y: ry(photoH)+photoH/2, size: sc(8), font: rFont, color: rgb(0.5, 0.5, 0.5) });
      }
      page.drawRectangle({ x: px+2, y: ry(photoH)+photoH-14, width: 40, height: sc(12), color: rgb(0, 0, 0) });
      page.drawText('Photo ' + (i+1), { x: px+4, y: ry(photoH)+photoH-7, size: sc(7), font: hFont, color: white });
      if (photo.note) {
        const noteLines = wrap(photo.note, sc(7), photoW);
        noteLines.forEach((l, li) => {
          page.drawText(l, { x: px, y: ry(photoH) - sc(10) - li*sc(9), size: sc(7), font: rFont, color: blk });
        });
      }
      col++;
      if (col >= 2) { col = 0; curY += photoH + 22; }
    }
    if (col > 0) curY += photoH + 22;
  }

  return await pdfDoc.save();
}
