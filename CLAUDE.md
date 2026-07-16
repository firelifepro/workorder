# FLIPS — Fire Life Protection Systems Field App

## What this is
Plain HTML/JS field service management app for a commercial fire inspection company. No build step, no framework. Hosted on Cloudflare Workers at `https://workorder.firelifepro.workers.dev/`.

## Deploy
```bash
npx wrangler deploy
```
Deploys the entire directory as static assets plus the `_worker.js` API routes. Files listed in `.assetsignore` are excluded from the public deploy (e.g. `_worker.js`, `CLAUDE.md`, `README.md`, abandoned test files). Cloudflare caches aggressively — users may need to hard-refresh (Cmd+Shift+R) after a deploy if they have the page open.

## Testing & linting
Node is installed via Homebrew (`/opt/homebrew/bin/node`). Even though the app has no build step, there's a small Node-based safety net — **run it before every deploy**:
```bash
npm run lint    # node --check (syntax-only) on every file in js/ and tests/
npm test        # runs tests/run.js — the unit suite
npm run check   # lint + test together
```
- **`lint`** catches syntax errors (unbalanced braces, broken template literals, stray chars) that would otherwise silently break a whole `<script>` at runtime with no build to catch them. It does NOT check logic, runtime, or DOM/undefined-variable errors — it's a cheap first gate, not ESLint.
- **Test pattern**: `tests/run.js` defines global `test()`/`assert` and auto-runs every `tests/*.test.js`. Tests load source one of two ways: (a) `require()` a module that has a CommonJS export tail (e.g. `js/inspection-pdf-layout.js`), or (b) `tests/helpers.js` runs a browser-coupled source file inside a `vm` context with DOM/`sessionStorage` stubs (`loadShared`, `loadHistory`). A few helpers (`scoreMatch`, `matchProperty`) are hand-copied into `helpers.js` with a "keep in sync" comment — update both if you change the source.
- **What can't be unit-tested**: anything that reads the live DOM or renders a PDF. To make PDF/layout logic testable, extract the pure math into a dual-export module (see `js/inspection-pdf-layout.js`) and inject browser dependencies (fonts, etc.) as callbacks. Visual output still needs a real **👁 Preview PDF** in the browser.

---

## Files

| File | Purpose |
|---|---|
| `index.html` | Work order creation — the main form |
| `schedule.html` | Inspection schedule tracker (next-due dates, overdue alerts). Also shows an advisory **Last Billed** column per row (loads `js/flips-price-history.js`; `TYPE_TO_SVC` maps schedule type+freq back to the canonical service value — inverse of `SVC_MAP` in index.html, keep in sync). Hidden in print. |
| `estimate.html` | Estimate builder — PDF + Drive + Gmail draft |
| `estimate-tracker.html` | List/manage estimates, convert to work order |
| `clients.html` | Client list + QuickBooks reconciliation |
| `create-invoices.html` | Create QB invoices from Drive work order PDFs |
| `inspection.html` | iPad fire inspection report (4-step wizard, PDF) |
| `hospital-inspection.html` | Variant inspection form for hospital properties |
| `worklog.html` | Work log / time tracking |
| `workorder-tracker.html` | Work Order Tracker — browse/manage saved WOs in Drive. No QB needed (usable by non-QB staff); listed in the Field section of the nav. |
| `sub-invoices.html` | Subcontractor invoice inbox — pulls PDF attachments from Gmail, parses with Claude API, fuzzy-matches to work log rows, writes to Sub Invoices tab in WR sheet |
| `open-invoices.html` | Open invoices dashboard — lists all unpaid QB invoices with aging, records payments (creates QB Payment txn), optionally marks matching Work Log row paid |
| `triage.html` | Inbox triage — pulls recent emails from Gmail, classifies each via Claude (estimate request / scheduling / complaint / AHJ violation / payment / sub invoice / vendor / newsletter / other), fuzzy-matches mentioned property to the property list, groups by category for quick action. Read-only on Gmail; cache lives in `localStorage.flips_triage_v1` keyed by Gmail message ID. |
| `inspection-audit.html` | Inspection-report audit — joins client master + Inspection History sheet + the **FLPS Inspection Reports** Drive folder. Groups buildings by Property Manager or Billing (LCP highlighted), matches each inspection record to its report PDF(s) **by canonical system** (see `SYS_DEFS`), flags missing/unrecorded reports, and composes a per-group **Gmail draft with the report PDFs attached** (splits per-building if over ~22 MB). For **missing** rows it cross-references the **Work Log** (`WR_SHEET_ID`, first tab) — fuzzy-matches property + system + date and shows the likely **Work Log line # (deep-linked)** and the invoice it was billed under (col H), to help locate the report. Also reads the schedule's WO# from the history Notes (`woNumFromNotes`). Read-only Sheets/Drive + `gmail.compose`. Cache key `flips_audit_cache_vN` — bump N when the cached data shape or matching changes. |
| `import-reports.html` | Import External Reports — searches Gmail for outside-vendor inspection reports (Convergint, Martinez Fire), reads each PDF with Claude (classify report-vs-invoice + extract property/system/date), and on confirm uploads to the FLPS Inspection Reports folder named `EXT_{vendor}_{system}_{property}_{date}.pdf` so the audit picks them up. Scopes: `gmail.modify` (read + label) + `drive` + `spreadsheets.readonly`. Tags handled emails with the Gmail label `Inspect_Rpt_Imported` (default query excludes it). Per-attachment imported ledger in `localStorage.flips_import_done_v1`; parsed cache in `flips_import_reports_v1`. Claude auto-read is toggleable (`flips_import_use_claude`). |
| `import-inspectpoint.html` | Import Inspect Point Reports — sibling of `import-reports.html` for Martinez Fire **invoice notification emails from `noreply@inspectpoint.com`**, where the inspection report is NOT an attachment but lives behind the email's "Click here to view your invoice" link. Per email: extracts the `…inspectpoint.com/invoices/view_report?token=<uuid>` link from the HTML body, fetches that viewer page **through the Worker proxy `/api/fetch-report`** (CORS — can't fetch inspectpoint/cloudfront from the browser), parses out the **report** PDF link(s) (`<a class="list__attachment">`, NOT the `#download-invoice` button), proxy-downloads the public CloudFront PDF, Claude-reads it for property/system/date, and on confirm uploads to the FLPS Inspection Reports folder named `EXT_{system}_{freq}_Martinez_{property}_{date}.pdf` (same convention as `import-reports.html`, so the audit picks it up). Dedups identical reports across reminder emails by the CloudFront content-hash basename (`pdfId`); labels all source emails `InspectPoint_Imported` (default query excludes it). Scopes: `gmail.modify` + `drive` + `spreadsheets.readonly`. Imported ledger `localStorage.flips_ip_done_v1`; parsed cache `flips_ip_reports_v1`; shares the `flips_import_use_claude` auto-read toggle. |
| `price-history-backfill.html` | One-time backfill for the **Price History** tab — scans the two WO Drive folders ("2 - Ready to Invoice", "3 - Invoice Sent"; the only places WOs live), groups files by Work Log line #, and parses each WO from the best source: JSON file (full form dict) > Google Doc text (services found by literal search for the canonical checkbox strings via `PH_ALL_SERVICES`) > PDF appProperties (flagged "⚠ may be incomplete" + default-unchecked, since pre-2026-07 saves stored only the first service). Skips line #s already in the tab, so re-running is safe; review table before a bulk append with `source=backfill`. Scopes: `spreadsheets` + `drive.readonly`. No Claude. |
| `legacy-cleanup.html` | One-time tool to rename a folder of inconsistently-named legacy inspection PDFs (hand-saved by a prior staffer). Lists a Drive folder, guesses property/type/freq/date from the filename (+ optional Claude **page-1** read via pdf-lib to save tokens), and **renames each file in place** to `FLPS_{type}_{freq}_{property}_{date}.pdf`. Skips files already named `FLPS_`. Adds types the schedule doesn't track yet (Hydrant, Deficiency, Correction Notice). Renames in place in the Legacy subfolder; the audit reads subfolders so they appear. Scopes: `drive` + `spreadsheets.readonly`. |
| `admin.html` | **Admin Tools hub** — gated launcher (card grid) for the staff-only one-off tools: Price History Backfill, Legacy Cleanup, Import External Reports, Import Inspect Point, Sub Invoices, Inbox Triage, Potential Lease or Buy (`real-estate-agent.html`). Those pages are NOT in the shared nav; this hub is their only menu entry. Gate = `flipsIsAdmin()` (see `js/flips-nav.js`); non-admins are `location.replace`d to index.html. |
| `js/flips-nav.js` | **Shared hamburger nav** — single source of truth (`FLIPS_NAV_SECTIONS`). Loaded (`defer`) in the `<head>` of every page; overwrites `#nav-menu` innerHTML at DOMContentLoaded (each page's hardcoded menu remains as a no-JS fallback). Also owns the **soft admin gate** `flipsIsAdmin()`: passes when the signed-in Google email (cached `localStorage.flips_user_email`, fetched via Drive `about.get`) is in `FLIPS_ADMIN_EMAILS`, OR any `qb_*_token` exists in localStorage. Passing appends the "⚙ Admin Tools" nav link. Client-side only — real protection is Google/QB permissions (optionally harden with Cloudflare Access on the admin paths). |
| `js/flips-google-fetch.js` | **Canonical fetch helpers** — `apiFetch`, `googleFetch`, `refreshAccessToken`. Loaded by every page. Single source of truth for the 401-retry / token-refresh path. |
| `js/flips-shared.js` | Shared auth (`initGoogle`), property loading (`loadSheet`), expense calcs, dynamic row helpers, Drive utilities. Used by `index.html`, `estimate.html`, `estimate-tracker.html`. |
| `js/flips-price-history.js` | **Price History** — "what have we charged for this before?" Pure stats math (`phComputeStats` etc., dual-export, tested in `tests/price-history.test.js`) + browser code: auto-creates the `Price History` tab in the WR sheet, `upsertPriceHistoryFromWO(data)` writes a row on every WO save (keyed on Work Log line # so edit re-saves don't double-count; preserves QB cols once `qb-reconciled`), and renders the advisory panel into `#price-history-panel` on `index.html` when property + services are picked. Group tier keys on lowercased **billing email** (LCP properties share one). One-off services (Repair, Deficiency Correction, etc. — anything not in `PH_RATEABLE_PREFIXES`, kept in sync with `INSPECTION_SVC_PREFIXES` in index.html) show past charges but are excluded from all averages; bundled multi-service totals never feed per-service averages, only the exact-combo line. `reconcilePriceHistoryQB(lineNum, qbInvoiceNum, qbAmount)` is called by `create-invoices.html` after each QB invoice create — stamps cols K–N (source→`qb-reconciled`) on the matching row; a row's QB amount supersedes its WO total in all stats. No Claude — plain math. |
| `js/flips-history.js` | Inspection History writes — `appendInspectionHistory`, `deleteInspectionHistoryEntries`. Direct Sheets API calls (no Apps Script). Used by `index.html`, `schedule.html`, `inspection.html`, `hospital-inspection.html`. |
| `js/inspection-google.js` | Auth + sheet loader specific to `inspection.html` and `hospital-inspection.html` (has its own proactive token refresh). |
| `js/inspection-pdf-editable.js` | **The current inspection PDF engine** for `inspection.html` — one `build*PDFBytes()` function per system, all using pdf-lib fillable forms. `inspection-main.js` dispatches to the right one by `activeInspectionSystem`. Each builder renders its system-specific content with local helpers, then hands the page cursor to the shared `js/inspection-pdf-components.js` renderers for the common report tail. See the PDF generation section below. |
| `js/inspection-pdf-components.js` | **Shared PDF components** — `inspPdfColors(rgb)` (the palette every builder shared), `makeInspectionPdfCtx(...)` (a cursor-owning ctx with the canonical primitives: `secHdr`/`subHdr`/`dataRow`/`table`/`ry`/`ty`/`checkPage`/`gap`/`wrap`), the page-1 `renderInspectionStatusBar`, plus the four report-tail sections extracted from every builder: `renderInspectionDeficiencies`, `renderInspectionNotes`, `renderInspectionStatusAndSignatures`, `renderInspectionPhotos`. Section titles are standardized here (one wording for all systems); deficiencies + notes render as editable, auto-growing numbered rows; signatures use `INSPECTOR SIGNATURE`. A builder seeds a ctx from its current `page`/`curY`/`fid`, calls the renderers, and reads `ctx.page`/`ctx.curY` back (needed only when system-specific content is interleaved, e.g. fire-alarm's batteries block sits between the shared deficiency and notes renderers). Dual-export (browser global + CommonJS), unit-tested in `tests/inspection-pdf-ctx.test.js`. Loaded after `inspection-pdf-scale.js`, before `inspection-pdf.js`. |
| `js/inspection-blank-forms.js` | **Blank printable field worksheets** — `buildBlankExtinguisherFormBytes(opts)` / `buildBlankExitSignFormBytes(opts)`. For contractors who fill out paper by hand: each unit is a **two-row block** with open-text cells (location/type/floor/size/notes) plus **☐-to-X checkboxes** for every categorical field (mount, type, P/F/N-A columns, PASS/FAIL) — far more reliable for `inspection-scan-import.js` to read back. **Self-contained** (own inlined palette + `_blankFormHeader`; depends only on `sc`/`pdfSafe` + `wrapText` + `window.PDFLib`) so it loads on BOTH `inspection.html` and `hospital-inspection.html` without the full editable engine. `opts = { count=100, known/knownEL/knownES }`: `count` blank blocks per section (from the **Blank rows per section** input, capped 300), optionally preceded by devices pre-filled from the last inspection (**Pre-fill known devices** toggle). Dispatch/download entry points (`buildActiveBlankFormBytes` / `_blankFormOpts` / `downloadBlankForm`) live at the bottom of THIS file (moved out of inspection-main.js so both pages share them). `_blankFormOpts` reads the bare `_propertyProfile` global (script-scope `let`, NOT `window._propertyProfile`) and for extinguishers falls back from `lastInspBySystem.extinguisher` to `lastInspBySystem.hospital` — this is how the hospital's ~145 extinguishers pre-fill. Triggered from the **🖨 Blank Field Worksheets** card on `inspection.html` step-1 AND the **Field Worksheets & Scan** card on the hospital extinguisher step. |
| `js/inspection-scan-import.js` | **Scan → autoload** — reads a photo/PDF of a hand-filled worksheet with Claude vision and populates the rows via the same `addExtUnitRow`/`addELRow`/`addESRow` prefill functions the wizard uses. Reuses the browser-side Anthropic pattern (`localStorage.flips_anth_key` + `anthropic-dangerous-direct-browser-access`); defaults to Sonnet (handwriting needs a strong vision model; override via `localStorage.flips_scan_model`). `scanImportActiveSystem(systemOverride?)` — omit for the active system (inspection.html panels) or pass one explicitly (hospital button passes `'extinguisher'`). Shows a review list, never auto-submits. The requested JSON keys MUST stay in sync with the panel prefill contracts (`SCAN_SYSTEMS`). Supports `extinguisher` + `exit-sign-lighting`; on the hospital page only extinguisher scan-back works (its exit-lighting is summary-only, no per-device rows). |
| `js/inspection-pdf-layout.js` | Pure, dependency-free PDF layout math (`wrapText`, `pdfRowHeight`) shared by the builders. Dual-export (browser global + CommonJS) so it's unit-tested in `tests/pdf-layout.test.js`. Must be loaded **before** `inspection-pdf.js` in `inspection.html`. |
| `js/inspection-*.js` | Other inspection page modules (main, pdf, panels, nav, etc.) |
| `_worker.js` | Cloudflare Worker — API proxy routes for QuickBooks OAuth only. Same-origin lock on `/api/*` (cross-origin returns 403). |
| `.assetsignore` | Files in this list are NOT served publicly by Cloudflare. Add anything sensitive here. |

---

## Architecture

### Shared JS — two-tier model

There are two shared JS files. They serve different scopes:

- **`js/flips-google-fetch.js`** — fetch helpers ONLY (`apiFetch`, `googleFetch`, `refreshAccessToken`). Every page loads it. Depends on `accessToken` and `tokenClient` already being declared in script scope (either by `flips-shared.js` or by the page's inline script).
- **`js/flips-shared.js`** — full auth/connect flow (`initGoogle`), property dropdown, expense calcs, dynamic row helpers. Loaded by `index.html`, `estimate.html`, `estimate-tracker.html`. Other pages have their own `initGoogle` and just load `flips-google-fetch.js`.

#### Pages using `flips-shared.js` (full auth integration)
```html
<script src="https://accounts.google.com/gsi/client"></script>
<script src="js/flips-shared.js"></script>
<script src="js/flips-google-fetch.js"></script>
<script> /* page-specific code */ </script>
```
Each page must define `const SCOPES = '...'` in its own `<script>` **before** flips-shared.js loads.

**Extension hooks** — define these in your page script and shared will call them automatically:
- `onAfterAuth()` — called after OAuth token is obtained and `loadSheet()` completes
- `onPropertySelectExtras(d)` — called at the end of `onPropertySelect()` with the row data object

**Globals declared by `flips-shared.js`** (accessible everywhere on those pages):
- `accessToken` — current OAuth Bearer token
- `tokenClient` — GIS TokenClient instance
- `clientData` — `{ [propertyName]: { [lowercasedHeader]: value } }` — loaded from the property list sheet
- `API_KEY_VAL` — Google API key

#### Pages with their own `initGoogle` (auth done inline)
`clients.html`, `schedule.html`, `worklog.html`, `create-invoices.html`, `sub-invoices.html`, `open-invoices.html`, `triage.html` — each declares its own `let accessToken; let tokenClient;` in an inline `<script>` and just loads:
```html
<script src="https://accounts.google.com/gsi/client"></script>
<script src="js/flips-google-fetch.js"></script>
<script> /* inline initGoogle, page-specific code */ </script>
```
The fetch helpers in `flips-google-fetch.js` resolve `accessToken`/`tokenClient` at call time via shared script scope, so the helper file works in both setups.

#### Inspection pages (separate subsystem)
`inspection.html` and `hospital-inspection.html` use `js/inspection-google.js` which has its own `googleFetch` plus a unique `_scheduleTokenRefresh()` that proactively refreshes 5 min before expiry. They do NOT load `flips-google-fetch.js`.

### Auth flow
1. User enters API Key + Client ID → `initGoogle()` → GIS OAuth popup → token stored in `localStorage` (55 min TTL)
2. On page load, if stored token is still valid, `loadSheet()` runs automatically — no popup
3. `loadSheet()` checks `sessionStorage` (key: `flips_client_cache`, 30-min TTL) before hitting the Sheets API
4. **If properties stop populating after a deploy: click ↺ Refresh Properties** to force-bypass the session cache. This is the fix for stale cache after code changes.

### Session / local storage keys
| Key | Storage | Purpose |
|---|---|---|
| `flips_api_key` | localStorage | Google API key |
| `flips_client_id` | localStorage | Google OAuth Client ID |
| `flips_access_token` | localStorage | OAuth access token |
| `flips_token_expiry` | localStorage | Token expiry timestamp |
| `flips_client_cache` | sessionStorage | Property list cache (30 min) |
| `flips_pending_estimate` | localStorage | Estimate→WO pre-fill bridge |
| `flips_price_hist_cache` | sessionStorage | Price History tab cache (30 min — index.html pricing panel) |
| `flips_anth_key` | localStorage | Anthropic API key (sub-invoices.html) |
| `flips_anth_model` | localStorage | Selected Claude model (sub-invoices.html) |
| `flips_sub_invoices_v1` | localStorage | Cached parsed sub invoice data keyed by Gmail message ID (sub-invoices.html) |
| `flips_triage_v1` | localStorage | Cached classified emails keyed by Gmail message ID (triage.html) — includes per-email `handled` / `dismissed` flags |

---

## Key Constants

### Google Sheets
- **Property list sheet**: `SHEET_ID = '1_Koq_v0RjsFbQ_c2qZh-eQpGQT2-0IkOal-I4CjSJrI'`, `SHEET_GID = '1899870347'` — defined in `flips-shared.js`
- **Work Requests / WO log sheet**: `WR_SHEET_ID = '1-DBErY57b1Avl6UHvuaZeYKkWlyEOLhrNBz6Cozvaik'` — in `estimate.html` and `index.html` (collectForm → createDoc)
- **Inspection History sheet**: Separate sheet from the property list — `HISTORY_SHEET_ID = '1XnkPKUNpBOZhqISF0hp5qeEg4mMzL3371f6E553XnuQ'` (defined in `js/flips-history.js`). Intentionally separate so users can share/access inspection history without exposing the main property list. Tab name `'Inspection History'`. Columns A–H: Property Name, FLPS Acct #, Service Address, Inspection Type, Date Completed, Frequency, Source, Notes. Append-only — schedule.html groups rows and keeps the most recent per (property+type). Read by `schedule.html`, written by `js/flips-history.js`.
- **Sub Invoices tab**: Inside `WR_SHEET_ID`, tab name `'Sub Invoices'` — auto-created on first sync by `sub-invoices.html`. Columns A–O: Email Date, Email From, Gmail Message ID (dedup key), Filename, Vendor, Invoice #, Invoice Date, Amount, Description, Matched WorkLog Row, Matched Property, Matched Work, Status, Notes, Last Updated.

- **Price History tab**: Inside `WR_SHEET_ID`, tab name `'Price History'` — auto-created on first WO save by `js/flips-price-history.js`. Columns A–N: Date, Line # (upsert key), Property, FLPS Acct #, Billing Email (lowercased — group key), Management Co, Services (` | `-joined checkbox values), Svc Count, Total, Fixed Rate, Source (`live`/`backfill`/`qb-reconciled`), QB Invoice #, QB Amount, Updated.

### FLPS Account Number — cross-system key
The FLPS internal account number links the property list sheet to QuickBooks customers:
- **Property list sheet**: stored in a column whose header matches `'flps internal account number'`, `'internal account number'`, `'account number'`, `'account no'`, or `'acct'` (lowercased). The `fill('flps-acct-num', ...)` call in `flips-shared.js` uses this same pattern.
- **QuickBooks customer**: stored in `AlternatePhone.FreeFormNumber` (shown as "Other contact" in the QB Online customer form) **and/or** `AcctNum` (shown as "Account no." on the Additional info tab). `create-invoices.html`'s `findOrCreateCustomer()` checks both fields.
- **Use for matching**: to resolve invoice → property manager, look up the QB customer by `CustomerRef.value`, read their `AlternatePhone.FreeFormNumber` (FLPS acct #), then find the matching row in the property list sheet by that acct #. Name-based fuzzy matching is a weaker fallback — acct # is the reliable join key.

### Google Drive
- **Estimate folder**: `EST_FOLDER_ID = '1Ma-hUFL3t4l6NsWdmPRB45JJMaaK1Oc1'` — estimates saved as `FLPS_EST_*.json` and `FLPS_EST_*.pdf`
- **WO folders**: Named folders ("2 - Ready to Invoice", "3 - Invoice Sent") — `create-invoices.html` finds them by name via Drive API
- **Work order template Google Doc**: `TEMPLATE_DOC_ID = '1x96eu74Jlo-8mz8Ztah2noGc7SY-HvX1CQNQ6Vl07Sc'` — in `index.html`
- **Inspection reports folder**: `REPORTS_FOLDER_ID = '1YcIKbtFLaYPB4WEYVWmPR_o8BuSsCHhg'` (under **FLPS Software › FLPS Inspection Reports**). The inspection pages save report PDFs here; `inspection-audit.html` reads it; `import-reports.html` writes external reports here. The inspection JSON + property profiles live in sibling folders (`FLPS Inspection History`, `FLPS Property Profiles`, `FLPS Drafts`) under the `FLPS Software` root — see `getFlpsRootFolderId()`/`findOrCreateFolder()` in `js/inspection-drafts.js`.
- **Report filename convention** (this is the join key the audit matches on): `FLPS_{systemSlug}_{freq}_{propertySlug}_{date}.pdf`, where `systemSlug = activeInspectionSystem` with `-`→`_` (from `SYS_META` in `js/inspection-config.js`), `freq` = `inspectionFrequency(data)` slugified (Annual / Semi_Annual / …, shared with the schedule append — `js/inspection-schedule.js`), `propertySlug = buildFileSlug()` (name+address, `js/inspection-utils.js`), `date` = `YYYY-MM-DD` (hospital uses `YYYYMMDD` and has no freq segment). **Hoods** also fold the hood ID(s) in via `buildUnitSlug()` so same-day different hoods don't collide. The audit only needs the **system slug first** and the **date last** — the freq segment in the middle is ignored by matching (informational). Older `FLPS_{system}_{property}_{date}.pdf` files (no freq) still parse fine. **Externally-sourced** reports (Convergint/Martinez, via `import-reports.html`) use `EXT_{systemSlug}_{freq}_{vendor}_{propertySlug}_{date}.pdf` — **system slug first** (right after `EXT_`) because `sysFromFile()` strips the `EXT_` prefix and then matches the leading slug. The audit's `sysFromFile()`/`parseFileDate()` parse these; keep the convention in sync if you change either side. A combined report (e.g. 5-Yr Internal Pipe + FDC) is imported twice — once per system — via the importer's ⧉ duplicate-row button.

---

## Cloudflare Environment Variables
Set in Cloudflare dashboard → Worker → Settings → Variables:
- `QB_CLIENT_ID` / `QB_CLIENT_SECRET` — QuickBooks sandbox OAuth
- `QB_CLIENT_ID_PROD` / `QB_CLIENT_SECRET_PROD` — QuickBooks production OAuth

---

## Patterns & Conventions

### Adding a new page
1. Define `const SCOPES = '...'` at the top of the page's inline `<script>`
2. Load `js/flips-shared.js` (for full auth integration) AND `js/flips-google-fetch.js` after the GIS script tag
3. Call `initGoogle()` from your connect button
4. Optionally define `onAfterAuth()` and `onPropertySelectExtras(d)` hooks
5. Load `<script src="js/flips-nav.js" defer></script>` in the `<head>` and include the standard `#nav-menu` hamburger markup; add the page to `FLIPS_NAV_SECTIONS` in `js/flips-nav.js` (or link it from `admin.html` if it's a staff-only tool)

### Google API calls
Use `googleFetch(url, method, body)` or its alias `apiFetch(url, method, body)` from `js/flips-google-fetch.js`. Both share the same implementation — it handles `Authorization: Bearer` headers and a single-flight 401 retry that refreshes the token via `tokenClient.requestAccessToken({ prompt: '' })`. Concurrent 401s share one refresh promise, so parallel calls won't fight over the token client's callback.

Defaults: `method='GET'`, `body=null`. `Content-Type: application/json` is only set when `body !== null`. For binary downloads (Drive `?alt=media`), pass no body — the helper returns the raw `Response` for you to call `.text()`/`.blob()` on.

### `_worker.js` API routes
- `/api/qb-token` — QB OAuth2 token exchange (uses `QB_CLIENT_ID*` env vars)
- `/api/qb-api` — QB API proxy (forwards `access_token` + `realm_id` from request)
- `/api/fetch-report` — host-locked GET proxy for `import-inspectpoint.html`. POST `{ url }`; the Worker fetches it server-side (browser can't, CORS) and returns the upstream bytes verbatim (viewer HTML or `application/pdf`). **Allowlist**: https only, host must be `inspectpoint.com` / `*.inspectpoint.com` / `*.cloudfront.net` — anything else gets 403, so it isn't an open proxy. The Inspect Point view-report links are public tokens (no login).

**Origin lock**: every `/api/*` route checks the `Origin` header. Same-origin (browser at the deployed Worker URL) and no-Origin (server-to-server) requests pass; cross-origin requests get 403. Don't try to call these endpoints from a different domain — the lock is intentional.

### Inspection history writes
`appendInspectionHistory(updates)` in `js/flips-history.js` appends rows to the Inspection History tab via the Sheets `:append` endpoint. `deleteInspectionHistoryEntries(acctNum, propertyName, type)` reads the tab, finds matching rows, and issues a `:batchUpdate` with `deleteDimension` requests in reverse order. Both require write scope on Sheets — pages that call them must include `https://www.googleapis.com/auth/spreadsheets` (not `.readonly`) in their `SCOPES`.

### Drive file upload
`driveUploadFile(name, mimeType, content, folderId, existingFileId, isBase64)`:
- Pass `existingFileId` to update (PATCH), `null` to create (POST)
- Pass `isBase64=true` for binary (PDF) content
- Pass `name=null` on PATCH to preserve the existing filename

### Schedule update behavior
- The latest date always wins regardless of source — work order, inspection report, or manual pencil edit all compete equally on date.

### Estimate → Work Order flow
`estimate-tracker.html` writes `est` JSON to `localStorage.flips_pending_estimate` then navigates to `index.html`. On load, `index.html` calls `checkPendingEstimate()` which shows a banner. Clicking "Load Estimate" calls `loadFromEstimate()` to pre-fill the form.

### PDF generation
- Work orders: Google Docs template copy via Drive API (server-side rendering)
- Estimates: jsPDF (cdnjs 2.5.1 UMD) — client-side generation
- Inspection reports (`inspection.html`): **pdf-lib** fillable forms, in `js/inspection-pdf-editable.js`. (The older `js/inspection-pdf.js` jsPDF path still defines `collectAllData()` — used for the JSON save — but no longer renders the report.)
- Hospital inspection (`hospital-inspection.html`): separate engine, `js/inspection-hospital-pdf.js` (not affected by changes to the editable builders).

#### Inspection PDF builders — one per system
`js/inspection-pdf-editable.js` has a dedicated `build…PDFBytes()` per system: `buildSprinklerPDFBytes`, `buildEditablePDFBytes` (fire-alarm), `buildHoodPDFBytes`, `buildExtinguisherPDFBytes`, `buildExitSignLightingPDFBytes`, and `buildGenericSystemPDFBytes` (everything else). `js/inspection-main.js` picks the right one via a single `buildActiveInspectionPDFBytes()` switch, called from both `saveAndDownload()` and `previewPDF()` — a new/changed system is wired in that one place. Each builder defines its own local `page`/`curY` cursor helpers (`ry`, `ty`, `checkPage`, `secHdr`, etc.) and a `wrap` closure that now delegates to the shared `wrapText`; color constants come from the shared `inspPdfColors(rgb)` (js/inspection-pdf-components.js), and the page-1 status bar from `renderInspectionStatusBar(ctx, data)`.

The shared **report cover header** is drawn once by `drawReportHeader(...)`; the shared **report tail** (deficiency list · general notes & site observations · overall status & signatures · photos) is drawn by the renderers in `js/inspection-pdf-components.js` — see that file's row above. The per-builder `page`/`curY`/`secHdr`/`table`/… helpers still exist because each builder's **system-specific body** uses them; a future pass could migrate whole builder bodies onto the ctx and delete those locals.

#### Deficiency & notes rendering convention
Deficiency and general-notes entries are rendered as **editable, multiline, auto-growing** form fields (numbered rows): compute wrapped line count with `wrap(text, size, maxWidth)`, size the box with `pdfRowHeight(lineCount, { lineH, pad, min })`, then `field.enableMultiline()` and add it at that height so long text wraps instead of truncating in a single-line field. This is now centralized in `renderInspectionDeficiencies` / `renderInspectionNotes` (`js/inspection-pdf-components.js`), so every system renders these identically — don't re-implement per builder. The data those renderers read (`data.deficiencies`, `data.notes`) is normalized once in `collectAllData()` / `buildNotesList()` (`js/inspection-pdf.js`). `wrapText`/`pdfRowHeight` live in `js/inspection-pdf-layout.js` and are unit-tested, so the layout math can be changed in one place.

### QuickBooks
API calls proxied through `_worker.js` at `/api/qb-api` to keep client secrets off the client. See `clients.html` and `create-invoices.html` for QB customer matching and invoice creation logic.

### Payments Dashboard (`open-invoices.html`)
- **QB tokens shared with `create-invoices.html`** via `localStorage.qb_access_token_<env>` etc. — `open-invoices.html` does NOT register its own QB OAuth redirect URI. If tokens are missing, the "Connect QuickBooks" button sets `sessionStorage.qb_return_to` and redirects to `/create-invoices.html?qb_connect=1`; the create-invoices callback handler then bounces the browser back here. (See create-invoices.html `handleQBCallback` for the return-to mechanism.)
- **Loads all invoices with `Balance > '0'`** via paginated `SELECT * FROM Invoice WHERE Balance > '0'` queries (1000-row pages). Aging is computed client-side from `DueDate`.
- **Recording a payment** POSTs to `/payment?minorversion=70` with a `Line[].LinkedTxn` referencing the invoice. PaymentMethodRef is set when the user picks one (Check is auto-selected if it exists in the QB PaymentMethod list).
- **Work Log sync** (optional, default ON): after a successful QB payment, looks up the matching work log row by checking if the QB invoice number appears as a substring in column H (`invoiced`), then writes the payment date (and check #) to column I (`paid`) and sets the row background to green (matches `STATUS_BG.paid` in `worklog.html`).

### Sub Invoice Inbox (`sub-invoices.html`)
- **Auth scopes**: needs both `https://www.googleapis.com/auth/spreadsheets` AND `https://www.googleapis.com/auth/gmail.readonly`. Existing tokens won't have Gmail scope — first connect prompts the consent dialog with `prompt: 'consent'`.
- **Anthropic API**: called directly from the browser via `https://api.anthropic.com/v1/messages` with the `anthropic-dangerous-direct-browser-access: true` header. API key stored in `localStorage.flips_anth_key`. Default model `claude-sonnet-4-6`. PDF passed as a `document` content block (base64). System prompt asks for strict JSON output (no code fences) with vendor / invoiceNumber / invoiceDate / amount / description / properties / lineItems.
- **Gmail attachments are base64URL-encoded** (uses `-` and `_` instead of `+` and `/`); `b64UrlToB64()` converts before sending to Claude. The browser Gmail API (`messages/{id}/attachments/{attId}`) is the only way to get attachment *bytes* — the Claude.ai Gmail MCP connector can search/read/label but **cannot download attachments**, which is why report-import is in-app, not MCP.
- **Claude auto-read cost toggle** (pages that read PDFs with Claude — `sub-invoices.html`, `import-reports.html`): a checkbox in the settings drawer toggles paid auto-read independently of the stored key (`localStorage.flips_*_use_claude`, default on), with an "ⓘ how it works & cost" `<details>` panel on the page. `runSearch` gates the Claude call on `claudeEnabled()`. Reuse this pattern for any new Claude-on-PDF page.
- **Caching**: parsed invoices stored in `localStorage.flips_sub_invoices_v1` keyed by Gmail message ID. Re-running the search skips already-parsed messages so you never pay Claude twice for the same PDF.
- **Fuzzy matching**: `scoreMatch(inv, row)` weights property name overlap (token-based), description vs. work-requested overlap, and date proximity. Score ≥ 0.85 auto-matches; lower scores show as suggestions for manual confirm.
- **Sync to Sheets**: `syncToSheets()` ensures the `Sub Invoices` tab exists (auto-creates with formatted header row), reads existing rows to dedup by Gmail Message ID (column C), then appends new rows and updates existing ones via `values:batchUpdate`.

### Inbox Triage (`triage.html`)
- **Auth scopes**: `spreadsheets.readonly` (for fuzzy-matching mentioned property names against the property list sheet) + `gmail.readonly`. Like sub-invoices.html, an existing token without Gmail scope will trigger the consent dialog (`prompt: 'consent'`) on first connect.
- **Read-only on Gmail**: only `users/me/messages` list + get. Does NOT modify labels, mark read, or send. Safe to run repeatedly.
- **Anthropic API**: text-only classification (no PDF), default model `claude-haiku-4-5-20251001` for cost — Sonnet/Opus also selectable. Body capped at 2000 chars before sending. System prompt returns strict JSON with `category` / `priority` / `property` / `summary` / `actionable`.
- **Categories**: `estimate_request`, `scheduling`, `complaint`, `ahj_violation`, `payment_followup`, `sub_invoice`, `vendor_other`, `newsletter`, `other`. Defaults to `other` if Claude returns an unknown value.
- **Property fuzzy match**: `matchProperty()` scores Claude's extracted property string + full email text against each row in the property list. Strong substring of property name → 0.95; substring of address → 0.85; otherwise token Jaccard. Threshold 0.45 to display a match; below that the email shows the Claude-extracted name with an "(no match)" badge.
- **Caching**: classified emails in `localStorage.flips_triage_v1` keyed by Gmail message ID. Per-email `handled` / `dismissed` flags persist across reloads. Re-running triage skips already-classified messages.
- **Per-row actions**: Open in Gmail, Reply (mailto), category-specific deep links to the relevant page (estimate.html / schedule.html / index.html / sub-invoices.html / open-invoices.html — open in new tab, no auto-prefill), Mark handled, Dismiss.
