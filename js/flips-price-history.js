// ─────────────────────────────────────────────────────────
// FLIPS PRICE HISTORY — "what have we charged for this before?"
//
// Data lives in a 'Price History' tab of the WR sheet (WR_SHEET_ID), one row
// per work order, upserted (keyed on Work Log line #) every time a WO is
// saved from index.html. index.html renders an advisory panel from it when a
// property + service checkboxes are selected. Plain math only — no Claude.
//
// Columns A–N:
//   A Date (ISO, date completed) · B Line # (upsert key) · C Property ·
//   D FLPS Acct # · E Billing Email (lowercased — the "group" key; LCP
//   properties share one) · F Management Co · G Services (' | '-joined
//   checkbox values) · H Svc Count · I Total (plain number) · J Fixed Rate ·
//   K Source (live | backfill | qb-reconciled) · L QB Invoice # ·
//   M QB Amount · N Updated (ISO timestamp)
//
// The pure functions up top are dual-exported and unit-tested in
// tests/price-history.test.js. Browser-only code (Sheets I/O + panel) is
// below the export tail and resolves apiFetch / WR_SHEET_ID at call time.
// ─────────────────────────────────────────────────────────

// Services with a repeatable market rate. Everything else (Deficiency
// Correction, Repair / Service Call, New Installation, Monitoring Setup /
// Change, Sub-Contractor Work, Walk-Through / Consultation, Other) is a
// one-off: shown for reference but excluded from every average.
// Keep in sync with INSPECTION_SVC_PREFIXES in index.html.
const PH_RATEABLE_PREFIXES = [
  'Fire Alarm', 'Sprinkler', 'Extinguisher', 'Exit Light',
  'Hood Inspection', 'Fire Pump Inspection', 'Jockey Pump Inspection',
  '5-Year Internal Pipe', '5-Year FDC', '3-Year Dry Pipe', 'Annual Backflow'
];

function phIsRateable(svc) {
  return PH_RATEABLE_PREFIXES.some(p => (svc || '').startsWith(p));
}

// Every canonical service checkbox value on index.html (en-dash included).
// price-history-backfill.html searches legacy WO doc text for these exact
// strings. Keep in sync with the `input[name="svc"]` values in index.html.
const PH_ALL_SERVICES = [
  'Fire Alarm – Annual', 'Fire Alarm – Semi Annual', 'Fire Alarm – Quarterly', 'Fire Alarm – Monthly',
  'Sprinkler – Annual', 'Sprinkler – Semi Annual', 'Sprinkler – Quarterly', 'Sprinkler – Monthly',
  'Extinguisher – Annual', 'Extinguisher – Semi Annual', 'Extinguisher – Quarterly', 'Extinguisher – Monthly',
  'Exit Light – Annual', 'Exit Light – Semi Annual', 'Exit Light – Quarterly', 'Exit Light – Monthly',
  'Hood Inspection – Annual', 'Hood Inspection – Semi Annual',
  'Fire Pump Inspection – Annual', 'Fire Pump Inspection – Semi Annual', 'Fire Pump Inspection – Quarterly', 'Fire Pump Inspection – Monthly',
  'Jockey Pump Inspection – Annual', 'Jockey Pump Inspection – Semi Annual', 'Jockey Pump Inspection – Quarterly', 'Jockey Pump Inspection – Monthly',
  '5-Year Internal Pipe Inspection', '5-Year FDC Hydrostatic Test', '3-Year Dry Pipe Test', 'Annual Backflow Prevention Test',
  'Deficiency Correction', 'Repair / Service Call', 'New Installation',
  'Monitoring Setup / Change', 'Sub-Contractor Work', 'Walk-Through / Consultation',
];

// Order-insensitive key for a service combo, so "Sprinkler + Fire Alarm"
// matches a past WO saved as "Fire Alarm + Sprinkler".
function phComboKey(services) {
  return (services || []).map(s => (s || '').trim()).filter(Boolean).sort().join('|');
}

function phParseAmount(v) {
  if (typeof v === 'number') return isFinite(v) ? v : null;
  const n = parseFloat(String(v || '').replace(/[^0-9.\-]/g, ''));
  return isFinite(n) ? n : null;
}

function phAvg(nums) {
  return nums.length ? nums.reduce((s, n) => s + n, 0) / nums.length : null;
}

function phMedian(nums) {
  if (!nums.length) return null;
  const s = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

// Truncate a string so its UTF-8 byte length fits maxBytes (Drive
// appProperties cap key+value at 124 bytes). Appends '…' when cut.
function phTruncateBytes(str, maxBytes) {
  const s = str || '';
  const bytes = t => new TextEncoder().encode(t).length;
  if (bytes(s) <= maxBytes) return s;
  let out = s;
  while (out.length && bytes(out + '…') > maxBytes) out = out.slice(0, -1);
  return out + '…';
}

// One sheet row (array of cell strings, A–N) → row object.
function phParseRowValues(vals, rowNum) {
  const c = i => ((vals || [])[i] || '').toString().trim();
  return {
    rowNum:       rowNum || null,
    date:         c(0),
    lineNum:      c(1),
    property:     c(2),
    acctNum:      c(3),
    billingEmail: c(4).toLowerCase(),
    mgmtCo:       c(5),
    services:     c(6).split('|').map(s => s.trim()).filter(Boolean),
    total:        phParseAmount(c(8)) || 0,
    fixedRate:    c(9) === 'Yes',
    source:       c(10) || 'live',
    qbInvoice:    c(11),
    qbAmount:     phParseAmount(c(12)),
  };
}

// Core aggregation. rows = parsed row objects; ctx = { services, acctNum,
// billingEmail, propertyName } from the current form state.
//
// Per selected service:
//   property — up to 3 most recent charges at THIS property
//   group    — { n, avg, median } across the billing-email group (rateable only)
//   all      — { n, avg, median } across every property (rateable only)
//   groupRecent — for one-off services: recent examples in the group, no math
// Only single-service WOs feed per-service numbers — a bundled total is not
// one service's price. Bundles surface via `combo`: past WOs whose exact
// service combo matches the current selection (same property sorted first).
function phComputeStats(rows, ctx) {
  const services = (ctx.services || []).map(s => (s || '').trim()).filter(Boolean);
  const acct  = (ctx.acctNum || '').trim();
  const email = (ctx.billingEmail || '').trim().toLowerCase();
  const prop  = (ctx.propertyName || '').trim().toLowerCase();

  const usable = (rows || []).filter(r => r && r.total > 0 && r.services && r.services.length);
  const isProp = r => (acct && r.acctNum && r.acctNum === acct)
                   || (prop && (r.property || '').toLowerCase() === prop);
  const isGroup = r => !!email && r.billingEmail === email;
  const sortDesc = arr => [...arr].sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  const agg = arr => arr.length
    ? {
        n: arr.length,
        avg: phAvg(arr.map(r => r.total)),
        median: phMedian(arr.map(r => r.total)),
        props: new Set(arr.map(r => r.acctNum || (r.property || '').toLowerCase())).size,
      }
    : null;

  const perService = services.map(name => {
    const singles  = usable.filter(r => r.services.length === 1 && r.services[0] === name);
    const propRows = sortDesc(singles.filter(isProp));
    const grpRows  = singles.filter(isGroup);
    const rateable = phIsRateable(name);
    return {
      name,
      rateable,
      property:    propRows.slice(0, 3),
      group:       rateable ? agg(grpRows) : null,
      all:         rateable ? agg(singles) : null,
      groupRecent: rateable ? [] : sortDesc(grpRows).slice(0, 3),
    };
  });

  let combo = null;
  if (services.length >= 2) {
    const key = phComboKey(services);
    const matches = usable.filter(r => r.services.length >= 2 && phComboKey(r.services) === key);
    if (matches.length) {
      const sorted = [...matches].sort((a, b) => {
        const ap = isProp(a) ? 0 : 1, bp = isProp(b) ? 0 : 1;
        return ap - bp || (b.date || '').localeCompare(a.date || '');
      });
      combo = { key, entries: sorted.slice(0, 3), n: matches.length };
    }
  }

  return { services: perService, combo };
}

// Dual-environment export: CommonJS for Node tests, global for the browser.
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    PH_RATEABLE_PREFIXES, PH_ALL_SERVICES, phIsRateable, phComboKey, phParseAmount,
    phAvg, phMedian, phTruncateBytes, phParseRowValues, phComputeStats,
  };
}

// ─────────────────────────────────────────────────────────
// Browser-only from here down (Sheets I/O + panel). Depends on apiFetch +
// WR_SHEET_ID from the page's script scope, resolved at call time.
// ─────────────────────────────────────────────────────────

const PRICE_HISTORY_TAB = 'Price History';
const PH_HEADERS = ['Date', 'Line #', 'Property', 'FLPS Acct #', 'Billing Email',
  'Management Co', 'Services', 'Svc Count', 'Total', 'Fixed Rate', 'Source',
  'QB Invoice #', 'QB Amount', 'Updated'];
const PH_CACHE_KEY = 'flips_price_hist_cache';
const PH_CACHE_TTL = 30 * 60 * 1000;

let _phTabKnown = false;

async function ensurePriceHistoryTab() {
  if (_phTabKnown) return;
  const res = await apiFetch(`https://sheets.googleapis.com/v4/spreadsheets/${WR_SHEET_ID}?fields=sheets.properties`);
  if (!res.ok) throw new Error('sheet meta HTTP ' + res.status);
  const meta = await res.json();
  const exists = (meta.sheets || []).some(s => s.properties?.title === PRICE_HISTORY_TAB);
  if (!exists) {
    const add = await apiFetch(`https://sheets.googleapis.com/v4/spreadsheets/${WR_SHEET_ID}:batchUpdate`, 'POST', {
      requests: [{ addSheet: { properties: { title: PRICE_HISTORY_TAB, gridProperties: { frozenRowCount: 1 } } } }]
    });
    if (!add.ok) throw new Error('addSheet HTTP ' + add.status);
    await apiFetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${WR_SHEET_ID}/values/${encodeURIComponent(PRICE_HISTORY_TAB + '!A1:N1')}?valueInputOption=RAW`,
      'PUT', { values: [PH_HEADERS] }
    );
  }
  _phTabKnown = true;
}

// All history rows, parsed. Session-cached 30 min; force=true bypasses.
// A missing tab (never written yet) reads as an empty list.
async function loadPriceHistoryRows(force) {
  if (!force) {
    try {
      const c = JSON.parse(sessionStorage.getItem(PH_CACHE_KEY) || 'null');
      if (c && Date.now() - c.ts < PH_CACHE_TTL) {
        return c.values.map((v, i) => phParseRowValues(v, i + 2));
      }
    } catch (_) {}
  }
  const res = await apiFetch(`https://sheets.googleapis.com/v4/spreadsheets/${WR_SHEET_ID}/values/${encodeURIComponent(PRICE_HISTORY_TAB + '!A2:N')}`);
  if (!res.ok) {
    if (res.status === 400) return [];   // tab doesn't exist yet
    throw new Error('price history HTTP ' + res.status);
  }
  const { values = [] } = await res.json();
  try { sessionStorage.setItem(PH_CACHE_KEY, JSON.stringify({ ts: Date.now(), values })); } catch (_) {}
  return values.map((v, i) => phParseRowValues(v, i + 2));
}

// Upsert one row from a collectForm() data object, keyed on Work Log line #
// so edit re-saves update in place instead of double-counting. QB columns
// (K–M) survive a re-save once create-invoices has reconciled the row.
async function upsertPriceHistoryFromWO(data) {
  const total    = phParseAmount(data['TOTAL TO INVOICE']);
  const services = (data['SERVICES'] || '').split('\n')
    .map(s => s.trim()).filter(s => s && s !== '(none selected)');
  const lineNum  = (data['LINE #'] || '').trim();
  if (!lineNum || !services.length || !(total > 0)) return;

  await ensurePriceHistoryTab();
  const rows = await loadPriceHistoryRows(true);
  const existing = rows.find(r => r.lineNum === lineNum);
  const keepQB = existing && existing.source === 'qb-reconciled';

  const rowVals = [
    data['DATE COMPLETED ISO'] || '',
    lineNum,
    data['PROPERTY NAME'] || '',
    data['FLPS ACCT #'] || '',
    (data['BILLING EMAIL'] || '').trim().toLowerCase(),
    data['CLIENT / COMPANY'] || '',
    services.join(' | '),
    String(services.length),
    String(total),
    data['FLAT RATE'] === 'Yes' ? 'Yes' : 'No',
    keepQB ? 'qb-reconciled' : 'live',
    keepQB ? existing.qbInvoice : '',
    keepQB && existing.qbAmount != null ? String(existing.qbAmount) : '',
    new Date().toISOString(),
  ];

  if (existing) {
    const range = `${PRICE_HISTORY_TAB}!A${existing.rowNum}:N${existing.rowNum}`;
    await apiFetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${WR_SHEET_ID}/values/${encodeURIComponent(range)}?valueInputOption=RAW`,
      'PUT', { values: [rowVals] }
    );
  } else {
    await apiFetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${WR_SHEET_ID}/values/${encodeURIComponent(PRICE_HISTORY_TAB + '!A1:N1')}:append?valueInputOption=RAW`,
      'POST', { values: [rowVals] }
    );
  }
  try { sessionStorage.removeItem(PH_CACHE_KEY); } catch (_) {}
}

// ─── Advisory panel (index.html) ─────────────────────────
// Renders into #price-history-panel when a property + ≥1 service are picked.
// Silent (hidden) whenever there's nothing useful to show.

let _phTimer = null;
let _phSeq = 0;

function schedulePricePanel() {
  clearTimeout(_phTimer);
  _phTimer = setTimeout(() => { refreshPricePanel().catch(e => console.warn('[PriceHist]', e.message)); }, 350);
}

async function refreshPricePanel() {
  const panel = document.getElementById('price-history-panel');
  if (!panel) return;
  const hide = () => { panel.style.display = 'none'; panel.innerHTML = ''; };

  const propName = document.getElementById('property-select')?.value || '';
  const services = [...document.querySelectorAll('input[name="svc"]:checked')]
    .map(c => c.value).filter(Boolean);
  if (!propName || !services.length || typeof accessToken === 'undefined' || !accessToken) return hide();

  const seq = ++_phSeq;
  const rows = await loadPriceHistoryRows();
  if (seq !== _phSeq) return;                    // selection changed mid-load
  if (!rows.length) return hide();

  const ctx = {
    services,
    propertyName: propName,
    acctNum:      document.getElementById('flps-acct-num')?.value || '',
    billingEmail: document.getElementById('billing-email')?.value || '',
  };
  const stats = phComputeStats(rows, ctx);
  const hasAnything = stats.combo || stats.services.some(s =>
    s.property.length || s.group || s.all || s.groupRecent.length);
  if (!hasAnything) return hide();

  panel.innerHTML = phPanelHTML(stats, {
    mgmtCo:       document.getElementById('client-company')?.value || '',
    billingEmail: ctx.billingEmail,
  });
  panel.style.display = 'block';
}

function phEsc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g,
    c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function phFmtMoney(n) {
  if (n == null) return '—';
  const opts = Math.abs(n % 1) > 0.004
    ? { minimumFractionDigits: 2, maximumFractionDigits: 2 }
    : { maximumFractionDigits: 0 };
  return '$' + n.toLocaleString('en-US', opts);
}

function phFmtMonth(iso) {
  const m = /^(\d{4})-(\d{2})/.exec(iso || '');
  if (!m) return '';
  const names = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return (names[parseInt(m[2], 10) - 1] || '') + ' ' + m[1];
}

const PH_BADGES = {
  'qb-reconciled': ['✓', 'Amount confirmed against the QuickBooks invoice'],
  'live':          ['○', 'From the saved work order (not yet invoiced in QB)'],
  'backfill':      ['~', 'Estimated — parsed from an older work order document'],
};

function phEntryHTML(e) {
  const [sym, tip] = PH_BADGES[e.source] || PH_BADGES.live;
  const when = phFmtMonth(e.date);
  const wo = e.lineNum
    ? ` · <a href="worklog.html?row=${encodeURIComponent(e.lineNum)}" target="_blank" style="color:#2e6da4;">WO #${phEsc(e.lineNum)}</a>`
    : '';
  return `<b>${phFmtMoney(e.total)}</b>${when ? ' · ' + when : ''}${wo}` +
         ` <span title="${phEsc(tip)}" style="cursor:help;color:#888;">${sym}</span>`;
}

// Aggregate line, e.g. "avg $430 · median $425 (n=6 · 4 properties)".
// `who` describes the population for the tooltip on the (n=…) part.
function phAggHTML(a, who) {
  if (!a) return '<span style="color:#999;">no history</span>';
  let s = `avg <b>${phFmtMoney(a.avg)}</b>`;
  if (a.n >= 3 && Math.abs(a.median - a.avg) >= 1) s += ` · median ${phFmtMoney(a.median)}`;
  const tip = `Averaged from ${a.n} past work order${a.n === 1 ? '' : 's'} for this service ${who}` +
    (a.props > 1 ? `, across ${a.props} different properties` : '') +
    '. Only single-service work orders count — bundled and one-off jobs are excluded.';
  const nLabel = `n=${a.n}` + (a.props > 1 ? ` · ${a.props} properties` : '');
  return s + ` <span title="${phEsc(tip)}" style="cursor:help;color:#888;border-bottom:1px dotted #bbb;">(${nLabel})</span>`;
}

function phPanelHTML(stats, info) {
  const row = (label, html, labelTip) =>
    `<div style="display:flex;gap:8px;padding:1px 0;"><span style="min-width:110px;color:#555;${labelTip ? 'cursor:help;' : ''}"${labelTip ? ` title="${phEsc(labelTip)}"` : ''}>${label}</span><span>${html}</span></div>`;

  const mgmtCo = (info && info.mgmtCo) || '';
  const email  = ((info && info.billingEmail) || '').trim().toLowerCase();
  const groupTip = 'All properties that share this billing email' + (email ? ': ' + email : '');
  const groupWho = mgmtCo
    ? `<span style="color:#666;" title="${phEsc(groupTip)}">${phEsc(mgmtCo)}</span> · `
    : '';

  const blocks = stats.services.map(s => {
    let body;
    if (!s.rateable) {
      const recent = s.property.length ? s.property : s.groupRecent;
      body = recent.length
        ? row('Past one-offs', recent.map(phEntryHTML).join(' &nbsp;·&nbsp; ')) +
          `<div style="color:#999;font-size:8pt;padding-left:118px;">one-off work — shown for reference, not averaged</div>`
        : `<div style="color:#999;padding-left:8px;">no pricing history</div>`;
    } else {
      body =
        row('This property', s.property.length ? s.property.map(phEntryHTML).join(' &nbsp;·&nbsp; ') : '<span style="color:#999;">no history here</span>') +
        row('Billing group', (s.group ? groupWho : '') + phAggHTML(s.group, 'in this billing group'), groupTip) +
        row('All properties', phAggHTML(s.all, 'across all our properties'), 'Every property in the price history, all clients');
    }
    return `<div style="margin:6px 0 2px;"><div style="font-weight:700;color:#2e6da4;">${phEsc(s.name)}</div>${body}</div>`;
  }).join('');

  const comboHtml = stats.combo
    ? `<div style="margin:8px 0 2px;border-top:1px dashed #ccc;padding-top:6px;">
         <div style="font-weight:700;color:#2e6da4;">This exact combo billed before</div>
         ${row('Past totals', stats.combo.entries.map(e =>
            phEntryHTML(e) + ` <span style="color:#888;">(${phEsc(e.property)})</span>`).join(' &nbsp;·&nbsp; '))}
       </div>`
    : '';

  return `<div style="border:1px solid #c9d8e8;background:#f6f9fc;border-radius:6px;padding:8px 12px;margin:8px 0;font-size:9pt;">
    <div style="font-weight:700;margin-bottom:2px;">💰 What we have charged in the past
      <span style="font-weight:400;color:#888;font-size:8pt;">— advisory, from past work orders${'&nbsp;'}(✓ QB-confirmed · ○ work order · ~ estimated)</span>
    </div>
    ${blocks}${comboHtml}
  </div>`;
}
