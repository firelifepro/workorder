// ─────────────────────────────────────────────────────────────────────────────
// FLIPS SHARED — auth, property loading, expense calcs, Drive/API utilities
// Pages must define const SCOPES = '...' in their own <script> before calling
// initGoogle(). SHEET_ID and SHEET_GID are defined here for the property list.
// ─────────────────────────────────────────────────────────────────────────────

const SHEET_ID  = '1_Koq_v0RjsFbQ_c2qZh-eQpGQT2-0IkOal-I4CjSJrI';
const SHEET_GID = '1899870347';

let accessToken = null;
let tokenClient = null;
let clientData  = {};
let API_KEY_VAL = '';

// ─────────────────────────────────────────────────────────
// GOOGLE AUTH
// ─────────────────────────────────────────────────────────
// _scheduleTokenRefresh() lives in flips-google-fetch.js (loaded after this file)
// so it is available at call time even though it is not defined here.

async function initGoogle() {
  const apiKey   = document.getElementById('api-key').value.trim();
  const clientId = document.getElementById('client-id').value.trim();
  if (!apiKey || !clientId) { toast('⚠ Enter both API Key and Client ID'); return; }

  localStorage.setItem('flips_api_key', apiKey);
  localStorage.setItem('flips_client_id', clientId);
  API_KEY_VAL = apiKey;
  setStatus('conn-status', 'Connecting…', '');

  try {
    tokenClient = google.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: SCOPES,
      callback: async (resp) => {
        if (resp.error) {
          setStatus('conn-status', '✗ ' + resp.error, 'err');
          console.error('Token error:', resp);
          return;
        }
        accessToken = resp.access_token;
        localStorage.setItem('flips_access_token', accessToken);
        localStorage.setItem('flips_token_expiry', Date.now() + 55 * 60 * 1000);
        setStatus('conn-status', '✓ Connected', 'ok');
        _scheduleTokenRefresh();
        const refreshBtn = document.getElementById('refresh-props-btn');
        if (refreshBtn) refreshBtn.style.display = 'inline-block';
        await loadSheet();
        if (typeof onAfterAuth === 'function') onAfterAuth();
      },
      error_callback: (err) => {
        setStatus('conn-status', '✗ ' + (err.message || err.type), 'err');
        console.error('OAuth error:', err);
      }
    });
    tokenClient.requestAccessToken({ prompt: '' });
  } catch(e) {
    setStatus('conn-status', '✗ ' + e.message, 'err');
    console.error('initGoogle error:', e);
  }
}

// ─────────────────────────────────────────────────────────
// LOAD CLIENT SHEET
// ─────────────────────────────────────────────────────────
async function loadSheet(forceRefresh = false) {
  const CACHE_KEY = 'flips_client_cache';
  const CACHE_TTL = 30 * 60 * 1000;
  if (!forceRefresh) {
    try {
      const cached = JSON.parse(sessionStorage.getItem(CACHE_KEY) || 'null');
      if (cached && (Date.now() - cached.ts) < CACHE_TTL) {
        clientData = cached.data;
        buildDropdown();
        console.log('[loadSheet] Loaded', Object.keys(clientData).length, 'properties from session cache');
        return;
      }
    } catch(_) {}
  }

  const propLoading = document.getElementById('prop-loading');
  if (propLoading) propLoading.style.display = 'block';
  try {
    const sheetsUrl = `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}?fields=sheets.properties`;
    const metaRes = await googleFetch(sheetsUrl);

    if (metaRes.ok) {
      console.log('✓ Native Google Sheet — using Sheets API');
      const metaJson = await metaRes.json();
      let tabName = metaJson.sheets[0].properties.title;
      for (const s of metaJson.sheets) {
        if (String(s.properties.sheetId) === String(SHEET_GID)) { tabName = s.properties.title; break; }
      }
      const valRes = await googleFetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${encodeURIComponent(tabName)}`
      );
      if (!valRes.ok) throw new Error('Sheets values error ' + valRes.status);
      const valJson = await valRes.json();
      return parseRows(valJson.values || []);
    }

    console.log('Sheets API returned ' + metaRes.status + ', trying Drive CSV export...');
    const csvRes = await googleFetch(
      `https://www.googleapis.com/drive/v3/files/${SHEET_ID}/export?mimeType=text/csv`
    );
    if (csvRes.ok) {
      console.log('✓ Drive CSV export succeeded');
      const csvText = await csvRes.text();
      return parseRows(parseCSV(csvText));
    }

    const errBody = await metaRes.json().catch(() => ({}));
    const code = errBody.error?.code;
    if (code === 400 || errBody.error?.status === 'FAILED_PRECONDITION') {
      throw new Error(
        'Your spreadsheet is an uploaded Excel file, not a native Google Sheet. ' +
        'Fix: open it in Google Drive, click File → Save as Google Sheets, ' +
        'then paste the new URL here and update the SHEET_ID in the code.'
      );
    }
    throw new Error('Could not read spreadsheet (status ' + metaRes.status + '): ' + (errBody.error?.message || 'unknown error'));
  } catch(e) {
    setStatus('conn-status', '⚠ ' + e.message, 'err');
    toast('Client list failed — see top bar for details');
    console.error('loadSheet error:', e);
  } finally {
    if (propLoading) propLoading.style.display = 'none';
  }
}

function parseRows(rows) {
  if (!rows || rows.length < 2) { toast('Sheet appears empty'); return; }
  const headers = rows[0].map(h => (h || '').trim().toLowerCase());
  const nameKey = findKey(headers, ['property name','property','site name','site','name']);
  clientData = {};
  for (let i = 1; i < rows.length; i++) {
    const obj = {};
    headers.forEach((h, idx) => { obj[h] = (rows[i][idx] || '').trim(); });
    const label = obj[nameKey] || `Row ${i + 1}`;
    if (!label.trim()) continue;
    if (clientData[label]) console.warn(`[parseRows] Duplicate property name "${label}" — earlier row will be overwritten`);
    clientData[label] = obj;
  }
  try { sessionStorage.setItem('flips_client_cache', JSON.stringify({ ts: Date.now(), data: clientData })); } catch(_) {}
  buildDropdown();
}

function parseCSV(text) {
  const rows = [];
  let row = [];
  let cur = '';
  let q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) {
      if (ch === '"' && text[i+1] === '"') { cur += '"'; i++; }
      else if (ch === '"') { q = false; }
      else { cur += ch; }
    } else {
      if (ch === '"') { q = true; }
      else if (ch === ',') { row.push(cur.trim()); cur = ''; }
      else if (ch === '\r') { /* swallow, handled by \n */ }
      else if (ch === '\n') { row.push(cur.trim()); cur = ''; if (row.some(c => c !== '')) rows.push(row); row = []; }
      else { cur += ch; }
    }
  }
  if (cur !== '' || row.length > 0) { row.push(cur.trim()); if (row.some(c => c !== '')) rows.push(row); }
  return rows;
}

function findKey(headers, candidates) {
  for (const c of candidates) {
    const exact = headers.find(h => h === c);
    if (exact) return exact;
  }
  for (const c of candidates) {
    const partial = headers.find(h => h.includes(c));
    if (partial) return partial;
  }
  return headers[0];
}

function buildDropdown() {
  const sel = document.getElementById('property-select');
  if (!sel) return;
  sel.innerHTML = '<option value="">— Select property —</option>';
  Object.keys(clientData).sort().forEach(name => {
    const o = document.createElement('option');
    o.value = name; o.textContent = name;
    sel.appendChild(o);
  });
  toast('✓ Loaded ' + Object.keys(clientData).length + ' properties');
  clearPropertySearch();
}

function filterPropertyDropdown(query) {
  const sel   = document.getElementById('property-select');
  const clear = document.getElementById('prop-search-clear');
  if (!sel) return;
  const q = query.trim().toLowerCase();
  if (clear) clear.style.display = q ? 'block' : 'none';
  const prevVal = sel.value;

  sel.innerHTML = '';
  const names = Object.keys(clientData).sort();
  const matches = names.filter(n => !q || n.toLowerCase().includes(q));
  const placeholder = document.createElement('option');
  placeholder.value = '';
  placeholder.textContent = q ? `— ${matches.length} match${matches.length !== 1 ? 'es' : ''} —` : '— Select property —';
  sel.appendChild(placeholder);
  matches.forEach(name => {
    const o = document.createElement('option');
    o.value = name; o.textContent = name;
    sel.appendChild(o);
  });

  if (matches.length === 1) {
    sel.value = matches[0];
    if (matches[0] !== prevVal) onPropertySelect();
  } else if (prevVal && matches.includes(prevVal)) {
    sel.value = prevVal;
  }
}

function clearPropertySearch() {
  const input = document.getElementById('prop-search');
  const clear = document.getElementById('prop-search-clear');
  if (!input) return;
  input.value = '';
  if (clear) clear.style.display = 'none';
  filterPropertyDropdown('');
  input.focus();
}

function _updatePropertyBadge(propName) {
  const badge = document.getElementById('prop-selected-badge');
  if (!badge) return;
  if (propName) {
    badge.textContent = '✓ ' + propName;
    badge.style.display = 'block';
  } else {
    badge.style.display = 'none';
  }
}

// ─────────────────────────────────────────────────────────
// AUTO-POPULATE ON PROPERTY SELECT
// ─────────────────────────────────────────────────────────
function onPropertySelect() {
  const propName = document.getElementById('property-select').value;
  if (!propName || !clientData[propName]) { _updatePropertyBadge(''); return; }
  const d = clientData[propName];

  function fill(id, ...keys) {
    const el = document.getElementById(id);
    if (!el) return;
    for (const k of keys) {
      const match = Object.keys(d).find(h => h === k || h.includes(k));
      if (match && d[match]) { el.value = d[match]; return; }
    }
    el.value = '';
  }

  fill('client-company',  'property management','management company','management','client','company');
  fill('flps-acct-num',   'flps internal account number','internal account number','account number','account no','acct');
  fill('billing-email',   'billing email');
  fill('access-info',     'building access entry info','access entry info','access','entry','lockbox','gate code','access info','entry info');
  fill('monitoring-co',   'monitoring company','alarm company','monitoring');

  const addrKey = Object.keys(d).find(h =>
    ['address','service address','street address','street'].some(k => h.includes(k))
  );
  const rawAddr = addrKey ? d[addrKey] : '';
  const csvKey = Object.keys(d).find(h =>
    ['city','city/state','city / state','city, state','zip','city state zip'].some(k => h.includes(k))
  );
  const rawCsv = csvKey ? d[csvKey] : '';

  const addrEl = document.getElementById('service-address');
  const csvEl  = document.getElementById('city-state-zip');

  if (rawAddr) {
    const lines = rawAddr.split(/[\r\n]+/).map(l => l.trim()).filter(Boolean);
    if (lines.length >= 2) {
      if (addrEl) addrEl.value = lines[0];
      if (csvEl)  csvEl.value  = rawCsv || lines[lines.length - 1];
    } else {
      const commaIdx = rawAddr.search(/,\s*[A-Z]{2}\s+\d{5}/);
      if (commaIdx > 0) {
        const prevComma = rawAddr.lastIndexOf(',', commaIdx - 1);
        const splitAt = prevComma > 0 ? prevComma : commaIdx;
        if (addrEl) addrEl.value = rawAddr.slice(0, splitAt).trim();
        if (csvEl)  csvEl.value  = rawCsv || rawAddr.slice(splitAt + 1).trim();
      } else if (rawAddr.includes(',')) {
        const last = rawAddr.lastIndexOf(',');
        if (addrEl) addrEl.value = rawAddr.slice(0, last).trim();
        if (csvEl)  csvEl.value  = rawCsv || rawAddr.slice(last + 1).trim();
      } else {
        if (addrEl) addrEl.value = rawAddr;
        if (csvEl)  csvEl.value  = rawCsv || '';
      }
    }
  } else {
    if (addrEl) addrEl.value = '';
    if (csvEl)  csvEl.value  = rawCsv || '';
  }

  const reEmail = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/;
  const rePhone = /\(?\d{3}\)?[\s.\-]\d{3}[\s.\-]\d{4}/;
  const keys = Object.keys(d);

  const contactInfoKey = keys.find(h => h.includes('contact info') || h.includes('contact information'));
  const phoneKey = keys.find(h =>
    ['contact phone','phone number','mobile','cell','phone'].some(k => h.includes(k))
    && !h.includes('billing') && !h.includes('sub') && !h.includes('info')
  );
  const emailKey = keys.find(h =>
    ['contact email','e-mail','email address','email'].some(k => h.includes(k))
    && !h.includes('billing') && !h.includes('sub') && !h.includes('info')
  );
  const nameOnlyKey = keys.find(h =>
    ['property contact','contact name','property manager','on-site contact'].some(k => h.includes(k))
    && !h.includes('info') && !h.includes('phone') && !h.includes('email')
    && !h.includes('billing') && !h.includes('company') && !h.includes('management')
  );

  const rawCombined = contactInfoKey ? d[contactInfoKey] : '';
  const rawPhone    = phoneKey       ? d[phoneKey]       : '';
  const rawEmail    = emailKey       ? d[emailKey]       : '';
  const rawNameOnly = nameOnlyKey    ? d[nameOnlyKey]    : '';

  const emailFromCell = rawCombined ? (rawCombined.match(reEmail) || [])[0] || '' : '';
  const phoneFromCell = rawCombined ? (rawCombined.match(rePhone) || [])[0] || '' : '';

  const resolvedPhone = rawPhone || phoneFromCell;
  const resolvedEmail = rawEmail || emailFromCell;

  let resolvedName = '';
  const nameSource = rawCombined || rawNameOnly;
  if (nameSource) {
    const firstLine = nameSource.split(/[\r\n]+/)[0].trim();
    resolvedName = firstLine
      .replace(reEmail, '')
      .replace(rePhone, '')
      .replace(/\s*\([^)]*\)\s*/g, '')
      .replace(/\s+/g, ' ')
      .trim();
    if (!resolvedName) resolvedName = rawNameOnly ? rawNameOnly.trim() : nameSource.replace(/[\r\n]+/g, ' ').trim();
  }

  const pcEl = document.getElementById('property-contact');
  const phEl = document.getElementById('contact-phone');
  const emEl = document.getElementById('contact-email');
  if (pcEl) pcEl.value = resolvedName;
  if (phEl) phEl.value = resolvedPhone;
  if (emEl) emEl.value = resolvedEmail;

  const billToKey = Object.keys(d).find(h => h.includes('bill to') || h.includes('invoice info'));
  const billToVal = billToKey ? d[billToKey] : '';
  let billToHidden = document.getElementById('bill-to-address');
  if (!billToHidden) {
    billToHidden = document.createElement('input');
    billToHidden.type = 'hidden';
    billToHidden.id = 'bill-to-address';
    document.body.appendChild(billToHidden);
  }
  billToHidden.value = billToVal;

  _updatePropertyBadge(propName);
  if (typeof onPropertySelectExtras === 'function') onPropertySelectExtras(d);
}

// ─────────────────────────────────────────────────────────
// EXPENSE CALCULATIONS
//
// Unified row model. Every expense row has four controls keyed off a
// single "row key":
//   - expense input        (the cost)
//   - markup toggle (mkcb)  checked → markup = expense × global %, else $0
//   - markup input          editable; hand-edit sets an override (•)
//   - total input           editable; hand-edit sets an override (•)
// A row reset (↺) clears both overrides and re-derives from expense+toggle.
// Override state lives in each input's dataset.ovr ('1' = manually edited).
// ─────────────────────────────────────────────────────────
function getMarkupPct() {
  return (parseFloat(document.getElementById('markup-pct')?.value) || 0) / 100;
}

// Resolve the element IDs for a row key. Dynamic sub/mat rows use the
// legacy "sub-expense-N" id scheme; everything else is "<key>-expense".
function rowIds(key) {
  const m = /^(sub|mat)-(\d+)$/.exec(key);
  if (m) {
    const [, p, n] = m;
    return { exp: `${p}-expense-${n}`, mk: `${p}-markup-${n}`, tot: `${p}-total-${n}`, cb: `${p}-mkcb-${n}` };
  }
  return { exp: `${key}-expense`, mk: `${key}-markup`, tot: `${key}-total`, cb: `${key}-mkcb` };
}

// Recompute one row, honoring the markup toggle and any per-cell overrides.
function calcRow(key) {
  const { exp: expId, mk: mkId, tot: totId, cb: cbId } = rowIds(key);
  const expEl = document.getElementById(expId);
  const mkEl  = document.getElementById(mkId);
  const totEl = document.getElementById(totId);
  if (!mkEl || !totEl) return;
  const expense = parseFloat(expEl?.value) || 0;
  const cb = document.getElementById(cbId);

  if (mkEl.dataset.ovr !== '1') {
    const applies = cb ? cb.checked : true;
    const markup  = applies ? expense * getMarkupPct() : 0;
    mkEl.value = expense ? markup.toFixed(2) : '';
  }
  const markup = parseFloat(mkEl.value) || 0;

  if (totEl.dataset.ovr !== '1') {
    totEl.value = (expense || markup) ? (expense + markup).toFixed(2) : '';
  }
  syncRowBadges(key);
  calcTotal();
}

// Show/hide the • override dots and dim the markup field when markup is off.
function syncRowBadges(key) {
  const { mk: mkId, tot: totId, cb: cbId } = rowIds(key);
  const mkEl  = document.getElementById(mkId);
  const totEl = document.getElementById(totId);
  const mkDot  = document.getElementById(mkId + '-ovr');
  const totDot = document.getElementById(totId + '-ovr');
  if (mkDot)  mkDot.style.display  = (mkEl?.dataset.ovr === '1')  ? 'inline' : 'none';
  if (totDot) totDot.style.display = (totEl?.dataset.ovr === '1') ? 'inline' : 'none';
  const cb = document.getElementById(cbId);
  if (mkEl && cb) mkEl.style.opacity = (cb.checked || mkEl.dataset.ovr === '1') ? '1' : '0.45';
}

// Event handlers wired from the row inputs ───────────────
function onExpenseEdit(key) { calcRow(key); }

function onMarkupEdit(key) {
  const el = document.getElementById(rowIds(key).mk);
  if (el) el.dataset.ovr = '1';
  calcRow(key);
}

function onTotalEdit(key) {
  const el = document.getElementById(rowIds(key).tot);
  if (el) el.dataset.ovr = '1';
  calcRow(key);
}

function onMarkupToggle(key) {
  const el = document.getElementById(rowIds(key).mk);
  if (el) delete el.dataset.ovr;   // toggle takes over from any manual markup
  calcRow(key);
}

function resetRow(key) {
  const { mk, tot } = rowIds(key);
  [mk, tot].forEach(id => { const e = document.getElementById(id); if (e) delete e.dataset.ovr; });
  calcRow(key);
}

// Restore a saved row, inferring the markup toggle + override state from the
// saved numbers so that reopening a work order never silently changes its
// totals. Pass { expense, markup, total }; omit `expense` to keep the value
// already in the field (e.g. labor expense computed from rate × hrs).
function restoreRow(key, saved) {
  saved = saved || {};
  const { exp, mk, tot, cb } = rowIds(key);
  const expEl = document.getElementById(exp);
  const mkEl  = document.getElementById(mk);
  const totEl = document.getElementById(tot);
  const cbEl  = document.getElementById(cb);
  if (!mkEl || !totEl) return;
  if (expEl && saved.expense != null && saved.expense !== '') expEl.value = saved.expense;
  const expense = parseFloat(expEl?.value) || 0;
  const markup  = parseFloat(saved.markup) || 0;
  const total   = (saved.total != null && saved.total !== '')
    ? (parseFloat(saved.total) || 0) : (expense + markup);

  // Toggle reflects whether any markup was charged; an override is flagged
  // only when the markup isn't simply "expense × current %".
  if (cbEl) cbEl.checked = markup > 0;
  const autoMarkup = expense * getMarkupPct();
  if (markup > 0 && Math.abs(markup - autoMarkup) >= 0.005) mkEl.dataset.ovr = '1';
  else delete mkEl.dataset.ovr;
  mkEl.value = (expense || markup) ? markup.toFixed(2) : '';

  if (Math.abs(total - (expense + markup)) >= 0.005) totEl.dataset.ovr = '1';
  else delete totEl.dataset.ovr;
  totEl.value = (expense || markup || total) ? total.toFixed(2) : '';

  syncRowBadges(key);
  calcTotal();
}

// Re-derive every non-overridden row when the global markup % changes.
function recalcAllMarkups() {
  ['sub-head', 'mat-head', 'misc', 'labor1', 'labor2', 'trip', 'compliance'].forEach(calcRow);
  document.querySelectorAll('[id^="sub-row-"]').forEach(r => calcRow('sub-' + r.id.replace('sub-row-', '')));
  document.querySelectorAll('[id^="mat-row-"]').forEach(r => calcRow('mat-' + r.id.replace('mat-row-', '')));
}

// ── Backward-compatible wrappers (called from index.html restore code) ──
function onExpenseChange(prefix)      { calcRow(prefix); }
function onSubHeadExpenseChange()     { calcRow('sub-head'); }
function onMatHeadExpenseChange()     { calcRow('mat-head'); }
function onComplianceExpenseChange()  { calcRow('compliance'); }
function onComplianceMarkupChange()   { onMarkupEdit('compliance'); }
function onLaborMarkupChange(n)       { onMarkupEdit('labor' + n); }
function onTripMarkupChange()         { onMarkupEdit('trip'); }

// Builds the Markup + Total <td> pair for a row (used by dynamic rows;
// static rows in index.html mirror this markup by hand).
function mkCellHtml(key) {
  const { mk, tot, cb } = rowIds(key);
  return (
    '<td class="value-cell"><div class="mk-cell">' +
      '<label class="mk-toggle" title="Charge markup on this line">' +
        '<input type="checkbox" id="' + cb + '" checked onchange="onMarkupToggle(\'' + key + '\')"></label>' +
      '<span class="dollar-prefix">$</span>' +
      '<input type="number" id="' + mk + '" min="0" step="0.01" oninput="onMarkupEdit(\'' + key + '\')">' +
      '<span class="ovr-dot" id="' + mk + '-ovr" title="Manually edited — ↺ to recompute">•</span>' +
    '</div></td>' +
    '<td class="value-cell"><div class="mk-cell">' +
      '<span class="dollar-prefix">$</span>' +
      '<input type="number" id="' + tot + '" min="0" step="0.01" oninput="onTotalEdit(\'' + key + '\')">' +
      '<span class="ovr-dot" id="' + tot + '-ovr" title="Manually edited">•</span>' +
      '<button type="button" class="row-reset" title="Reset line to calculated values" onclick="resetRow(\'' + key + '\')">↺</button>' +
    '</div></td>'
  );
}

// ─────────────────────────────────────────────────────────
// DYNAMIC SUB-CONTRACTOR ROWS
// ─────────────────────────────────────────────────────────
let subRowCount = 0;

function addSubRow(labelVal, expenseVal) {
  const displayNum = document.querySelectorAll('[id^="sub-row-"]').length + 2;
  const n = ++subRowCount;
  const tr = document.createElement('tr');
  tr.id = 'sub-row-' + n;
  tr.innerHTML =
    '<td class="exp-label" style="white-space:nowrap;padding-right:4px;">' +
    '<span style="font-size:0.8rem;color:#555;">Sub-Contractor/Vendor ' + displayNum + '</span>&nbsp;' +
    '<button id="sub-minus-' + n + '" type="button" onclick="removeSubRow(' + n + ')" title="Remove this row" ' +
    'style="background:#fde8e8;border:1px solid #e53935;color:#e53935;border-radius:3px;padding:1px 6px;cursor:pointer;font-size:0.75rem;">−</button></td>' +
    '<td class="value-cell"><input type="text" id="sub-label-' + n + '" placeholder="Sub-contractor name / description" style="width:100%;"></td>' +
    '<td class="value-cell"></td>' +
    '<td class="value-cell"><span class="dollar-prefix">$</span>' +
    '<input type="number" id="sub-expense-' + n + '" min="0" step="1" style="width:calc(100% - 14px);" oninput="onSubExpenseChange(' + n + ')"></td>' +
    mkCellHtml('sub-' + n);
  if (labelVal)   tr.querySelector('#sub-label-'   + n).value = labelVal;
  if (expenseVal) tr.querySelector('#sub-expense-' + n).value = expenseVal;
  const existing = [...document.querySelectorAll('[id^="sub-row-"]')];
  const anchor = existing.length > 0 ? existing[existing.length - 1] : document.getElementById('sub-add-row');
  if (anchor) anchor.insertAdjacentElement('afterend', tr);
  updateSubRowMinus();
  if (expenseVal) calcRow('sub-' + n);
  calcTotal();
}

function updateSubRowMinus() {
  document.querySelectorAll('[id^="sub-row-"]').forEach(tr => {
    const btn = document.getElementById('sub-minus-' + tr.id.replace('sub-row-', ''));
    if (btn) btn.style.visibility = 'visible';
  });
}

function onSubExpenseChange(n) { calcRow('sub-' + n); }

function removeSubRow(idx) {
  const tr = document.getElementById('sub-row-' + idx);
  if (tr) tr.remove();
  calcTotal();
}

function getSubRows() {
  const rows = [];
  rows.push({
    label:   document.getElementById('sub-head-label')?.value?.trim()       || '',
    expense: parseFloat(document.getElementById('sub-head-expense')?.value) || 0,
    markup:  parseFloat(document.getElementById('sub-head-markup')?.value)  || 0,
    total:   parseFloat(document.getElementById('sub-head-total')?.value)   || 0,
  });
  document.querySelectorAll('[id^="sub-row-"]').forEach(tr => {
    const n = tr.id.replace('sub-row-', '');
    rows.push({
      label:   document.getElementById('sub-label-'   + n)?.value?.trim()      || '',
      expense: parseFloat(document.getElementById('sub-expense-' + n)?.value)  || 0,
      markup:  parseFloat(document.getElementById('sub-markup-'  + n)?.value)  || 0,
      total:   parseFloat(document.getElementById('sub-total-'   + n)?.value)  || 0,
    });
  });
  return rows;
}

// ─────────────────────────────────────────────────────────
// DYNAMIC MATERIALS ROWS
// ─────────────────────────────────────────────────────────
let matRowCount = 0;

function addMatRow(descVal, qtyVal, expenseVal) {
  const displayNum = document.querySelectorAll('[id^="mat-row-"]').length + 2;
  const n = ++matRowCount;
  const tr = document.createElement('tr');
  tr.id = 'mat-row-' + n;
  tr.innerHTML =
    '<td class="exp-label" style="white-space:nowrap;padding-right:4px;">' +
    '<span style="font-size:0.8rem;color:#555;">Materials ' + displayNum + '</span>&nbsp;' +
    '<button id="mat-minus-' + n + '" type="button" onclick="removeMatRow(' + n + ')" title="Remove this row" ' +
    'style="background:#fde8e8;border:1px solid #e53935;color:#e53935;border-radius:3px;padding:1px 6px;cursor:pointer;font-size:0.75rem;">−</button></td>' +
    '<td class="value-cell"><input type="text" id="mat-desc-' + n + '" style="width:100%;"></td>' +
    '<td class="value-cell" style="text-align:center;"><input type="number" id="mat-qty-' + n + '" min="0" step="1" style="text-align:center;"></td>' +
    '<td class="value-cell"><span class="dollar-prefix">$</span>' +
    '<input type="number" id="mat-expense-' + n + '" min="0" step="1" style="width:calc(100% - 14px);" oninput="onMatExpenseChange(' + n + ')"></td>' +
    mkCellHtml('mat-' + n);
  if (descVal)    tr.querySelector('#mat-desc-'    + n).value = descVal;
  if (qtyVal)     tr.querySelector('#mat-qty-'     + n).value = qtyVal;
  if (expenseVal) tr.querySelector('#mat-expense-' + n).value = expenseVal;
  const existing = [...document.querySelectorAll('[id^="mat-row-"]')];
  const anchor = existing.length > 0 ? existing[existing.length - 1] : document.getElementById('mat-add-row');
  if (anchor) anchor.insertAdjacentElement('afterend', tr);
  updateMatRowMinus();
  if (expenseVal) calcRow('mat-' + n);
  calcTotal();
}

function updateMatRowMinus() {
  document.querySelectorAll('[id^="mat-row-"]').forEach(tr => {
    const btn = document.getElementById('mat-minus-' + tr.id.replace('mat-row-', ''));
    if (btn) btn.style.visibility = 'visible';
  });
}

function onMatExpenseChange(n) { calcRow('mat-' + n); }

function removeMatRow(idx) {
  const tr = document.getElementById('mat-row-' + idx);
  if (tr) tr.remove();
  calcTotal();
}

function getMatRows() {
  const rows = [];
  rows.push({
    desc:    document.getElementById('mat-head-desc')?.value?.trim()        || '',
    qty:     document.getElementById('mat-head-qty')?.value?.trim()         || '',
    expense: parseFloat(document.getElementById('mat-head-expense')?.value) || 0,
    markup:  parseFloat(document.getElementById('mat-head-markup')?.value)  || 0,
    total:   parseFloat(document.getElementById('mat-head-total')?.value)   || 0,
  });
  document.querySelectorAll('[id^="mat-row-"]').forEach(tr => {
    const n = tr.id.replace('mat-row-', '');
    rows.push({
      desc:    document.getElementById('mat-desc-'    + n)?.value?.trim()     || '',
      qty:     document.getElementById('mat-qty-'     + n)?.value?.trim()     || '',
      expense: parseFloat(document.getElementById('mat-expense-' + n)?.value) || 0,
      markup:  parseFloat(document.getElementById('mat-markup-'  + n)?.value) || 0,
      total:   parseFloat(document.getElementById('mat-total-'   + n)?.value) || 0,
    });
  });
  return rows;
}

// ─────────────────────────────────────────────────────────
// TOTALS
// ─────────────────────────────────────────────────────────
function setGrandTotalStyle(isFixed) {
  const el = document.getElementById('grand-total');
  if (!el) return;
  el.style.color      = isFixed ? '#c0392b' : '';
  el.style.fontWeight = isFixed ? '900'     : '700';
  const lbl = document.getElementById('grand-total-label');
  if (lbl) {
    lbl.textContent    = isFixed ? '★ FIXED RATE =' : 'Total to Invoice =';
    lbl.style.color    = isFixed ? '#c0392b' : '';
    lbl.style.fontWeight = isFixed ? '900' : '';
  }
  const origRow = document.getElementById('original-total-row');
  if (origRow) origRow.style.display = isFixed ? '' : 'none';
}

function calcTotal() {
  const subRows   = getSubRows ? getSubRows() : [];
  const subAmt    = subRows.reduce((s, r) => s + r.total, 0);
  const matRows   = getMatRows ? getMatRows() : [];
  const matAmt    = matRows.reduce((s, r) => s + r.total, 0);
  const labor1Amt = parseFloat(document.getElementById('labor1-total')?.value) || 0;
  const labor2Amt = parseFloat(document.getElementById('labor2-total')?.value) || 0;
  const tripAmt   = parseFloat(document.getElementById('trip-total')?.value)   || 0;
  const miscAmt   = parseFloat(document.getElementById('misc-total')?.value)   || 0;
  const compliAmt = document.getElementById('compliance-cb')?.checked
    ? (parseFloat(document.getElementById('compliance-total')?.value) || 0) : 0;
  const computedSum = subAmt + matAmt + labor1Amt + labor2Amt + tripAmt + miscAmt + compliAmt;
  const origEl = document.getElementById('original-total');
  if (origEl) origEl.value = computedSum.toFixed(2);
  const grandEl = document.getElementById('grand-total');
  const grandDot = document.getElementById('grand-total-ovr');
  if (document.getElementById('flat-rate-cb')?.checked) {
    const flat = parseFloat(document.getElementById('flat-rate-amount')?.value) || 0;
    // flat-rate always wins — clear any manual grand-total override
    if (grandEl) { delete grandEl.dataset.ovr; grandEl.value = flat.toFixed(2); }
    if (grandDot) grandDot.style.display = 'none';
    setGrandTotalStyle(true);
    return;
  }
  setGrandTotalStyle(false);
  if (grandEl && grandEl.dataset.ovr !== '1') grandEl.value = computedSum.toFixed(2);
  if (grandDot) grandDot.style.display = (grandEl?.dataset.ovr === '1') ? 'inline' : 'none';
}

function onGrandTotalEdit() {
  const el = document.getElementById('grand-total');
  if (el) el.dataset.ovr = '1';
  const dot = document.getElementById('grand-total-ovr');
  if (dot) dot.style.display = 'inline';
}

function resetGrandTotal() {
  const el = document.getElementById('grand-total');
  if (el) delete el.dataset.ovr;
  calcTotal();
}

function onTripChange() {
  const cb = document.getElementById('trip-cb');
  if (!cb) return;
  const expEl = document.getElementById('trip-expense');
  if (expEl) expEl.value = cb.checked ? '90.00' : '';
  calcRow('trip');
}

function calcLaborRow(n) {
  const rate  = parseFloat(document.getElementById('labor' + n + '-rate')?.value) || 0;
  const qty   = parseFloat(document.getElementById('labor' + n + '-qty')?.value)  || 0;
  const expEl = document.getElementById('labor' + n + '-expense');
  if (expEl) expEl.value = (rate && qty) ? (rate * qty).toFixed(2) : '';
  calcRow('labor' + n);
}

// ─────────────────────────────────────────────────────────
// API / DRIVE UTILITIES
// (apiFetch, googleFetch, refreshAccessToken live in js/flips-google-fetch.js)
// ─────────────────────────────────────────────────────────

async function findTargetFolder(folderName) {
  try {
    const q = encodeURIComponent(`mimeType="application/vnd.google-apps.folder" and trashed=false`);
    const res = await apiFetch(
      `https://www.googleapis.com/drive/v3/files?q=${q}` +
      `&fields=files(id,name)&includeItemsFromAllDrives=true&supportsAllDrives=true&corpora=allDrives&pageSize=1000`
    );
    if (!res.ok) { console.warn('Folder list failed:', await res.text()); return null; }
    const json = await res.json();
    const folder = json.files?.find(f => f.name.trim().toLowerCase() === folderName.trim().toLowerCase());
    if (!folder) { console.warn(`Folder "${folderName}" not found`); toast(`⚠ Folder "${folderName}" not found`); return null; }
    console.log(`✓ Found folder "${folder.name}" id=${folder.id}`);
    return folder.id;
  } catch(e) {
    console.warn('findTargetFolder error:', e.message);
    return null;
  }
}

// Upload a file to Drive (create or overwrite).
// content: plain string for JSON/text, base64 string for binary (set isBase64=true)
// existingFileId: pass to update an existing file in-place
async function driveUploadFile(name, mimeType, content, folderId, existingFileId, isBase64 = false) {
  const boundary = '-------flips314159265';
  const metaObj  = { mimeType };
  if (name) metaObj.name = name;
  if (!existingFileId && folderId) metaObj.parents = [folderId];
  const metadata = JSON.stringify(metaObj);
  const xferLine = isBase64 ? '\r\nContent-Transfer-Encoding: base64' : '';
  const body = [
    `--${boundary}`,
    'Content-Type: application/json; charset=UTF-8',
    '',
    metadata,
    `--${boundary}`,
    `Content-Type: ${mimeType}${xferLine}`,
    '',
    content,
    `--${boundary}--`
  ].join('\r\n');

  const url = existingFileId
    ? `https://www.googleapis.com/upload/drive/v3/files/${existingFileId}?uploadType=multipart&supportsAllDrives=true`
    : `https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name&supportsAllDrives=true`;

  const res = await fetch(url, {
    method: existingFileId ? 'PATCH' : 'POST',
    headers: {
      'Authorization': 'Bearer ' + accessToken,
      'Content-Type': `multipart/related; boundary="${boundary}"`
    },
    body
  });
  if (!res.ok) {
    const errText = await res.text().catch(() => 'unknown');
    throw new Error(`Drive upload failed (${res.status}): ${errText.substring(0, 200)}`);
  }
  return await res.json();
}

// ─────────────────────────────────────────────────────────
// UTILITIES
// ─────────────────────────────────────────────────────────
function todayMT() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Denver' });
}

function fmtDate(val) {
  if (!val) return '';
  const d = new Date(val + 'T12:00:00');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function setStatus(id, msg, cls) {
  const el = document.getElementById(id);
  if (!el) return;
  if (id === 'conn-status') {
    el.textContent = cls === 'ok' ? '✓ Google connected' : msg;
    el.className = 'conn-status-pill ' + (cls === 'ok' ? 'ok' : cls === 'err' ? 'err' : 'warn');
    if (cls === 'ok') {
      const drawer = document.getElementById('conn-drawer');
      if (drawer) drawer.classList.remove('open');
    }
  } else {
    el.textContent = msg; el.className = cls;
  }
}

function toggleDrawer() {
  const drawer = document.getElementById('conn-drawer');
  if (drawer) drawer.classList.toggle('open');
}

let _toastTimer = null;
function toast(msg) {
  const el = document.getElementById('toast');
  if (!el) return;
  el.textContent = msg;
  el.classList.add('show');
  if (_toastTimer) clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => { el.classList.remove('show'); _toastTimer = null; }, 3000);
}
