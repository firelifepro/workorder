// ─────────────────────────────────────────────────────────
// FLIPS SHARED NAV — single source of truth for the hamburger menu.
//
// Every page keeps its hardcoded <div id="nav-menu"> markup as a no-JS
// fallback; this script overwrites its contents at DOMContentLoaded (the
// menu is closed/hidden at that point, so there's no flash). To change the
// menu, edit FLIPS_NAV_SECTIONS here — nowhere else.
//
// Admin gate — SOFT gate only. It hides links and bounces non-admins off
// admin.html, but these are static files: anyone with a URL can load the
// HTML. Real protection is (and remains) Google Sheets/Drive/Gmail
// permissions and the QB OAuth. The gate passes when EITHER:
//   • the signed-in Google email is in FLIPS_ADMIN_EMAILS — read from
//     localStorage.flips_user_email, populated via Drive about.get whenever
//     the stored token carries a Drive scope; OR
//   • a QuickBooks access/refresh token exists in localStorage — only
//     office staff can complete the Intuit OAuth, so possession ≈ staff.
// ─────────────────────────────────────────────────────────

const FLIPS_ADMIN_EMAILS = [
  'alan.antonio@firelifeprotectionsystems.com',
  'amy.lineberry@firelifeprotectionsystems.com',
  'cole.lineberry@gmail.com',
];

const FLIPS_NAV_ICON_SHEETS = '<img src="img/sheets.svg" style="width:14px;height:14px;vertical-align:middle;margin-right:4px;">';
const FLIPS_NAV_ICON_QB     = '<img src="img/quickbooks.svg" style="width:14px;height:14px;vertical-align:middle;margin-right:4px;">';

const FLIPS_NAV_SECTIONS = [
  { label: 'Field Technicians', items: [
    ['index.html',               '⏰ Work Order'],
    ['workorder-tracker.html',   '🗄️ Work Order Tracker'],
    ['worklog.html',             FLIPS_NAV_ICON_SHEETS + ' Work Log (the Drive)'],
    ['schedule.html',            '📅 Inspection Schedule'],
    ['inspection.html',          '🔥 Fire Inspection'],
    ['hospital-inspection.html', '🏥 Hospital Inspection'],
    ['estimate.html',            '🎯 Estimate'],
    ['estimate-tracker.html',    '📈 Estimate Tracker'],
  ]},
  { label: 'Office', items: [
    ['clients.html',             '👥 Client Management'],
    ['create-invoices.html',     FLIPS_NAV_ICON_QB + ' Create QB Invoices'],
    ['open-invoices.html',       '💰 Record Payments'],
    ['inspection-audit.html',    '📋 Inspection Reports Audit'],
    ['triage.html',              '📬 Inbox Triage'],
  ]},
];

// Pages reachable only through admin.html; the "⚙ Admin Tools" link is
// highlighted while you're on any of them.
const FLIPS_ADMIN_TOOL_PAGES = [
  'admin.html', 'price-history-backfill.html', 'legacy-cleanup.html',
  'import-reports.html', 'import-inspectpoint.html', 'sub-invoices.html',
  'real-estate-agent.html',
];

async function flipsIsAdmin() {
  // 1) Google email allowlist (cached once per browser).
  let email = (localStorage.getItem('flips_user_email') || '').toLowerCase();
  if (!email) {
    try {
      const token = localStorage.getItem('flips_access_token');
      const expiry = Number(localStorage.getItem('flips_token_expiry')) || 0;
      if (token && Date.now() < expiry) {
        const res = await fetch('https://www.googleapis.com/drive/v3/about?fields=user(emailAddress)', {
          headers: { Authorization: 'Bearer ' + token },
        });
        if (res.ok) {
          email = (((await res.json()).user || {}).emailAddress || '').toLowerCase();
          if (email) localStorage.setItem('flips_user_email', email);
        }
      }
    } catch (_) { /* sheets-only token or offline — fall through to QB check */ }
  }
  if (email && FLIPS_ADMIN_EMAILS.includes(email)) return true;

  // 2) QuickBooks-token fallback (per-device evidence of office staff).
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (/^qb_(access|refresh)_token/.test(k) && localStorage.getItem(k)) return true;
  }
  return false;
}

(function () {
  function render() {
    const menu = document.getElementById('nav-menu');
    if (!menu) return;
    const here = (location.pathname.split('/').pop() || 'index.html').toLowerCase();
    const link = ([href, label]) =>
      `<a href="${href}"${href === here ? ' class="active"' : ''}>${label}</a>`;

    menu.innerHTML = FLIPS_NAV_SECTIONS.map((sec, i) =>
      (i > 0 ? '<div class="nav-divider"></div>' : '') +
      `<div class="nav-section-label">${sec.label}</div>` +
      sec.items.map(link).join('')
    ).join('');

    flipsIsAdmin().then(ok => {
      if (!ok) return;
      const active = FLIPS_ADMIN_TOOL_PAGES.includes(here) ? ' class="active"' : '';
      menu.insertAdjacentHTML('beforeend',
        '<div class="nav-divider"></div>' +
        '<div class="nav-section-label">Admin</div>' +
        `<a href="admin.html"${active}>⚙ Admin Tools</a>`);
    }).catch(() => {});
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', render);
  else render();
})();
