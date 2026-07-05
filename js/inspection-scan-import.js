// ─────────────────────────────────────────────────────────────────────────────
// SCAN → AUTOLOAD — read a photo/scan of a hand-filled field worksheet with
// Claude vision and populate the active system's panel rows.
//
// Companion to inspection-blank-forms.js: the contractor prints the blank
// worksheet, fills it by hand, photographs it; office staff open the active
// property/system on inspection.html and upload the photo(s). Claude transcribes
// the grid into JSON keyed to the panel prefill contracts, then we call the same
// add*Row() functions the wizard uses. Nothing auto-submits — the inspector
// reviews/edits the loaded rows, then generates the report as usual.
//
// Reuses the browser-side Anthropic pattern from import-reports.html /
// sub-invoices.html (localStorage.flips_anth_key +
// anthropic-dangerous-direct-browser-access). Handwriting OCR needs a strong
// vision model, so this defaults to Sonnet regardless of the triage/haiku model.
//
// FIELD-CONTRACT SYNC: the JSON keys requested below MUST match the prefill
// objects accepted by addExtUnitRow() / addELRow() / addESRow() in
// js/inspection-panels.js. If you change a panel's prefill keys, update the
// prompt + apply() here too.
// ─────────────────────────────────────────────────────────────────────────────

const SCAN_ANTH_KEY_LS   = 'flips_anth_key';
const SCAN_MODEL_LS      = 'flips_scan_model';
const SCAN_DEFAULT_MODEL = 'claude-sonnet-4-6';

// Systems this importer supports, with per-system Claude prompt + row-apply logic.
const SCAN_SYSTEMS = {
  'extinguisher': {
    label: 'Portable Fire Extinguishers',
    prompt:
      'This is a hand-filled PORTABLE FIRE EXTINGUISHER worksheet. Each extinguisher is a TWO-ROW block. ' +
      'MOUNT, TYPE, and PASS/FAIL are CHECKBOXES — the inspector marks an X (or check/dot) in one box; ' +
      'report the label of the marked box. FLR, LOCATION, MFG YR, SIZE, HYDRO DUE, and NOTES are handwritten. ' +
      'Transcribe every block that has any writing. Return ONLY a JSON array (no prose, no code fences); ' +
      'each element is one extinguisher with EXACTLY these keys:\n' +
      '{\n' +
      '  "flr": string,        // floor, e.g. "1", "2", "B"\n' +
      '  "loc": string,        // location description\n' +
      '  "mount": string,      // the X-marked box: HK, WALL, CAB, or STAND ("" if none marked)\n' +
      '  "mfg": string,        // manufacture year, 4 digits, else ""\n' +
      '  "size": string,       // size in lb, e.g. "10", "5"\n' +
      '  "type": string,       // the X-marked box: ABC, CO2, K, Water, or Halon ("" if none marked)\n' +
      '  "hydroDue": string,   // year hydro/6-yr is due, else ""\n' +
      '  "pf": string,         // the X-marked box: "PASS" or "FAIL" ("" if none marked)\n' +
      '  "noteTxt": string     // any note written for this unit, else ""\n' +
      '}\n' +
      'Skip fully blank blocks. Preserve the order.',
    parse: (v) => Array.isArray(v) ? v : (v.units || v.rows || []),
    preview: (r) => `${r.loc || '(no location)'} — ${r.type || '?'} ${r.size || ''} · ${r.pf || '—'}`,
    apply: (rows) => {
      if (typeof addExtUnitRow !== 'function') return 0;
      let n = 0;
      rows.forEach(r => {
        addExtUnitRow({
          flr: r.flr || '', loc: r.loc || '', mount: scanNormMount(r.mount),
          mfg: r.mfg || '', size: r.size || '', type: scanNormExtType(r.type),
          hydroDue: r.hydroDue || '', pf: scanNormPF(r.pf), noteTxt: r.noteTxt || '',
        });
        n++;
      });
      return n;
    },
  },
  'exit-sign-lighting': {
    label: 'Exit Signs & Emergency Lighting',
    prompt:
      'This is a hand-filled EXIT SIGN & EMERGENCY LIGHTING worksheet with TWO sections: ' +
      '"EMERGENCY LIGHTING UNITS" and "EXIT SIGNS". Each unit is a TWO-ROW block: LOCATION, TYPE, and ' +
      'COMMENTS are handwritten; the test columns are CHECKBOXES with P / F / N/A boxes (PASS/FAIL has P / F) — ' +
      'the inspector marks an X (or check/dot) in one box per column; report which box is marked. ' +
      'Transcribe every block that has any writing. Return ONLY a JSON object (no prose, no code fences) with EXACTLY these keys:\n' +
      '{\n' +
      '  "emergencyLights": [ { "loc": string, "type": string, "pf30s": string, "pf90m": string, "pfBatt": string, "pf": string, "comments": string } ],\n' +
      '  "exitSigns":       [ { "loc": string, "type": string, "pfIllum": string, "pfArrows": string, "pfBatt": string, "pf": string, "comments": string } ]\n' +
      '}\n' +
      'For every checkbox column return the marked box as "PASS", "FAIL", or "NA" (P→PASS, F→FAIL, N/A→NA, none marked→""). ' +
      'Emergency-light "type" is one of LED/Fluorescent/Incandescent/Other; exit-sign "type" is one of LED/Photoluminescent/Incandescent/Other. ' +
      'Skip fully blank blocks.',
    parse: (v) => v || {},
    isSplit: true,
    previewSplit: (v) =>
      `${(v.emergencyLights || []).length} emergency light(s), ${(v.exitSigns || []).length} exit sign(s)`,
    apply: (v) => {
      let n = 0;
      if (typeof addELRow === 'function') (v.emergencyLights || []).forEach(r => {
        addELRow({ loc: r.loc || '', type: r.type || '', pf30s: scanNormPF(r.pf30s), pf90m: scanNormPF(r.pf90m), pfBatt: scanNormPF(r.pfBatt), pf: scanNormPF(r.pf), comments: r.comments || '' });
        n++;
      });
      if (typeof addESRow === 'function') (v.exitSigns || []).forEach(r => {
        addESRow({ loc: r.loc || '', type: r.type || '', pfIllum: scanNormPF(r.pfIllum), pfArrows: scanNormPF(r.pfArrows), pfBatt: scanNormPF(r.pfBatt), pf: scanNormPF(r.pf), comments: r.comments || '' });
        n++;
      });
      return n;
    },
  },
};

function scanNormPF(v) {
  const s = String(v || '').trim().toUpperCase();
  if (!s) return '';
  if (s === 'NA' || s === 'N/A' || s === 'N.A.') return 'NA';
  if (s[0] === 'P' || s === '✓' || s === 'PASS' || s === 'OK') return 'PASS';
  if (s[0] === 'F' || s === '✗' || s === 'X' || s === 'FAIL') return 'FAIL';
  return '';
}
function scanNormMount(v) {
  const s = String(v || '').trim().toUpperCase();
  if (['HK', 'WALL', 'CAB', 'STAND'].includes(s)) return s;
  if (s.startsWith('HOOK') || s === 'H') return 'HK';
  if (s.startsWith('CAB')) return 'CAB';
  if (s.startsWith('WALL') || s === 'W') return 'WALL';
  if (s.startsWith('STAND') || s === 'S') return 'STAND';
  return s ? 'HK' : 'HK';
}
function scanNormExtType(v) {
  const s = String(v || '').trim().toUpperCase().replace(/\s+/g, '');
  if (s.includes('CO2')) return 'CO2';
  if (s === 'K' || s.includes('CLASSK')) return 'K';
  if (s.startsWith('WATER') || s === 'H2O') return 'Water';
  if (s.startsWith('HALON')) return 'Halon';
  if (s.includes('ABC') || s === 'DRYCHEM') return 'ABC';
  return v ? String(v).trim() : 'ABC';
}

// ── Entry point (wired to the panel button) ──────────────────────────────────
// `systemOverride` lets pages without `activeInspectionSystem` (hospital-inspection.html)
// invoke a specific system, e.g. scanImportActiveSystem('extinguisher').
function scanImportActiveSystem(systemOverride) {
  const sys = SCAN_SYSTEMS[systemOverride || (typeof activeInspectionSystem !== 'undefined' ? activeInspectionSystem : '')];
  if (!sys) {
    if (typeof toast === 'function') toast('⚠ Scan import is available for extinguishers and exit signs/lighting.');
    return;
  }
  _scanOpenModal(sys);
}

let _scanFiles = [];
let _scanParsed = null;

function _scanOpenModal(sys) {
  _scanFiles = [];
  _scanParsed = null;
  let ov = document.getElementById('scan-import-overlay');
  if (!ov) {
    ov = document.createElement('div');
    ov.id = 'scan-import-overlay';
    ov.style.cssText = 'display:none;position:fixed;inset:0;background:rgba(0,0,0,0.55);z-index:10001;align-items:center;justify-content:center;';
    ov.innerHTML = `
      <div style="background:white;border-radius:14px;padding:24px;max-width:520px;width:92%;max-height:88vh;overflow:auto;box-shadow:0 8px 40px rgba(0,0,0,0.35);font-family:'DM Sans',sans-serif;">
        <div style="font-size:1.1rem;font-weight:700;color:var(--navy);margin-bottom:4px;">📷 Scan Paper Worksheet</div>
        <div id="scan-sys-label" style="font-size:.8rem;color:#667;margin-bottom:14px;"></div>
        <input type="file" id="scan-file-input" accept="image/*,application/pdf" multiple style="display:none;">
        <button id="scan-pick-btn" class="btn-secondary" style="width:100%;padding:12px;margin-bottom:10px;">＋ Add photos / PDF of the filled form</button>
        <div id="scan-file-list" style="font-size:.8rem;color:#445;margin-bottom:12px;"></div>
        <div id="scan-status" style="font-size:.82rem;color:#667;margin-bottom:12px;line-height:1.5;"></div>
        <div id="scan-review" style="display:none;margin-bottom:12px;"></div>
        <div style="display:flex;gap:10px;flex-wrap:wrap;">
          <button id="scan-read-btn" class="btn-primary" style="flex:1;padding:12px;min-width:150px;" disabled>Read with Claude</button>
          <button id="scan-load-btn" class="btn-primary" style="flex:1;padding:12px;min-width:150px;display:none;">Load into form</button>
          <button id="scan-cancel-btn" class="btn-secondary" style="flex:1;padding:12px;min-width:100px;">Cancel</button>
        </div>
        <div style="font-size:.72rem;color:#8a94a6;margin-top:12px;line-height:1.5;">
          Uses your Anthropic API key (paid, ~1–2¢ per page). Handwriting is read best-effort — always review the loaded rows before saving.
        </div>
      </div>`;
    document.body.appendChild(ov);
    ov.querySelector('#scan-pick-btn').onclick = () => ov.querySelector('#scan-file-input').click();
    ov.querySelector('#scan-file-input').onchange = (e) => _scanAddFiles(e.target.files);
    ov.querySelector('#scan-cancel-btn').onclick = _scanCloseModal;
    ov.querySelector('#scan-read-btn').onclick = () => _scanRun(sys);
    ov.querySelector('#scan-load-btn').onclick = () => _scanLoad(sys);
    ov.onclick = (e) => { if (e.target === ov) _scanCloseModal(); };
  }
  // Re-bind the read/load handlers to the current system (modal is reused).
  ov.querySelector('#scan-read-btn').onclick = () => _scanRun(sys);
  ov.querySelector('#scan-load-btn').onclick = () => _scanLoad(sys);
  ov.querySelector('#scan-sys-label').textContent = 'System: ' + sys.label;
  ov.querySelector('#scan-file-list').textContent = '';
  ov.querySelector('#scan-status').textContent = '';
  ov.querySelector('#scan-review').style.display = 'none';
  ov.querySelector('#scan-review').innerHTML = '';
  ov.querySelector('#scan-load-btn').style.display = 'none';
  ov.querySelector('#scan-read-btn').style.display = '';
  ov.querySelector('#scan-read-btn').disabled = true;
  ov.style.display = 'flex';
}

function _scanCloseModal() {
  const ov = document.getElementById('scan-import-overlay');
  if (ov) ov.style.display = 'none';
  _scanFiles = [];
  _scanParsed = null;
}

async function _scanAddFiles(fileList) {
  const files = Array.from(fileList || []);
  for (const f of files) {
    try {
      const b64 = await _scanFileToB64(f);
      _scanFiles.push({ name: f.name, type: f.type || (f.name.toLowerCase().endsWith('.pdf') ? 'application/pdf' : 'image/jpeg'), b64 });
    } catch (_) { /* skip unreadable file */ }
  }
  const ov = document.getElementById('scan-import-overlay');
  ov.querySelector('#scan-file-list').textContent = _scanFiles.length
    ? _scanFiles.map(f => '• ' + f.name).join('\n') : '';
  ov.querySelector('#scan-file-list').style.whiteSpace = 'pre-line';
  ov.querySelector('#scan-read-btn').disabled = _scanFiles.length === 0;
}

function _scanFileToB64(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(',')[1] || '');
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}

function _scanGetKey() {
  let key = localStorage.getItem(SCAN_ANTH_KEY_LS) || '';
  if (!key) {
    key = (prompt('Enter your Anthropic API key (starts with sk-ant-…). Stored locally for future scans.') || '').trim();
    if (key) localStorage.setItem(SCAN_ANTH_KEY_LS, key);
  }
  return key;
}

async function _scanRun(sys) {
  const ov = document.getElementById('scan-import-overlay');
  const status = ov.querySelector('#scan-status');
  if (!_scanFiles.length) { status.textContent = 'Add at least one photo or PDF first.'; return; }
  const key = _scanGetKey();
  if (!key) { status.textContent = '⚠ An Anthropic API key is required to read the form.'; return; }

  const readBtn = ov.querySelector('#scan-read-btn');
  readBtn.disabled = true;
  status.textContent = '⏳ Reading ' + _scanFiles.length + ' page(s) with Claude…';
  try {
    const parsed = await _scanCallClaude(sys, key);
    _scanParsed = parsed;
    _scanRenderReview(sys, parsed);
  } catch (e) {
    status.textContent = '⚠ ' + (e && e.message ? e.message : 'Failed to read the form.');
    readBtn.disabled = false;
  }
}

async function _scanCallClaude(sys, key) {
  const model = localStorage.getItem(SCAN_MODEL_LS) || SCAN_DEFAULT_MODEL;
  const content = _scanFiles.map(f => (
    f.type === 'application/pdf'
      ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: f.b64 } }
      : { type: 'image', source: { type: 'base64', media_type: f.type, data: f.b64 } }
  ));
  content.push({ type: 'text', text: sys.prompt });
  const systemMsg = 'You transcribe hand-filled fire-inspection field worksheets into structured JSON. ' +
    'The handwriting may be messy or abbreviated — read carefully and use your best judgment, but never invent rows. ' +
    'Return ONLY the requested JSON, no prose and no code fences.';
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true', 'content-type': 'application/json' },
    body: JSON.stringify({ model, max_tokens: 4000, system: systemMsg, messages: [{ role: 'user', content }] }),
  });
  if (!res.ok) throw new Error('Claude HTTP ' + res.status + ': ' + (await res.text()).slice(0, 160));
  const txt = (await res.json()).content?.[0]?.text || '';
  const cleaned = txt.replace(/^```(?:json)?\s*/, '').replace(/\s*```$/, '').trim();
  let obj;
  try { obj = JSON.parse(cleaned); }
  catch (_) {
    const m = cleaned.match(/[\[{][\s\S]*[\]}]/);
    if (!m) throw new Error('Claude did not return valid JSON.');
    obj = JSON.parse(m[0]);
  }
  return sys.parse(obj);
}

function _scanRenderReview(sys, parsed) {
  const ov = document.getElementById('scan-import-overlay');
  const status = ov.querySelector('#scan-status');
  const review = ov.querySelector('#scan-review');
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  let count, listHtml;
  if (sys.isSplit) {
    const el = parsed.emergencyLights || [], es = parsed.exitSigns || [];
    count = el.length + es.length;
    listHtml =
      (el.length ? '<div style="font-weight:700;color:var(--navy);margin-top:6px;">Emergency Lighting (' + el.length + ')</div>' +
        el.map(r => '<div>• ' + esc(r.loc || '(no location)') + ' — ' + esc(r.pf || '—') + '</div>').join('') : '') +
      (es.length ? '<div style="font-weight:700;color:var(--navy);margin-top:6px;">Exit Signs (' + es.length + ')</div>' +
        es.map(r => '<div>• ' + esc(r.loc || '(no location)') + ' — ' + esc(r.pf || '—') + '</div>').join('') : '');
  } else {
    count = parsed.length;
    listHtml = parsed.map((r, i) => '<div>' + (i + 1) + '. ' + esc(sys.preview(r)) + '</div>').join('');
  }

  if (!count) {
    status.textContent = '⚠ No rows were read from the image. Try a clearer, straight-on photo.';
    ov.querySelector('#scan-read-btn').disabled = false;
    return;
  }
  status.textContent = '✓ Read ' + count + ' row(s). Review below, then load into the form.';
  review.style.display = 'block';
  review.innerHTML =
    '<div style="font-size:.78rem;color:#445;max-height:34vh;overflow:auto;border:1px solid #e2e6ee;border-radius:8px;padding:10px;line-height:1.6;">' +
    listHtml + '</div>';
  ov.querySelector('#scan-read-btn').style.display = 'none';
  const loadBtn = ov.querySelector('#scan-load-btn');
  loadBtn.style.display = '';
  loadBtn.textContent = 'Load ' + count + ' row(s) into form';
}

function _scanLoad(sys) {
  if (!_scanParsed) return;
  const n = sys.apply(_scanParsed);
  if (typeof saveDraft === 'function') saveDraft();
  _scanCloseModal();
  if (typeof toast === 'function') toast('✓ Loaded ' + n + ' row(s) — review before saving.');
}
