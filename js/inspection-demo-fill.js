// ─────────────────────────────────────────────────────────────────────────────
// DEMO FILL — admin-only "fill every field with dummy data & preview" tool.
//
// PURPOSE: spot-check the generated inspection PDFs (fonts, spacing, multi-line
// wrapping) without hand-filling the whole wizard. For each system it drives the
// REAL form (startInspectionForSystem → real panel builders → real add-row fns →
// real previewPDF), so what you see is exactly what production renders.
//
// GATING: the floating launcher is hidden unless the selected property is
// "test customer invoice Cole" (the dedicated test property), so normal users
// never see it. Loaded on inspection.html and hospital-inspection.html; it
// feature-detects which page it's on.
//
// This file only READS/WRITES the same DOM the real form uses and never touches
// Google/Drive — it's inert until you click a Demo button.
// ─────────────────────────────────────────────────────────────────────────────
(function () {
  'use strict';

  const DEMO_PROP = 'test customer invoice cole';
  const LONG_NOTE = 'Demo note (long, to exercise multi-line wrapping): during inspection the ' +
    'device was tested per NFPA and found operational; minor surface corrosion noted on the ' +
    'bracket and recommended for monitoring at the next service interval. No impairment to function.';

  const tick = () => new Promise(r => setTimeout(r, 60));
  const has  = (name) => typeof window[name] === 'function';
  const $    = (id) => document.getElementById(id);

  // ── Dummy-value heuristics ────────────────────────────────────────────────
  function demoValueFor(el) {
    const key = ((el.id || '') + ' ' + (el.placeholder || '') + ' ' + (el.name || '')).toLowerCase();
    const type = (el.type || '').toLowerCase();
    if (type === 'date' || /\bdate\b/.test(key)) return '2026-07-01';
    if (type === 'email' || /email/.test(key)) return 'demo@firelifeprotectionsystems.com';
    if (/phone|tel|cell/.test(key)) return '(303) 555-0100';
    if (/year|mfg|\byr\b|manufactur/.test(key)) return '2019';
    if (/psi|static|residual|\bpost\b|pressure|amp|volt|count|qty|quantity|batt|reading|gpm|elevation/.test(key)) return '52';
    if (/note|defic|comment|observ|remark|recommend|correct|detail|description/.test(key)) return LONG_NOTE;
    if (/loc|location|area|room|floor|zone|address/.test(key)) return 'Main Lobby, North Corridor & 2nd-Floor Mechanical Room';
    if (/name/.test(key)) return 'Demo Value';
    if (/model|make|manuf|serial|part|scan|circuit|panel|make\/model/.test(key)) return 'ACME-1000';
    if (/size/.test(key)) return '10 lb';
    if (type === 'number') return '5';
    return 'Demo value';
  }

  // Pick a meaningful non-empty <select> option; prefer a passing/affirmative one.
  function pickOption(sel) {
    const opts = [...sel.options].filter(o => o.value !== '' && o.value !== '—');
    if (!opts.length) return null;
    const good = opts.find(o => /^(pass|yes|y|compliant|ok|good|sat|n\/a|na)$/i.test(o.value.trim()));
    return (good || opts[0]).value;
  }

  // ── Field sweep ───────────────────────────────────────────────────────────
  function fillEl(el) {
    if (el.dataset.demoFilled) return;
    el.dataset.demoFilled = '1';
    const type = (el.type || '').toLowerCase();
    if (type === 'button' || type === 'submit' || type === 'file' || type === 'hidden') return;
    if (el.disabled || el.readOnly) return;
    if (type === 'checkbox' || type === 'radio') { el.checked = true; fire(el, 'change'); return; }
    if (el.tagName === 'SELECT') {
      const v = pickOption(el);
      if (v != null) { el.value = v; fire(el, 'change'); }
      return;
    }
    if ((el.value || '').trim()) return; // keep meaningful prefilled values
    el.value = demoValueFor(el);
    fire(el, 'input'); fire(el, 'change');
  }

  function fire(el, ev) {
    try { el.dispatchEvent(new Event(ev, { bubbles: true })); } catch (_) {}
  }

  function fillScope(rootSelectors) {
    rootSelectors.forEach(sel => {
      document.querySelectorAll(sel).forEach(root => {
        root.querySelectorAll('input, select, textarea').forEach(fillEl);
      });
    });
  }

  function setById(id, val) { const el = $(id); if (el) { el.value = val; fire(el, 'input'); fire(el, 'change'); el.dataset.demoFilled = '1'; } }

  // ── Pass/Fail rows: mostly PASS, every 4th FAIL (+ deficiency text) ─────────
  function setInspectRows() {
    let i = 0;
    document.querySelectorAll('.inspect-row[data-val]').forEach(row => {
      const fail = (i++ % 4 === 3);
      row.dataset.val = fail ? 'FAIL' : 'PASS';
      // reflect selection on any button UI so the panel looks right too
      row.querySelectorAll('.pf-btn, .yna-btn').forEach(b => b.classList.remove('selected'));
      const want = fail ? /fail|^n$/i : /pass|^y$/i;
      row.querySelectorAll('.pf-btn, .yna-btn').forEach(b => { if (want.test(b.textContent.trim())) b.classList.add('selected'); });
      if (fail) {
        const itemId = row.id.replace('row-', '');
        const dt = $('defic-txt-' + itemId);
        if (dt) { dt.value = 'Demo deficiency: device failed functional test and requires corrective action. ' + LONG_NOTE; dt.dataset.demoFilled = '1'; }
      }
    });
  }

  // ── Demo photos (exercise the photo grid + captions) ───────────────────────
  function addDemoPhotos() {
    if (typeof window.inspectionPhotos === 'undefined' || !Array.isArray(window.inspectionPhotos)) return;
    if (window.inspectionPhotos.length) return;
    for (let i = 1; i <= 2; i++) {
      try {
        const c = document.createElement('canvas'); c.width = 400; c.height = 300;
        const g = c.getContext('2d');
        g.fillStyle = i === 1 ? '#c4d0e8' : '#e8d6c4'; g.fillRect(0, 0, 400, 300);
        g.fillStyle = '#1f3566'; g.font = 'bold 28px sans-serif';
        g.fillText('Demo Photo ' + i, 90, 160);
        window.inspectionPhotos.push({ dataUrl: c.toDataURL('image/jpeg', 0.7), note: 'Demo caption ' + i + ' — ' + LONG_NOTE });
      } catch (_) {}
    }
  }

  // ── Common identity / cover fields ─────────────────────────────────────────
  function seedIdentity() {
    setById('property-name', 'test customer invoice Cole');
    setById('client-company', 'Test Customer Invoice Cole LLC');
    setById('service-address', '1234 Demonstration Ave');
    setById('city-state-zip', 'Littleton, CO 80127');
    setById('property-contact-name', 'Jordan Demo');
    setById('property-contact-email', 'jordan@example.com');
    setById('insp-date', '2026-07-01');
    setById('inspector-name', 'Alan Antonio');
    setById('inspector-cert', 'NICET III #123456');
    ['job-num', 'jurisdiction', 'sig-name', 'cust-sig-name'].forEach(id => setById(id, id.includes('sig') ? 'Alan Antonio' : 'DEMO-1001'));
    setById('cust-sig-date', '2026-07-01');
    try { window.overallStatus = 'DEFICIENT'; if (has('setOverallStatus')) setOverallStatus('DEFICIENT'); } catch (_) {}
  }

  const call = (name, ...args) => { try { if (has(name)) window[name](...args); } catch (e) { console.warn('demo: ' + name + ' failed', e); } };
  const repeat = (name, n, argFn) => { for (let k = 0; k < n; k++) call(name, ...(argFn ? argFn(k) : [])); };

  // ── Per-system dynamic-row seeding (all guarded) ───────────────────────────
  function seedRows(sysKey) {
    if (sysKey === 'extinguisher') {
      call('addExtUnitRow', { flr: '1', loc: 'Lobby by main entrance', mfg: '2019', size: '10 lb', type: 'ABC', mount: 'HK', pf: 'PASS' });
      call('addExtUnitRow', { flr: '2', loc: 'Break room by exit', mfg: '2015', size: '5 lb', type: 'ABC', mount: 'CAB', cabM: 'Y', cabS: 'Y', pf: 'FAIL' });
      call('addExtUnitRow', { flr: 'B', loc: 'Mechanical room', mfg: '2021', size: '20 lb', type: 'CO2', mount: 'WALL', pf: 'PASS' });
      call('buildExtSvcTable'); call('buildExtQATable');
    } else if (sysKey === 'hood') {
      // Add appliances to whatever hood cards initHoodPanel created.
      try {
        const ids = (window.activeHoodList || []).map(h => (typeof h === 'string' ? h : h && h.id)).filter(Boolean);
        (ids.length ? ids : [null]).forEach(hid => { call('addHoodAppliance', hid); call('addHoodAppliance', hid); });
      } catch (e) { console.warn('demo hood', e); }
    } else if (sysKey === 'fire-alarm') {
      repeat('addFASubpanelRow', 2); repeat('addFADetectionRow', 3); repeat('addFAFlowRow', 2);
      repeat('addFATamperRow', 2); repeat('addFABatteryRow', 2); repeat('addFADeficRow', 2); repeat('addFANoteRow', 2);
    } else if (sysKey === 'sprinkler') {
      call('addSPDrainRow', 'Riser 1 — North', '55', '48', '52'); call('addSPDrainRow', 'Riser 2 — South', '58', '50', '54');
      repeat('addSPDeficRow', 2); repeat('addSPNoteRow', 2);
    } else if (sysKey === 'exit-sign-lighting') {
      repeat('addELRow', 3); repeat('addESRow', 3);
    }
    // Generic deficiency + notes rows for every system that uses them.
    repeat('addGenericDeficRow', 2);
    repeat('addExtGenericNote', 2);
    repeat('addExtNoteRow', 1);
  }

  const FILL_ROOTS = [
    '#sys-forms', '#step-fa-panel', '#step-sp-overview', '#step-sp-inspection',
    '#step-sp-drain', '#step-sp-defic', '#step-ext-summary', '#step-generic-prevdefic',
    '#generic-defic-tbody', '#ext-notes-tbody', '#fa-defic-tbody', '#fa-notes-tbody',
    '#sp-defic-tbody', '#sp-notes-tbody', '#ext-tbody'
  ];

  // ── Overlay to mask the transient wizard navigation during generation ───────
  function overlay(msg) {
    let o = $('demo-overlay');
    if (!o) {
      o = document.createElement('div');
      o.id = 'demo-overlay';
      o.style.cssText = 'position:fixed;inset:0;z-index:99998;background:rgba(31,53,102,.92);color:#fff;display:flex;align-items:center;justify-content:center;font-family:system-ui,sans-serif;font-size:1.1rem;font-weight:600;text-align:center;padding:20px;';
      document.body.appendChild(o);
    }
    o.textContent = msg;
    o.style.display = 'flex';
  }
  const hideOverlay = () => { const o = $('demo-overlay'); if (o) o.style.display = 'none'; };

  // Return the user to the Systems tab (step 2) no matter which system ran.
  function returnToSystems(sysKey) {
    try {
      if (sysKey === 'fire-alarm' && has('exitFireAlarmInspection')) return exitFireAlarmInspection('systems');
      if (sysKey === 'sprinkler' && has('exitSprinklerInspection')) return exitSprinklerInspection('systems');
      activeInspectionSystem = null;
      if (has('syncMainNavDisabled')) syncMainNavDisabled();
      if (has('goStep')) goStep(2);
    } catch (e) { console.warn('demo returnToSystems', e); }
  }

  // ── Run one system end-to-end ──────────────────────────────────────────────
  async function runInspectionDemo(sysKey) {
    const origSaveDraft = window.saveDraft;
    try {
      overlay('🧪 Generating demo ' + sysKey + ' PDF…');
      window.saveDraft = function () {};            // don't persist demo data as a draft
      if (has('clearDraft')) clearDraft();
      seedIdentity();
      // Build FRESH panels with no saved-inspection prefill (ignore the profile).
      if (typeof buildInspectionForms !== 'function') throw new Error('buildInspectionForms not found on this page');
      activeInspectionSystem = sysKey;
      window._prevInspectionData = null;
      if (has('syncMainNavDisabled')) syncMainNavDisabled();
      buildInspectionForms();
      await tick();
      seedRows(sysKey);
      await tick();
      // clear demoFilled marks from any freshly-added rows so they get filled too
      document.querySelectorAll('[data-demo-filled]').forEach(el => { if (!el.value) delete el.dataset.demoFilled; });
      fillScope(FILL_ROOTS);
      setInspectRows();
      seedIdentity();                               // re-assert cover fields after sweeps
      addDemoPhotos();
      if (has('buildItemPanelMap')) buildItemPanelMap();
      if (has('updateDeficiencySummary')) updateDeficiencySummary();
      await tick();
      if (!has('previewPDF')) throw new Error('previewPDF not found');
      await previewPDF();                           // generates + downloads the PDF
    } catch (e) {
      console.error('Demo fill failed:', e);
      alert('Demo fill failed for "' + sysKey + '": ' + e.message + '\n(See console for details.)');
    } finally {
      window.saveDraft = origSaveDraft;
      returnToSystems(sysKey);
      if (has('clearDraft')) clearDraft();          // wipe any transient demo draft
      hideOverlay();
      window.inspectionPhotos && (window.inspectionPhotos.length = 0); // reset for next run
    }
  }

  // ── Hospital (separate page / engine) ──────────────────────────────────────
  async function runHospitalDemo() {
    try {
      overlay('🧪 Generating demo Hospital PDF…');
      seedIdentity();
      if (!has('startHospInspection')) throw new Error('startHospInspection not found');
      startHospInspection(true);
      await tick();
      ['addHMainDrainRow', 'addHOffPremRow', 'addHElevatorBank', 'addHSubpanelRow',
       'addHAnnunciatorCard', 'addHSpareHeadRow', 'addHInventoryRow', 'addHBatteryRow',
       'addHDeficRow', 'addHNoteRow'].forEach(fn => { repeat(fn, 2); });
      await tick();
      document.querySelectorAll('[data-demo-filled]').forEach(el => { if (!el.value) delete el.dataset.demoFilled; });
      // Hospital form fields are spread across its steps; fill the whole document
      // body except the demo UI (hospital page has no Google-key inputs on screen).
      document.querySelectorAll('body input, body select, body textarea').forEach(el => {
        if (el.closest('#demo-fill-ui')) return;
        fillEl(el);
      });
      seedIdentity();
      await tick();
      if (!has('hospPreviewPDF')) throw new Error('hospPreviewPDF not found');
      await hospPreviewPDF();
    } catch (e) {
      console.error('Hospital demo fill failed:', e);
      alert('Hospital demo fill failed: ' + e.message + '\n(See console for details.)');
    } finally {
      hideOverlay();
    }
  }

  // ── Launcher UI (gated to the test property) ───────────────────────────────
  const isHospitalPage = () => has('startHospInspection') && !has('startInspectionForSystem');

  // Every inspectable system (hospital lives on its own page). Built from SYS_META
  // so the popup always lists ALL types, not just previously-inspected ones.
  function allSystems() {
    const meta = (typeof SYS_META !== 'undefined') ? SYS_META : {};
    return Object.keys(meta)
      .filter(k => k !== 'hospital')
      .map(k => [k, ((meta[k].icon || '⚙️') + ' ' + (meta[k].label || k))]);
  }

  function buildUI() {
    if ($('demo-fill-ui')) return;
    const wrap = document.createElement('div');
    wrap.id = 'demo-fill-ui';
    wrap.style.cssText = 'position:fixed;right:16px;bottom:16px;z-index:99999;font-family:system-ui,sans-serif;display:none;';
    const menu = document.createElement('div');
    menu.id = 'demo-fill-menu';
    menu.style.cssText = 'display:none;flex-direction:column;gap:6px;margin-bottom:8px;background:#fff;border:2px solid #1f3566;border-radius:10px;padding:10px;box-shadow:0 6px 24px rgba(0,0,0,.25);max-height:70vh;overflow:auto;';
    const title = document.createElement('div');
    title.textContent = '🧪 Demo PDFs (test property only)';
    title.style.cssText = 'font-weight:700;font-size:.8rem;color:#1f3566;margin-bottom:2px;';
    menu.appendChild(title);
    const mkBtn = (label, fn) => {
      const b = document.createElement('button');
      b.textContent = label;
      b.style.cssText = 'text-align:left;padding:7px 10px;border:1px solid #c9d4ea;border-radius:7px;background:#f5f8ff;cursor:pointer;font-size:.8rem;font-weight:600;color:#1f3566;';
      b.onclick = () => { menu.style.display = 'none'; fn(); };
      return b;
    };
    if (isHospitalPage()) {
      menu.appendChild(mkBtn('🏥 Hospital TJC/CMS', runHospitalDemo));
    } else {
      allSystems().forEach(([key, label]) => menu.appendChild(mkBtn(label, () => runInspectionDemo(key))));
    }
    const fab = document.createElement('button');
    fab.textContent = '🧪 Demo';
    fab.style.cssText = 'padding:11px 16px;border:none;border-radius:24px;background:#1f3566;color:#fff;font-weight:700;font-size:.85rem;cursor:pointer;box-shadow:0 4px 16px rgba(0,0,0,.3);';
    fab.onclick = () => { menu.style.display = menu.style.display === 'none' ? 'flex' : 'none'; };
    wrap.appendChild(menu); wrap.appendChild(fab);
    document.body.appendChild(wrap);
  }

  function refreshGate() {
    buildUI();
    const wrap = $('demo-fill-ui');
    if (!wrap) return;
    const name = ($('property-name')?.value || '').trim().toLowerCase();
    wrap.style.display = (name === DEMO_PROP) ? 'block' : 'none';
  }

  function init() {
    buildUI();
    refreshGate();
    // Re-check when the property changes (typed, selected, or restored).
    const pn = $('property-name');
    if (pn) pn.addEventListener('input', refreshGate);
    document.addEventListener('change', (e) => { if (e.target && e.target.id === 'property-name') refreshGate(); });
    setInterval(refreshGate, 1500); // catches programmatic property loads
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
