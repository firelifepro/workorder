//  PDF BYTES WRAPPER — returns Uint8Array for shared Drive upload
// ════════════════════════════════════════════════════════════════
async function buildHospitalPDFBytes() {
  const doc = buildHospPDF(true); // returnDoc=true
  return new Uint8Array(doc.output('arraybuffer'));
}

// ════════════════════════════════════════════════════════════════
//  SAVE & DOWNLOAD — full flow: Drive JSON + Drive PDF + schedule
// ════════════════════════════════════════════════════════════════
async function hospSaveAndDownload() {
  // ── Drive connection check ────────────────────────────────────
  if (!accessToken) {
    if (!confirm('⚠ Not connected to Google Drive — PDF will download locally only.\n\nDrive save, schedule update, and property profile will be skipped.\n\nOK to continue?')) return;
  }

  // ── Signature + name check ────────────────────────────────────
  const sigWarn  = document.getElementById('h-sig-warning');
  const sigName  = fv('h-sig-name');
  const hasSig   = !!H.inspSig;
  const hasName  = sigName.length > 0;
  if (!hasSig || !hasName) {
    if (sigWarn) {
      sigWarn.textContent = !hasSig && !hasName
        ? '⚠ Please draw your signature AND enter your printed name before saving.'
        : !hasSig
          ? '⚠ Please draw your signature in the signature box.'
          : '⚠ Please enter your printed name below the signature.';
      sigWarn.classList.add('visible');
    }
    document.getElementById('sig-canvas')?.scrollIntoView({ behavior:'smooth', block:'center' });
    return;
  }
  if (sigWarn) sigWarn.classList.remove('visible');

  // ── Button + status setup ─────────────────────────────────────
  const btn      = document.getElementById('h-save-download-btn');
  const statusEl = document.getElementById('h-pdf-status');
  if (btn)      { btn.disabled = true; btn.textContent = '⏳ Saving…'; }
  if (statusEl)   statusEl.innerHTML = '';
  const setStatus = (msg, color) => {
    if (statusEl) statusEl.innerHTML += `<div style="color:${color||'inherit'}">${msg}</div>`;
  };
  document.getElementById('h-new-insp-btn-wrap').style.display = 'none';

  saveDraft();

  let pdfBytes = null;
  let filename  = '';

  const downloadPDF = (bytes, name) => {
    const blob = new Blob([bytes], { type:'application/pdf' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url; a.download = name; a.click();
    URL.revokeObjectURL(url);
  };

  try {
    // ── 1. Build PDF ──────────────────────────────────────────────
    setStatus('Building PDF…', 'var(--slate)');
    pdfBytes = await buildHospitalPDFBytes();

    const propName = fv('property-name') || 'Hospital';
    const propSlug = propName.replace(/[^a-zA-Z0-9]/g,'_').replace(/_+/g,'_').replace(/^_|_$/g,'').slice(0,30);
    const dateStr  = fv('insp-date') || todayMT();
    const dateSlug = dateStr.replace(/-/g,'');
    filename = `FLPS_hospital_${propSlug}_${dateSlug}.pdf`;

    if (accessToken) {
      // ── 2. Save JSON to Drive ───────────────────────────────────
      try {
        setStatus('Saving inspection data…', 'var(--slate)');
        const formState   = collectFormState();
        const jsonName    = `FLPS_Insp_hospital_${propSlug}_${dateStr}.json`;
        const rootId      = await getFlpsRootFolderId();
        const histFolderId = await findOrCreateFolder('FLPS Inspection History', rootId);
        await driveUploadFile(jsonName, 'application/json', JSON.stringify(formState, null, 2), histFolderId, null);
        setStatus('✓ Inspection data saved to FLPS Inspection History', 'var(--green)');

        // ── 2b. Update property profile ─────────────────────────
        try {
          setStatus('Updating property profile…', 'var(--slate)');
          const hospData = {
            property:    { name: propName, acct: '' },
            inspection:  { date: dateStr, reportType: fv('hosp-report-type') || H.reportType || 'Annual',
                           inspectorName: sigName },
            overallStatus: H.overallStatus || '',
            inspectionSystem: 'hospital',
            deficiencies: Array.from(document.querySelectorAll('#h-defic-tbody tr td:nth-child(2) input'))
                              .map(i => i.value.trim()).filter(Boolean),
            fieldData: formState.fields || {},
            pfStates:  {},
          };
          await updatePropertyProfileAfterSave(hospData, 'hospital');
          setStatus('✓ Property profile updated', 'var(--green)');
        } catch(e) {
          setStatus('⚠ Profile update failed: ' + e.message, 'var(--amber)');
        }
      } catch(e) {
        setStatus('⚠ Data save failed: ' + e.message + ' (PDF still saving)', 'var(--amber)');
      }

      // ── 3. Save PDF to Drive ────────────────────────────────────
      try {
        setStatus('Saving PDF to Drive…', 'var(--slate)');
        const binary   = Array.from(new Uint8Array(pdfBytes)).map(b => String.fromCharCode(b)).join('');
        const b64      = btoa(binary);
        const rootId2  = await getFlpsRootFolderId();
        const rptFolderId = await findOrCreateFolder('FLPS Inspection Reports', rootId2);
        await driveUploadFile(filename, 'application/pdf', b64, rptFolderId, null);
        setStatus('✓ PDF saved to FLPS Inspection Reports', 'var(--green)');
      } catch(e) {
        setStatus('⚠ PDF Drive save failed: ' + e.message, 'var(--amber)');
      }
    } else {
      setStatus('⚠ Not connected to Google — skipping Drive saves', 'var(--amber)');
    }

    // ── 4. Download PDF locally ─────────────────────────────────
    downloadPDF(pdfBytes, filename);
    setStatus(`✓ Downloaded: ${filename}`, 'var(--green)');
    setStatus('Upload to thecomplianceengine.com to complete reporting.', 'var(--slate)');
    showToast('✓ Report saved & downloaded!');

    // ── 5. Update inspection schedule (non-blocking) ────────────
    const schedData = {
      property:    { name: propName, acct: '' },
      inspection:  { date: dateStr, reportType: fv('hosp-report-type') || H.reportType || 'Annual' },
      inspectionSystem: 'hospital',
    };
    updateInspectionSchedule(schedData).catch(e => console.warn('[Schedule] Exception:', e.message));

    // ── 6. Clean up ──────────────────────────────────────────────
    discardDraft();
    document.getElementById('h-new-insp-btn-wrap').style.display = 'block';

  } catch(e) {
    setStatus('✗ Error: ' + e.message, 'var(--red)');
    showToast('✗ Save failed: ' + e.message);
    if (pdfBytes) { try { downloadPDF(pdfBytes, filename || 'hospital_inspection.pdf'); } catch(_) {} }
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = '📄 Save & Download PDF'; }
  }
}

// ════════════════════════════════════════════════════════════════
//  PDF GENERATION — jsPDF builder
//  FLPS brand: orange #e67e22, dark #1a1a1a
//  Letter 8.5"×11", units=mm, margins: L10 R10 T12 B12
// ════════════════════════════════════════════════════════════════
function buildHospPDF(returnDoc) {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit:'mm', format:'letter', orientation:'portrait' });

  // ── Brand colours ──
  const ORANGE = [230, 126, 34];
  const DARK   = [26,  26,  26];
  const LGRAY  = [249, 249, 249];
  const MGRAY  = [204, 204, 204];
  const PGREEN = [22,  163, 74];
  const PRED   = [220, 38,  38];
  const WHITE  = [255, 255, 255];

  // ── Page dimensions ──
  const PW = 215.9, PH = 279.4;
  const ML = 10, MR = 10, MT = 12, MB = 12;
  const CW = PW - ML - MR; // 195.9mm content width

  // ── Helpers ──
  let curY = MT;
  let pageNum = 0;

  function newPage(title) {
    if (pageNum > 0) doc.addPage();
    pageNum++;
    curY = MT;
    // Top logo bar
    doc.setFillColor(...DARK);
    doc.rect(0, 0, PW, 10, 'F');
    doc.setTextColor(...WHITE);
    doc.setFontSize(7); doc.setFont('helvetica','bold');
    doc.text('Fire Life Protection Systems', ML, 6.5);
    doc.setFont('helvetica','normal');
    doc.text(`Page ${pageNum}`, PW - MR - 20, 6.5);
    // Sub-header row with building name + date + job
    doc.setFillColor(...ORANGE);
    doc.rect(0, 10, PW, 7, 'F');
    doc.setTextColor(...WHITE);
    doc.setFont('helvetica','bold'); doc.setFontSize(7);
    const bld = document.getElementById('property-name')?.value || '';
    const dt  = document.getElementById('insp-date')?.value     || '';
    const job = document.getElementById('job-number')?.value    || '';
    const techs = document.getElementById('inspector-initials')?.value || '';
    doc.text(`BUILDING NAME: ${bld}`, ML, 15);
    doc.text(`DATE: ${dt}`, ML + 80, 15);
    doc.text(`TECH(S): ${techs}`, ML + 120, 15);
    doc.text(`JOB #: ${job}`, ML + 165, 15);
    curY = 20;
    if (title) {
      sectionHeader(title);
    }
  }

  function sectionHeader(text, color) {
    const c = color || DARK;
    doc.setFillColor(...c);
    doc.rect(ML, curY, CW, 7, 'F');
    doc.setTextColor(...WHITE);
    doc.setFont('helvetica','bold'); doc.setFontSize(8);
    doc.text(text.toUpperCase(), ML + 2, curY + 4.8);
    curY += 7;
  }

  function subHeader(text) {
    doc.setFillColor(240, 240, 240);
    doc.rect(ML, curY, CW, 5.5, 'F');
    doc.setTextColor(...DARK);
    doc.setFont('helvetica','bold'); doc.setFontSize(7);
    doc.text(text, ML + 2, curY + 3.8);
    curY += 5.5;
  }

  function tableHeader(cols) {
    // cols: [{label, w}]  — w in mm
    doc.setFillColor(230, 230, 230);
    let x = ML;
    const h = 6;
    cols.forEach(col => {
      doc.rect(x, curY, col.w, h, 'F');
      doc.setDrawColor(...MGRAY); doc.setLineWidth(0.2);
      doc.rect(x, curY, col.w, h, 'S');
      doc.setTextColor(80, 80, 80);
      doc.setFont('helvetica','bold'); doc.setFontSize(6.5);
      doc.text(col.label, x + 1.5, curY + 4);
      x += col.w;
    });
    curY += h;
  }

  function tableRow(cols, values, alt) {
    checkPageBreak(6);
    doc.setFillColor(...(alt ? LGRAY : WHITE));
    let x = ML;
    cols.forEach((col, i) => {
      doc.rect(x, curY, col.w, 5.5, 'F');
      doc.setDrawColor(...MGRAY); doc.setLineWidth(0.1);
      doc.rect(x, curY, col.w, 5.5, 'S');
      const val  = String(values[i] ?? '');
      const isStatus = val === 'PASS' || val === 'FAIL';
      doc.setTextColor(...(isStatus ? (val==='PASS' ? PGREEN : PRED) : DARK));
      doc.setFont('helvetica', isStatus ? 'bold' : 'normal');
      doc.setFontSize(7);
      const maxW = col.w - 3;
      const lines = doc.splitTextToSize(val, maxW);
      doc.text(lines[0] || '', x + 1.5, curY + 3.7);
      x += col.w;
    });
    curY += 5.5;
  }

  function checkPageBreak(needed) {
    if (curY + needed > PH - MB - 5) { newPage(); }
  }

  function labelValue(label, value, x, y, lw, vw) {
    doc.setFont('helvetica','bold'); doc.setFontSize(6.5); doc.setTextColor(100,100,100);
    doc.text(label.toUpperCase(), x, y);
    doc.setFont('helvetica','normal'); doc.setFontSize(7.5); doc.setTextColor(...DARK);
    doc.text(String(value||''), x + lw, y);
  }

  // ── helper to read a text input value ──
  // fv() and sv() are global helpers defined above

  // ─────────────────────────────────────────
  // PAGE 1: COVER PAGE
  // ─────────────────────────────────────────
  newPage();

  // Report type badge
  const rt = fv('hosp-report-type') || 'Annual';
  doc.setFillColor(...ORANGE);
  doc.rect(ML, curY, CW, 14, 'F');
  doc.setTextColor(...WHITE); doc.setFont('helvetica','bold'); doc.setFontSize(14);
  doc.text('ANNUAL TJC/CMS INSPECTION REPORT', PW/2, curY + 9, {align:'center'});
  curY += 14;

  // Report type checkboxes
  const types = ['ANNUAL','SEMI-ANNUAL','QUARTERLY','MONTHLY','3/4/5/6 YEAR INTERVAL'];
  doc.setFontSize(7);
  let rx = ML;
  types.forEach(t => {
    const sel = rt.toUpperCase() === t.replace('SEMI-ANNUAL','SEMI-ANNUAL');
    doc.setFillColor(...(sel ? DARK : WHITE));
    doc.rect(rx, curY, 2.5, 2.5, sel ? 'F' : 'S');
    doc.setTextColor(...DARK); doc.setFont('helvetica', sel?'bold':'normal');
    doc.text(t, rx + 3.5, curY + 2);
    rx += 38;
  });
  curY += 8;

  // Building info grid
  const col1 = ML, col2 = ML + 50;
  const lw = 32;
  [['JOB NUMBER', fv('job-number')],
   ['DATE PERFORMED', fv('insp-date')],
   ['INSPECTOR(S) INITIALS', fv('inspector-initials')]].forEach(([l,v]) => {
    labelValue(l, v, col1, curY, lw, 0);
    curY += 5;
  });
  curY += 3;
  sectionHeader('Building / Property Information', DARK);
  labelValue('BUILDING/PROPERTY NAME', fv('property-name'), ML, curY + 4, 44, 0);
  curY += 8;
  labelValue('STREET, CITY, ZIP CODE', fv('service-address') + '  ' + fv('city-state-zip'), ML, curY + 4, 44, 0);
  curY += 8;
  labelValue('JURISDICTION', fv('jurisdiction'), ML, curY + 4, 28, 0);
  curY += 10;

  // Contacts
  sectionHeader('Site Contact Information', ORANGE);
  const contY = curY;
  doc.setFont('helvetica','bold'); doc.setFontSize(7); doc.setTextColor(...WHITE);
  doc.setFillColor(...DARK);
  doc.rect(ML, curY, CW/2 - 1, 5.5, 'F');
  doc.text('PRIMARY CONTACT', ML + 2, curY + 3.8);
  doc.rect(ML + CW/2 + 1, curY, CW/2 - 1, 5.5, 'F');
  doc.text('SECONDARY CONTACT', ML + CW/2 + 3, curY + 3.8);
  curY += 5.5;
  const contFields = [['NAME','primary-name','secondary-name'],['TITLE','primary-title','secondary-title'],
                      ['PHONE','primary-phone','secondary-phone'],['EMAIL','primary-email','secondary-email']];
  contFields.forEach(([label, id1, id2], i) => {
    const alt = i % 2 === 0;
    doc.setFillColor(...(alt ? LGRAY : WHITE));
    doc.rect(ML, curY, CW/2 - 1, 5.5, 'F');
    doc.rect(ML + CW/2 + 1, curY, CW/2 - 1, 5.5, 'F');
    doc.setFont('helvetica','bold'); doc.setFontSize(6); doc.setTextColor(100,100,100);
    doc.text(label, ML + 1.5, curY + 2.5);
    doc.text(label, ML + CW/2 + 2.5, curY + 2.5);
    doc.setFont('helvetica','normal'); doc.setFontSize(7); doc.setTextColor(...DARK);
    doc.text(fv(id1), ML + 1.5, curY + 5);
    doc.text(fv(id2), ML + CW/2 + 2.5, curY + 5);
    curY += 5.5;
  });
  curY += 5;

  // NFPA references boilerplate
  sectionHeader('NFPA References and Procedure', DARK);
  doc.setFont('helvetica','bold'); doc.setFontSize(7); doc.setTextColor(...DARK);
  const nfpaText = 'Your entire fire alarm system is required to be thoroughly inspected, tested and maintained each year by an approved servicing company in accordance with Chapter 14 of NFPA 72. Testing must include control equipment, remote annunciators, initiating devices, HVAC shutdown devices and alarm notification appliances.';
  const wrapped = doc.splitTextToSize(nfpaText, CW - 4);
  doc.setFont('helvetica','normal'); doc.setFontSize(6.5);
  doc.text(wrapped, ML + 2, curY + 4);
  curY += wrapped.length * 3.5 + 4;

  // ─────────────────────────────────────────
  // PAGE 2: PANEL & MONITORING
  // ─────────────────────────────────────────
  newPage('Main Fire Alarm Control Panel Information');

  const halfW = CW / 2 - 2;
  // Panel columns
  subHeader('Panel');
  [['MAKE', 'h-cp-make'], ['MODEL','h-cp-model'], ['LOCATION','h-cp-location']].forEach(([l,id]) => {
    tableRow([{w:halfW/2},{w:halfW/2}], [l, fv(id)], false);
  });
  curY += 3;
  subHeader('Monitoring');
  [['COMPANY','h-monitor-company'],['PHONE','h-monitor-phone'],['ACCOUNT','h-monitor-account']].forEach(([l,id]) => {
    tableRow([{w:halfW/2},{w:halfW/2}], [l, fv(id)], false);
  });
  [['TIME OFFLINE','h-monitor-offline'],['TIME ONLINE','h-monitor-online']].forEach(([l,id]) => {
    tableRow([{w:halfW/2},{w:halfW/2}], [l, fv(id)], false);
  });
  curY += 3;
  subHeader('Panel Testing / Disable Instructions');
  doc.setFont('helvetica','normal'); doc.setFontSize(7); doc.setTextColor(...DARK);
  const instrLines = doc.splitTextToSize(fv('h-panel-instructions') || '—', CW - 4);
  doc.text(instrLines, ML + 2, curY + 4);
  curY += instrLines.length * 3.5 + 6;

  subHeader('Dialer / Radio');
  [['MAKE','h-dr-make'],['MODEL','h-dr-model'],['LOCATION','h-dr-location'],['TYPE','h-dr-type']].forEach(([l,id]) => {
    tableRow([{w:halfW/2},{w:halfW/2}], [l, fv(id)], false);
  });
  curY += 4;

  // Pre/post checklist
  subHeader('Pre & Post Inspection Checklist');
  const preItems  = PRE_CHECKLIST_ITEMS.map(item => ({
    label: item.label, val: document.getElementById(item.id)?.value || '',
  }));
  const postItems = POST_CHECKLIST_ITEMS.map(item => ({
    label: item.label, val: document.getElementById(item.id)?.value || '',
  }));
  const chkCols = [{w:CW*0.4},{w:CW*0.1},{w:CW*0.4},{w:CW*0.1}];
  tableHeader([{label:'PRE-INSPECTION QUESTION',w:CW*0.4},{label:'Y/N/NA',w:CW*0.1},{label:'POST-INSPECTION QUESTION',w:CW*0.4},{label:'Y/N/NA',w:CW*0.1}]);
  preItems.forEach((pre, i) => {
    const post = postItems[i] || { label:'', val:'' };
    tableRow(chkCols, [pre.label, pre.val, post.label, post.val], i%2===0);
  });
  curY += 5;

  // Recurring schedule
  subHeader('Recurring Inspection Type and Month');
  const recCols = [{w:CW*0.27},{w:CW*0.12},{w:CW*0.27},{w:CW*0.12},{w:CW*0.22}];
  // Read from recurring table
  const recRows = document.querySelectorAll('#h-recurring-tbody tr');
  recRows.forEach((row, i) => {
    const inputs = row.querySelectorAll('input');
    const vals = Array.from(inputs).map(inp => inp.value);
    tableRow([{w:CW*0.35},{w:CW*0.15},{w:CW*0.35},{w:CW*0.15}],
             [vals[0]||'', vals[1]||'', vals[2]||'', vals[3]||''], i%2===0);
  });

  // ─────────────────────────────────────────
  // PAGE 3: TJC KEY SHEET — FIRE ALARM
  // ─────────────────────────────────────────
  newPage('TJC/CMS Testing Interval Key Sheet — Fire Alarm Systems & Components');

  const kCols = [{label:'System Device Specifics',w:CW*0.28},{label:'Current Totals',w:CW*0.1},
                 {label:'Previous Totals',w:CW*0.1},{label:'Test/Inspection Interval',w:CW*0.16},
                 {label:'Code Publication',w:CW*0.22},{label:'Activity: Freq.',w:CW*0.08},{label:'EP LS #',w:CW*0.06}];
  tableHeader(kCols);
  const faKeyRows = document.querySelectorAll('#h-fa-key-tbody tr');
  faKeyRows.forEach((row, i) => {
    const cells = row.querySelectorAll('td');
    const name  = cells[0]?.textContent?.trim() || '';
    const curr  = row.querySelector('input:nth-of-type(1)')?.value || '';
    const prev  = row.querySelector('input:nth-of-type(2)')?.value || '';
    const interval = cells[3]?.textContent?.trim() || '';
    const code  = cells[4]?.textContent?.trim() || '';
    const act   = cells[5]?.textContent?.trim() || '';
    const ep    = cells[6]?.textContent?.trim() || '';
    tableRow([{w:CW*0.28},{w:CW*0.1},{w:CW*0.1},{w:CW*0.16},{w:CW*0.22},{w:CW*0.08},{w:CW*0.06}],
             [name, curr, prev, interval, code, act, ep], i%2===0);
  });

  // ─────────────────────────────────────────
  // PAGE 4: TJC KEY SHEET — SPRINKLER/OTHER
  // ─────────────────────────────────────────
  newPage('TJC/CMS Testing Interval Key Sheet — Sprinkler, Hood, Extinguishers, Dampers, Doors, Emergency Lights');
  tableHeader(kCols);
  const spKeyRows = document.querySelectorAll('#h-sp-key-tbody tr');
  spKeyRows.forEach((row, i) => {
    const cells = row.querySelectorAll('td');
    const name  = cells[0]?.textContent?.trim() || '';
    const curr  = row.querySelector('input:nth-of-type(1)')?.value || '';
    const prev  = row.querySelector('input:nth-of-type(2)')?.value || '';
    const interval = cells[3]?.textContent?.trim() || '';
    const code  = cells[4]?.textContent?.trim() || '';
    const ep    = cells[5]?.textContent?.trim() || '';
    tableRow([{w:CW*0.28},{w:CW*0.1},{w:CW*0.1},{w:CW*0.16},{w:CW*0.22},{w:CW*0.08},{w:CW*0.06}],
             [name, curr, prev, interval, code, '', ep], i%2===0);
  });

  // ─────────────────────────────────────────
  // PAGE 5: FA OVERALL RESULT SUMMARY
  // ─────────────────────────────────────────
  newPage('Fire Alarm Systems Overall Test Summary — Device/System Result Summary Page (Alarm)');
  const resCols = [{label:'Devices/Signals/Systems',w:CW*0.22},{label:'Key',w:CW*0.07},
                   {label:'#',w:CW*0.07},{label:'Pass #',w:CW*0.09},{label:'Fail #',w:CW*0.09},
                   {label:'% Pass',w:CW*0.09},{label:'% Fail',w:CW*0.09},
                   {label:'Not Tested',w:CW*0.09},{label:'Not Found',w:CW*0.09},{label:'Notes',w:CW*0.11}];
  tableHeader(resCols);
  document.querySelectorAll('#h-fa-result-tbody tr').forEach((row, i) => {
    const cells = row.querySelectorAll('td');
    const name  = cells[0]?.textContent?.trim() || '';
    const key   = cells[1]?.textContent?.trim() || '';
    const inputs = row.querySelectorAll('input[type=number]');
    const textInputs = row.querySelectorAll('input[type=text]');
    const total  = inputs[0]?.value || '';
    const pass   = inputs[1]?.value || '';
    const fail   = inputs[2]?.value || '';
    const nt     = inputs[3]?.value || '';
    const nf     = inputs[4]?.value || '';
    const notes  = textInputs[0]?.value || '';
    const pPct   = row.querySelector('.pct-pass')?.textContent || '';
    const fPct   = row.querySelector('.pct-fail')?.textContent || '';
    tableRow(resCols.map(c=>({w:c.w})), [name,key,total,pass,fail,pPct,fPct,nt,nf,notes], i%2===0);
  });

  // ─────────────────────────────────────────
  // PAGE 6: SP OVERALL RESULT SUMMARY
  // ─────────────────────────────────────────
  newPage('Fire Suppression Systems & Others Overall Test Summary — Device/System Result Summary Page (Sprinkler & Others)');
  tableHeader(resCols);
  document.querySelectorAll('#h-sp-result-tbody tr').forEach((row, i) => {
    const cells = row.querySelectorAll('td');
    const name  = cells[0]?.textContent?.trim() || '';
    const key   = cells[1]?.textContent?.trim() || '';
    const inputs = row.querySelectorAll('input[type=number]');
    const textInputs = row.querySelectorAll('input[type=text]');
    const total  = inputs[0]?.value || '';
    const pass   = inputs[1]?.value || '';
    const fail   = inputs[2]?.value || '';
    const nt     = inputs[3]?.value || '';
    const nf     = inputs[4]?.value || '';
    const notes  = textInputs[0]?.value || '';
    const pPct   = row.querySelector('.pct-pass')?.textContent || '';
    const fPct   = row.querySelector('.pct-fail')?.textContent || '';
    tableRow(resCols.map(c=>({w:c.w})), [name,key,total,pass,fail,pPct,fPct,nt,nf,notes], i%2===0);
  });

  // ─────────────────────────────────────────
  // PAGE 7: EXISTING SYSTEMS OVERVIEW
  // ─────────────────────────────────────────
  newPage('Existing Life Safety Systems Overview Information');
  function ynaTblRows(tbodyId, label) {
    subHeader(label);
    const ovCols = [{label:'Question',w:CW*0.45},{label:'Y/N/NA',w:CW*0.1},{label:'#',w:CW*0.07},
                    {label:'Inspecting?',w:CW*0.12},{label:'Locations/Notes',w:CW*0.26}];
    tableHeader(ovCols);
    document.querySelectorAll(`#${tbodyId} tr`).forEach((row, i) => {
      const cells = row.querySelectorAll('td');
      const q     = cells[0]?.textContent?.trim() || '';
      const ynaEl = cells[1]?.querySelector('.pf-btn.selected');
      const yna   = ynaEl?.textContent?.trim() || '';
      const cnt   = cells[2]?.querySelector('input')?.value || '';
      const inspEl = cells[3]?.querySelector('.pf-btn.selected');
      const insp  = inspEl?.textContent?.trim() || '';
      const notes = cells[4]?.querySelector('input')?.value || '';
      checkPageBreak(6);
      tableRow(ovCols.map(c=>({w:c.w})), [q, yna, cnt, insp, notes], i%2===0);
    });
    curY += 3;
  }
  ynaTblRows('h-ov-fa-tbody', 'Fire Alarm Systems');
  ynaTblRows('h-ov-sp-tbody', 'Fire Suppression Systems');
  ynaTblRows('h-ov-special-tbody', 'Special Hazards Systems');

  checkPageBreak(30);
  subHeader('3 & 5 Year — Previous Inspection Year (If Applicable)');
  const yr35Cols = [{label:'Service',w:CW*0.28},{label:'Applicable?',w:CW*0.12},{label:'Last Year',w:CW*0.12},
                    {label:'Next Due',w:CW*0.12},{label:'Inspecting Now?',w:CW*0.14},{label:'Locations/Notes',w:CW*0.22}];
  tableHeader(yr35Cols);
  document.querySelectorAll('#h-35yr-tbody tr').forEach((row, i) => {
    const cells = row.querySelectorAll('td');
    const svc   = cells[0]?.textContent?.trim() || '';
    const appEl = cells[1]?.querySelector('.pf-btn.selected');
    const app   = appEl?.textContent?.trim() || '';
    const last  = cells[2]?.querySelector('input')?.value || '';
    const next  = cells[3]?.querySelector('input')?.value || '';
    const inspEl = cells[4]?.querySelector('.pf-btn.selected');
    const insp  = inspEl?.textContent?.trim() || '';
    const notes = cells[5]?.querySelector('input')?.value || '';
    tableRow(yr35Cols.map(c=>({w:c.w})), [svc,app,last,next,insp,notes], i%2===0);
  });

  // ─────────────────────────────────────────
  // PAGES 8+: INDIVIDUAL DEVICE SHEETS
  // Helper: render a generic device table
  // ─────────────────────────────────────────
  function devicePage(pageTitle, tbodyId, colDefs, colGetters) {
    // colDefs: [{label, w}], colGetters: array of fns(row)=>string
    newPage(pageTitle);
    tableHeader(colDefs);
    const rows = document.querySelectorAll(`#${tbodyId} tr`);
    if (!rows.length) {
      doc.setFont('helvetica','italic'); doc.setFontSize(7); doc.setTextColor(150,150,150);
      doc.text('No devices recorded.', ML + 2, curY + 4);
      curY += 8;
      return;
    }
    rows.forEach((row, i) => {
      const vals = colGetters.map(fn => fn(row));
      checkPageBreak(6);
      tableRow(colDefs.map(c=>({w:c.w})), vals, i%2===0);
    });
    // Count footer
    const count = rows.length;
    doc.setFont('helvetica','bold'); doc.setFontSize(6.5); doc.setTextColor(...DARK);
    doc.text(`EQUIPMENT COUNT: ${count}`, ML, curY + 4);
    curY += 8;
  }

  // ─ Cell value getters ─
  const inp  = (n) => (row) => row.querySelectorAll('input')[n]?.value || '';
  const sel  = (n) => (row) => { const el = row.querySelectorAll('select')[n]; return el?.options[el.selectedIndex]?.text || ''; };
  const td   = (n) => (row) => row.querySelectorAll('td')[n]?.querySelector('input, select')?.value || '';

  // PAGE 8: SUPERVISORY SIGNALS
  devicePage('Supervisory Signals (Excluding Tampers & Duct Detectors) — EC.02.03.05 EP 01',
    'h-supervisory-tbody',
    [{label:'Floor',w:CW*0.09},{label:'Type',w:CW*0.1},{label:'Location',w:CW*0.38},{label:'Address',w:CW*0.15},{label:'Visual',w:CW*0.14},{label:'Functional',w:CW*0.14}],
    [inp(0), inp(1), inp(2), inp(3), sel(0), sel(1)]);

  // PAGE 9: FLOW & PRESSURE SWITCHES
  devicePage('Flow & Pressure Switches — EC.02.03.05 EP 02',
    'h-flow-tbody',
    [{label:'Floor',w:CW*0.08},{label:'Type',w:CW*0.09},{label:'Location',w:CW*0.30},{label:'Address',w:CW*0.14},{label:'Visual',w:CW*0.11},{label:'Functional',w:CW*0.11},{label:'Time (sec)',w:CW*0.12},{label:'Note',w:CW*0.05}],
    [inp(0), inp(1), inp(2), inp(3), sel(0), sel(1), inp(4), inp(5)]);

  // PAGE 10: TAMPER SWITCHES
  devicePage('Tamper Switches (Supervisory) — EC.02.03.05 EP 02',
    'h-tamper-tbody',
    [{label:'Floor',w:CW*0.09},{label:'Type',w:CW*0.1},{label:'Location',w:CW*0.38},{label:'Address',w:CW*0.15},{label:'Visual',w:CW*0.14},{label:'Functional',w:CW*0.14}],
    [inp(0), inp(1), inp(2), inp(3), sel(0), sel(1)]);

  // PAGES 11+: SMOKE DETECTORS (30 per page)
  function pagedDevicePage(pageTitle, tbodyId, colDefs, colGetters, rowsPerPage) {
    const allRows = Array.from(document.querySelectorAll(`#${tbodyId} tr`));
    if (!allRows.length) {
      newPage(pageTitle);
      doc.setFont('helvetica','italic'); doc.setFontSize(7); doc.setTextColor(150,150,150);
      doc.text('No devices recorded.', ML + 2, curY + 4); curY += 8; return;
    }
    for (let start = 0; start < allRows.length; start += rowsPerPage) {
      newPage(pageTitle);
      tableHeader(colDefs);
      const chunk = allRows.slice(start, start + rowsPerPage);
      chunk.forEach((row, i) => {
        const vals = colGetters.map(fn => fn(row));
        checkPageBreak(6);
        tableRow(colDefs.map(c=>({w:c.w})), vals, i%2===0);
      });
      if (start + rowsPerPage >= allRows.length) {
        doc.setFont('helvetica','bold'); doc.setFontSize(6.5); doc.setTextColor(...DARK);
        doc.text(`EQUIPMENT COUNT: SD ${allRows.length}`, ML, curY + 4);
        curY += 8;
      }
    }
  }

  const smokeAlSel = (row) => { const el = row.querySelectorAll('select')[0]; return el?.options[el.selectedIndex]?.text || 'AL'; };
  pagedDevicePage('Smoke Detectors — EC.02.03.05 EP 03', 'h-smoke-tbody',
    [{label:'Floor',w:CW*0.07},{label:'Type',w:CW*0.09},{label:'Location',w:CW*0.33},{label:'Address',w:CW*0.14},{label:'AL/SPV',w:CW*0.1},{label:'Visual',w:CW*0.13},{label:'Functional',w:CW*0.14}],
    [inp(0), inp(1), inp(2), inp(3), smokeAlSel, sel(1), sel(2)], 30);

  // PAGE 12: HEAT DETECTORS
  devicePage('Heat Detectors — EC.02.03.05 EP 03', 'h-heat-tbody',
    [{label:'Floor',w:CW*0.09},{label:'Type',w:CW*0.1},{label:'Location',w:CW*0.38},{label:'Address',w:CW*0.15},{label:'Visual',w:CW*0.14},{label:'Functional',w:CW*0.14}],
    [inp(0), inp(1), inp(2), inp(3), sel(0), sel(1)]);

  // PAGES 13+: MANUAL PULL STATIONS
  pagedDevicePage('Manual Pull Stations — EC.02.03.05 EP 03', 'h-pull-tbody',
    [{label:'Floor',w:CW*0.09},{label:'Type',w:CW*0.1},{label:'Location',w:CW*0.38},{label:'Address',w:CW*0.15},{label:'Visual',w:CW*0.14},{label:'Functional',w:CW*0.14}],
    [inp(0), inp(1), inp(2), inp(3), sel(0), sel(1)], 30);

  // PAGE 14: DUCT DETECTORS
  devicePage('Duct Detectors — EC.02.03.05 EP 03', 'h-duct-tbody',
    [{label:'Floor',w:CW*0.09},{label:'Type',w:CW*0.1},{label:'Location',w:CW*0.38},{label:'Address',w:CW*0.15},{label:'Visual',w:CW*0.14},{label:'Functional',w:CW*0.14}],
    [inp(0), inp(1), inp(2), inp(3), sel(0), sel(1)]);

  // PAGES 15+: AUDIO/VISUAL
  pagedDevicePage('Audio/Visual Notification — EC.02.03.05 EP 04', 'h-av-tbody',
    [{label:'Floor',w:CW*0.09},{label:'Type',w:CW*0.12},{label:'Location',w:CW*0.51},{label:'Visual',w:CW*0.14},{label:'Functional',w:CW*0.14}],
    [inp(0), inp(1), inp(2), sel(0), sel(1)], 33);

  // PAGE 16: DOOR RELEASING DEVICES
  devicePage('Door Releasing Devices — EC.02.03.05 EP 04', 'h-door-release-tbody',
    [{label:'Floor',w:CW*0.09},{label:'Type',w:CW*0.12},{label:'Location',w:CW*0.51},{label:'Visual',w:CW*0.14},{label:'Functional',w:CW*0.14}],
    [inp(0), inp(1), inp(2), sel(0), sel(1)]);

  // PAGE 17: OFF-PREMISE MONITORING
  newPage('Off Premise Monitoring — EC.02.03.05 EP 05');
  const offCols = [{label:'Monitoring Company',w:CW*0.24},{label:'Time Offline',w:CW*0.13},{label:'Signals Sent (HH:MM:SS)',w:CW*0.18},{label:'Signals Received (HH:MM:SS)',w:CW*0.18},{label:'Time Online',w:CW*0.13},{label:'Pass/Fail',w:CW*0.14}];
  tableHeader(offCols);
  document.querySelectorAll('#h-offprem-tbody tr').forEach((row,i) => {
    const inputs = row.querySelectorAll('input');
    const sels   = row.querySelectorAll('select');
    tableRow(offCols.map(c=>({w:c.w})),
      [inputs[0]?.value||'', inputs[1]?.value||'', inputs[2]?.value||'', inputs[3]?.value||'', inputs[4]?.value||'', sels[0]?.options[sels[0].selectedIndex]?.text||''], i%2===0);
  });

  // PAGE 18: ELEVATOR RECALL
  newPage('Annual — Elevator Recall Testing — LS 02.01.50 EP 07');
  const bankCards = document.querySelectorAll('#h-elevator-banks > div');
  bankCards.forEach((card, bi) => {
    checkPageBreak(30);
    const inputs = card.querySelectorAll('input');
    const sels   = card.querySelectorAll('select');
    subHeader(`Elevator Recall Bank — ${inputs[1]?.value || `Bank ${bi+1}`}   (${inputs[0]?.value || ''})`);
    const elvCols = [{label:'',w:CW*0.35},{label:'Month/Year',w:CW*0.15},{label:'Operational?',w:CW*0.2},{label:'Device Used for Recall',w:CW*0.3}];
    tableHeader(elvCols);
    tableRow(elvCols.map(c=>({w:c.w})), ['PRIMARY RECALL FLOOR', inputs[2]?.value||'1ST', sels[0]?.options[sels[0].selectedIndex]?.text||'', inputs[3]?.value||''], false);
    tableRow(elvCols.map(c=>({w:c.w})), ['SECONDARY RECALL FLOOR', inputs[4]?.value||'BSMT', sels[1]?.options[sels[1].selectedIndex]?.text||'', inputs[5]?.value||''], true);
    curY += 4;
  });
  doc.setFont('helvetica','bold'); doc.setFontSize(7); doc.setTextColor(...DARK);
  doc.text(`ELEVATOR BANK TOTAL COUNT: ${bankCards.length}`, ML, curY + 4); curY += 8;

  // PAGES 19+: SUB PANEL / POWER SUPPLY
  function subpanelPages() {
    const rows = Array.from(document.querySelectorAll('#h-subpanel-tbody tr'));
    if (!rows.length) return;
    const spCols = [{label:'Location',w:CW*0.2},{label:'Make',w:CW*0.1},{label:'Model',w:CW*0.1},
                    {label:'Panel/Ckt',w:CW*0.09},{label:'AH',w:CW*0.07},{label:'Avail NACS',w:CW*0.07},
                    {label:'Install Date',w:CW*0.1},{label:'(L) Batt %',w:CW*0.08},{label:'(R) Batt %',w:CW*0.08},
                    {label:'SPVSD?',w:CW*0.06},{label:'Pass/Fail',w:CW*0.08},{label:'Style',w:CW*0.07}];
    for (let start = 0; start < rows.length; start += 15) {
      newPage('Sub Panel / Power Supply Information — LS 02.01.34 EP 10');
      tableHeader(spCols);
      rows.slice(start, start + 15).forEach((row, i) => {
        const ins = row.querySelectorAll('input');
        const sls = row.querySelectorAll('select');
        tableRow(spCols.map(c=>({w:c.w})),
          [ins[0]?.value||'', ins[1]?.value||'', ins[2]?.value||'', ins[3]?.value||'',
           ins[4]?.value||'', ins[5]?.value||'', ins[6]?.value?.substring(0,10)||'',
           ins[7]?.value||'', ins[8]?.value||'', ins[9]?.value||'',
           sls[0]?.options[sls[0].selectedIndex]?.text||'', ins[10]?.value||''], i%2===0);
      });
    }
    doc.setFont('helvetica','bold'); doc.setFontSize(6.5); doc.setTextColor(...DARK);
    doc.text(`FACP, SUB PANEL AND POWER SUPPLY TOTAL COUNT: ${rows.length}`, ML, curY + 4); curY += 8;
  }
  subpanelPages();

  // PAGE 20: ANNUNCIATORS
  newPage('Annunciator Information — LS 02.01.34 EP 10');
  const annCards = document.querySelectorAll('#h-annunciator-grid > div');
  const annPerRow = 2;
  let annIdx = 0;
  while (annIdx < annCards.length) {
    const card1 = annCards[annIdx];
    const card2 = annCards[annIdx + 1];
    checkPageBreak(22);
    function renderAnnCard(card, x, w) {
      if (!card) return;
      const ins = card.querySelectorAll('input');
      const sls = card.querySelectorAll('select');
      doc.setFillColor(230,230,230); doc.rect(x, curY, w, 5.5, 'F');
      doc.setFont('helvetica','bold'); doc.setFontSize(7); doc.setTextColor(...DARK);
      doc.text('ANNUNCIATOR', x + 2, curY + 4);
      const rows2 = [['MAKE', ins[0]?.value||''], ['MODEL', ins[1]?.value||''], ['LOCATION', ins[2]?.value||''],
                     ['PASS/FAIL', sls[0]?.options[sls[0].selectedIndex]?.text||''], ['NOTES', ins[3]?.value||'']];
      let y2 = curY + 5.5;
      rows2.forEach(([l, v], ri) => {
        doc.setFillColor(...(ri%2===0 ? LGRAY : WHITE));
        doc.rect(x, y2, w/2, 5, 'F'); doc.rect(x+w/2, y2, w/2, 5, 'F');
        doc.setFont('helvetica','bold'); doc.setFontSize(6); doc.setTextColor(100,100,100);
        doc.text(l, x+1, y2+3.5);
        doc.setFont('helvetica','normal'); doc.setFontSize(7); doc.setTextColor(...DARK);
        doc.text(String(v), x+w/2+1, y2+3.5);
        y2 += 5;
      });
    }
    const hw = CW/2 - 1;
    renderAnnCard(card1, ML, hw);
    renderAnnCard(card2, ML + hw + 2, hw);
    curY += 32;
    annIdx += 2;
  }
  doc.setFont('helvetica','bold'); doc.setFontSize(6.5); doc.setTextColor(...DARK);
  doc.text(`ANNUNCIATOR TOTAL COUNT: ${annCards.length}`, ML, curY + 4); curY += 8;

  // PAGE 21: AHU SHUTDOWN
  devicePage('Air Handling Unit (AHU) Shutdown — EC.02.03.05 EP 19', 'h-ahu-tbody',
    [{label:'Floor',w:CW*0.09},{label:'Type',w:CW*0.1},{label:'Location',w:CW*0.53},{label:'Visual',w:CW*0.14},{label:'Functional',w:CW*0.14}],
    [inp(0), inp(1), inp(2), sel(0), sel(1)]);

  // PAGE 22: MAIN DRAIN
  newPage('Main Drain Results — EC.02.03.05 EP 09');
  const mdCols = [{label:'#',w:CW*0.06},{label:'System Location',w:CW*0.38},{label:'Static PSI',w:CW*0.14},{label:'Residual PSI',w:CW*0.14},{label:'Post PSI',w:CW*0.14},{label:'Pass/Fail',w:CW*0.14}];
  tableHeader(mdCols);
  document.querySelectorAll('#h-main-drain-tbody tr').forEach((row,i) => {
    const ins = row.querySelectorAll('input');
    const sls = row.querySelectorAll('select');
    tableRow(mdCols.map(c=>({w:c.w})),
      [String(i+1), ins[0]?.value||'', ins[1]?.value||'', ins[2]?.value||'', ins[3]?.value||'',
       sls[0]?.options[sls[0].selectedIndex]?.text||''], i%2===0);
  });
  doc.setFont('helvetica','bold'); doc.setFontSize(6.5); doc.setTextColor(...DARK);
  doc.text(`EQUIPMENT COUNT: MD ${document.querySelectorAll('#h-main-drain-tbody tr').length}`, ML, curY + 4); curY += 8;

  // PAGE 23: FDC
  devicePage('Fire Department Connections (FDC) — EC.02.03.05 EP 10', 'h-fdc-tbody',
    [{label:'Floor',w:CW*0.07},{label:'Type',w:CW*0.09},{label:'Location',w:CW*0.34},{label:'Visual',w:CW*0.11},{label:'Functional',w:CW*0.11},{label:'Cap Style',w:CW*0.14},{label:'Hydro Year',w:CW*0.14}],
    [inp(0), inp(1), inp(2), sel(0), sel(1), inp(3), inp(4)]);

  // PAGE 24: HOSE VALVES
  devicePage('Hose Valve Connections — EC.02.03.05 EP 10', 'h-hose-valve-tbody',
    [{label:'Floor',w:CW*0.07},{label:'Type',w:CW*0.09},{label:'Location',w:CW*0.34},{label:'Visual',w:CW*0.11},{label:'Functional',w:CW*0.11},{label:'Cap Style',w:CW*0.14},{label:'Size',w:CW*0.14}],
    [inp(0), inp(1), inp(2), sel(0), sel(1), inp(3), inp(4)]);

  // PAGE 25: STANDPIPES
  devicePage('Standpipes — LS 02.01.35 EP 14', 'h-standpipe-tbody',
    [{label:'Floor',w:CW*0.08},{label:'Type',w:CW*0.1},{label:'Location',w:CW*0.38},{label:'Visual',w:CW*0.14},{label:'Hydro Year',w:CW*0.16},{label:'Size (in)',w:CW*0.14}],
    [inp(0), inp(1), inp(2), sel(0), inp(3), inp(4)]);

  // PAGE 26: SPARE HEAD BOXES
  devicePage('Sprinkler Spare Head Box(es) — LS 02.01.35 EP 14', 'h-spare-heads-tbody',
    [{label:'Floor',w:CW*0.06},{label:'Type',w:CW*0.08},{label:'Location',w:CW*0.25},{label:'Visual',w:CW*0.1},{label:'Count',w:CW*0.09},{label:'Head Type',w:CW*0.1},{label:'Temp °F',w:CW*0.09},{label:'Response',w:CW*0.1},{label:'Note',w:CW*0.13}],
    [inp(0), inp(1), inp(2), sel(0), inp(3), sel(1), inp(4), sel(2), inp(5)]);

  // PAGE 27: SPRINKLER CONTROL VALVES
  devicePage('Sprinkler Control Valves — LS 02.01.35 EP 14', 'h-valves-tbody',
    [{label:'Floor',w:CW*0.07},{label:'Type',w:CW*0.09},{label:'Location',w:CW*0.38},{label:'Visual',w:CW*0.12},{label:'Functional',w:CW*0.12},{label:'Valve Type',w:CW*0.22}],
    [inp(0), inp(1), inp(2), sel(0), sel(1), inp(3)]);

  // PAGE 28: HYDRAULIC CALC PLATES
  devicePage('Hydraulic Calc Plates — LS 02.01.35 EP 14', 'h-hydraulic-tbody',
    [{label:'Floor',w:CW*0.08},{label:'Type',w:CW*0.1},{label:'Location',w:CW*0.5},{label:'Visual',w:CW*0.16},{label:'Legible?',w:CW*0.16}],
    [inp(0), inp(1), inp(2), sel(0), sel(1)]);

  // PAGE 29: SPRINKLER GAUGES
  devicePage('Sprinkler Gauges — LS 02.01.35 EP 14', 'h-gauges-tbody',
    [{label:'Floor',w:CW*0.07},{label:'Type',w:CW*0.09},{label:'Location',w:CW*0.38},{label:'Visual',w:CW*0.12},{label:'Functional',w:CW*0.12},{label:'Manf. Year',w:CW*0.22}],
    [inp(0), inp(1), inp(2), sel(0), sel(1), inp(3)]);

  // PAGE 30: SPRINKLER CHECKLIST (Y/N/NA summary table)
  newPage('Sprinkler Inspection Checklist — LS 02.01.35 EP 14');
  function spChkSection(label, items) {
    subHeader(label);
    const chkCols = [{label:'Question',w:CW*0.52},{label:'Y',w:CW*0.09},{label:'N',w:CW*0.09},{label:'NA',w:CW*0.09},{label:'#',w:CW*0.07},{label:'Notes/Deficiency',w:CW*0.14}];
    tableHeader(chkCols);
    items.forEach((item, i) => {
      checkPageBreak(6);
      const ynaGroup = document.querySelector(`[data-id="${item.id}"] .yna-group`);
      let selBtn = '';
      if (ynaGroup) {
        const sel2 = ynaGroup.querySelector('.yna-btn.selected');
        selBtn = sel2?.textContent?.trim() || '';
      }
      const noteEl = document.getElementById('sp-defic-note-' + item.id);
      const note = noteEl?.value || '';
      tableRow(chkCols.map(c=>({w:c.w})),
        [item.label, selBtn==='Y'?'X':'', selBtn==='N'?'X':'', selBtn==='NA'?'X':'', note?'•':'', note], i%2===0);
    });
    curY += 3;
  }
  spChkSection('Pre-Inspection', SP_CHECKLIST.pre);
  spChkSection('Fire Dept Connections', SP_CHECKLIST.fdc);
  spChkSection('Valves / Gauges', SP_CHECKLIST.valve);
  checkPageBreak(50);
  spChkSection('Sprinkler Heads / Components', SP_CHECKLIST.heads);
  spChkSection('Visible Pipe', SP_CHECKLIST.pipe);
  spChkSection('Main Drain Observations', SP_CHECKLIST.drain);
  checkPageBreak(40);
  spChkSection('Dry Pipe / Pre-Action (If Applicable)', SP_DRY_ITEMS);
  spChkSection('5-Year Items (If Due)', SP_5YR_ITEMS);
  // Dry pipe extra fields
  const tripDate = fv('h-sp-trip-date');
  const tripPsi  = fv('h-sp-trip-psi');
  const due5yr   = fv('h-sp-5yr-due');
  if (tripDate || tripPsi || due5yr) {
    checkPageBreak(10);
    doc.setFont('helvetica','normal'); doc.setFontSize(7); doc.setTextColor(...DARK);
    if (tripDate) doc.text(`Last Trip Test Date: ${tripDate}`, ML + 2, curY + 4);
    if (tripPsi)  doc.text(`Trip Pressure: ${tripPsi} PSI`, ML + 60, curY + 4);
    if (due5yr)   doc.text(`5-Year Items Next Due: ${due5yr}`, ML + 120, curY + 4);
    curY += 8;
  }

  // PAGE 31: INVENTORY CHANGE SHEET
  newPage('Inventory Change Sheet');
  const invCols = [{label:'Floor',w:CW*0.07},{label:'Type',w:CW*0.09},{label:'Location',w:CW*0.33},{label:'Address',w:CW*0.14},{label:'Add/Rem',w:CW*0.12},{label:'Pass/Fail',w:CW*0.12},{label:'Note',w:CW*0.13}];
  tableHeader(invCols);
  const invRows = document.querySelectorAll('#h-inventory-tbody tr');
  invRows.forEach((row, i) => {
    const ins = row.querySelectorAll('input');
    const sls = row.querySelectorAll('select');
    tableRow(invCols.map(c=>({w:c.w})),
      [ins[0]?.value||'', ins[1]?.value||'', ins[2]?.value||'', ins[3]?.value||'',
       sls[0]?.options[sls[0].selectedIndex]?.text||'', sls[1]?.options[sls[1].selectedIndex]?.text||'',
       ins[4]?.value||''], i%2===0);
  });
  const addedCount   = Array.from(invRows).filter(r => r.querySelector('select')?.value === 'ADDED').length;
  const removedCount = invRows.length - addedCount;
  doc.setFont('helvetica','bold'); doc.setFontSize(6.5); doc.setTextColor(...DARK);
  doc.text(`STATUS — ADDED: ${addedCount}   REMOVED: ${removedCount}`, ML, curY + 4); curY += 8;

  // PAGES 32+: FIRE EXTINGUISHER INSPECTION RESULTS (33 per page)
  // Collect all ext unit data from the new ext-unit-row-N / ext-action-row-N system
  const _extUnits = [];
  for (let _ei = 1; _ei <= extUnitCount; _ei++) {
    if (!document.getElementById('ext-unit-row-' + _ei)) continue;
    _extUnits.push({
      flr:     document.getElementById('u-flr-'    + _ei)?.value || '',
      loc:     document.getElementById('u-loc-'    + _ei)?.value || '',
      mount:   document.getElementById('u-mount-'  + _ei)?.value || '',
      mfg:     document.getElementById('u-mfg-'    + _ei)?.value || '',
      size:    document.getElementById('u-size-'   + _ei)?.value || '',
      type:    document.getElementById('u-type-'   + _ei)?.value || '',
      pf:      document.getElementById('u-pf-'     + _ei)?.value || '',
      hydro:   document.getElementById('u-hydro-'  + _ei)?.value || '',
      recharge:document.getElementById('u-recharge-'+ _ei)?.value || '',
      newunit: document.getElementById('u-newunit-'+ _ei)?.value || '',
    });
  }
  if (_extUnits.length) {
    // Key/info page first
    newPage('Fire Extinguisher Information & Key — EC.02.03.05 EP 16');
    subHeader('Inspection Results Key and Information');
    const keyInfo = [
      ['Unit Passed Inspection', 'PASS'],
      ['Unit is Deficient/Missing', 'FAIL'],
      ['ABC Units Service Interval', 'Every 6 years — alternating 6-year maintenance and hydrostatic pressure test'],
      ['Special Hazard Units', 'Every 5 years — hydrostatic pressure test'],
      ['Cabinet Requirements', 'Cabinets must have glass, strike mallets, and signage if obstructed from view'],
    ];
    tableHeader([{label:'Item',w:CW*0.35},{label:'Detail',w:CW*0.65}]);
    keyInfo.forEach(([l, v], i) => tableRow([{w:CW*0.35},{w:CW*0.65}], [l, v], i%2===0));
    curY += 5;
    subHeader('Services Due Now Summary');
    const extSumCols = [{label:'Type',w:CW*0.2},{label:'6-Year Maint',w:CW*0.16},{label:'Hydrostatic',w:CW*0.16},{label:'Recharge',w:CW*0.16},{label:'New Unit',w:CW*0.16},{label:'Notes',w:CW*0.16}];
    tableHeader(extSumCols);
    document.querySelectorAll('#ext-svc-tbody tr').forEach((row, i) => {
      const cells = row.querySelectorAll('td');
      const vals = Array.from(cells).map(c => c.querySelector('input')?.value || c.textContent?.trim() || '');
      tableRow(extSumCols.map(c=>({w:c.w})), vals.slice(0, 6), i%2===0);
    });
    curY += 4;
    // Summary totals
    doc.setFont('helvetica','bold'); doc.setFontSize(7); doc.setTextColor(...DARK);
    doc.text(`TOTAL EXTINGUISHERS ON REPORT: ${_extUnits.length}`, ML, curY + 4); curY += 8;
    // Missing items
    const mallets = fv('ext-nf-mallets');
    const signage = fv('ext-nf-signage');
    const glass   = fv('ext-nf-glass');
    if (mallets || signage || glass) {
      doc.text(`Cabinet Mallets Missing: ${mallets||0}   Location Signage Missing: ${signage||0}   Cabinet Glass: ${glass||'—'}`, ML, curY + 4);
      curY += 8;
    }

    // Extinguisher detail pages — 33 rows per page
    const extCols = [{label:'Floor',w:CW*0.06},{label:'Location',w:CW*0.22},{label:'Mount',w:CW*0.07},{label:'Cabinet',w:CW*0.1},{label:'MFG Yr',w:CW*0.07},{label:'Size',w:CW*0.06},{label:'Type',w:CW*0.07},{label:'P/F',w:CW*0.07},{label:'Hydro Due',w:CW*0.09},{label:'Recharge',w:CW*0.08},{label:'New Unit',w:CW*0.11}];
    for (let start = 0; start < _extUnits.length; start += 33) {
      newPage('Annual — Fire Extinguisher Inspection Results — EC.02.03.05 EP 16');
      tableHeader(extCols);
      _extUnits.slice(start, start + 33).forEach((u, i) => {
        // Cabinet: combine cab flags
        const cabBits = [];
        if (document.getElementById('u-cab-m-' + (start+i+1))?.value === 'Y') cabBits.push('Mallet');
        if (document.getElementById('u-cab-g-' + (start+i+1))?.value === 'Y') cabBits.push('Glass');
        if (document.getElementById('u-cab-s-' + (start+i+1))?.value === 'Y') cabBits.push('Sign');
        tableRow(extCols.map(c=>({w:c.w})),
          [u.flr, u.loc, u.mount, cabBits.join('/') || '—', u.mfg, u.size, u.type, u.pf, u.hydro, u.recharge==='Y'?'YES':'', u.newunit==='Y'?'YES':''],
          i%2===0);
      });
      if (start + 33 >= _extUnits.length) {
        doc.setFont('helvetica','bold'); doc.setFontSize(6.5); doc.setTextColor(...DARK);
        doc.text(`UNIT COUNT: ${_extUnits.length}`, ML, curY + 4); curY += 8;
      }
    }
  }

  // PAGE LAST: DEFICIENCY INFORMATION
  newPage('Deficiency Information');

  // Deficiency list
  sectionHeader('Deficiencies', DARK);
  const defRows = document.querySelectorAll('#h-defic-tbody tr');
  const defCols = [{label:'#',w:CW*0.06},{label:'Deficiency',w:CW*0.78},{label:'Make/Model',w:CW*0.16}];
  tableHeader(defCols);
  if (defRows.length) {
    defRows.forEach((row, i) => {
      const ins = row.querySelectorAll('input');
      checkPageBreak(6);
      tableRow(defCols.map(c=>({w:c.w})),
        [String(i+1), ins[0]?.value||'', ins[1]?.value||''], i%2===0);
    });
  } else {
    doc.setFont('helvetica','italic'); doc.setFontSize(7); doc.setTextColor(150,150,150);
    doc.text('No deficiencies recorded.', ML + 2, curY + 4); curY += 8;
  }
  curY += 4;

  // Failed batteries
  checkPageBreak(25);
  sectionHeader('Failed Batteries (If Applicable)', DARK);
  const batRows = document.querySelectorAll('#h-battery-tbody tr');
  const batCols = [{label:'Size (AH)',w:CW*0.18},{label:'Type',w:CW*0.18},{label:'Count',w:CW*0.14},{label:'Locations',w:CW*0.5}];
  tableHeader(batCols);
  if (batRows.length) {
    batRows.forEach((row, i) => {
      const ins = row.querySelectorAll('input');
      tableRow(batCols.map(c=>({w:c.w})), [ins[0]?.value||'', ins[1]?.value||'', ins[2]?.value||'', ins[3]?.value||''], i%2===0);
    });
  } else {
    doc.setFont('helvetica','italic'); doc.setFontSize(7); doc.setTextColor(150,150,150);
    doc.text('No battery failures recorded.', ML + 2, curY + 4); curY += 8;
  }
  curY += 4;

  // General notes
  checkPageBreak(20);
  sectionHeader('General Notes & Site Observations', DARK);
  const noteRows = document.querySelectorAll('#h-notes-tbody tr');
  if (noteRows.length) {
    noteRows.forEach((row, i) => {
      checkPageBreak(6);
      const ins = row.querySelectorAll('input');
      tableRow([{w:CW*0.06},{w:CW*0.94}], [String(i+1), ins[0]?.value||''], i%2===0);
    });
  } else {
    doc.setFont('helvetica','italic'); doc.setFontSize(7); doc.setTextColor(150,150,150);
    doc.text('No general notes recorded.', ML + 2, curY + 4); curY += 8;
  }

  // Overall status
  curY += 6;
  checkPageBreak(20);
  if (H.overallStatus) {
    const statusColor = H.overallStatus === 'COMPLIANT' ? PGREEN : H.overallStatus === 'IMPAIRED' ? PRED : [217, 119, 6];
    doc.setFillColor(...statusColor);
    doc.rect(ML, curY, CW, 10, 'F');
    doc.setTextColor(...WHITE); doc.setFont('helvetica','bold'); doc.setFontSize(11);
    doc.text(`OVERALL STATUS: ${H.overallStatus}`, PW/2, curY + 7, {align:'center'});
    curY += 14;
  }

  // Photos (if any)
  const photos = document.querySelectorAll('#h-photo-grid .photo-thumb img');
  if (photos.length) {
    checkPageBreak(40);
    sectionHeader('Inspection Photos', DARK);
    let px = ML, py = curY;
    const photoW = (CW - 6) / 3;
    const photoH = photoW * 0.75;
    photos.forEach((img, idx) => {
      checkPageBreak(photoH + 14);
      try {
        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth || 200;
        canvas.height = img.naturalHeight || 150;
        canvas.getContext('2d').drawImage(img, 0, 0);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.7);
        doc.addImage(dataUrl, 'JPEG', px, py, photoW, photoH);
        const caption = img.closest('.photo-thumb')?.querySelector('textarea')?.value || '';
        if (caption) {
          doc.setFont('helvetica','normal'); doc.setFontSize(6); doc.setTextColor(...DARK);
          doc.text(doc.splitTextToSize(caption, photoW)[0], px, py + photoH + 3);
        }
      } catch(e) { /* skip bad images */ }
      px += photoW + 3;
      if ((idx + 1) % 3 === 0) { px = ML; py += photoH + 10; checkPageBreak(photoH + 14); }
    });
    curY = py + photoH + 14;
  }

  // Signature block — last element of last page
  checkPageBreak(40);
  sectionHeader('Signatures', DARK);
  // Inspector sig
  doc.setFont('helvetica','bold'); doc.setFontSize(7); doc.setTextColor(...DARK);
  doc.text('INSPECTOR SIGNATURE:', ML, curY + 5);
  doc.setFont('helvetica','normal');
  doc.text(fv('h-sig-name') + '   Date: ' + fv('h-sig-date'), ML, curY + 10);
  if (H.inspSig) {
    try { doc.addImage(H.inspSig, 'PNG', ML, curY + 12, 60, 14); } catch(e) {}
  }
  doc.line(ML, curY + 28, ML + 80, curY + 28);

  // Customer sig
  doc.setFont('helvetica','bold');
  doc.text('CUSTOMER SIGNATURE (Optional):', ML + 100, curY + 5);
  doc.setFont('helvetica','normal');
  doc.text(fv('h-cust-sig-name') + '   ' + fv('h-cust-sig-title'), ML + 100, curY + 10);
  if (H.custSig) {
    try { doc.addImage(H.custSig, 'PNG', ML + 100, curY + 12, 60, 14); } catch(e) {}
  }
  doc.line(ML + 100, curY + 28, PW - MR, curY + 28);
  curY += 32;

  // Footer note on every page
  const totalPages = doc.getNumberOfPages();
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p);
    doc.setFont('helvetica','italic'); doc.setFontSize(6); doc.setTextColor(120,120,120);
    doc.text('Fire Life Protection Systems   |   firelifeprotection.com', PW/2, PH - 5, {align:'center'});
  }

  // Save the file
  const bld  = fv('property-name').replace(/\s+/g,'_') || 'Hospital';
  const dt   = fv('insp-date').replace(/-/g,'') || new Date().toISOString().substring(0,10).replace(/-/g,'');
  if (returnDoc) return doc;
  doc.save(`FLPS_TJC_${bld}_${dt}.pdf`);
}
