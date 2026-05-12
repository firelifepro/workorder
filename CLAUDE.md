# FLIPS — Fire Life Protection Systems Field App

## What this is
Plain HTML/JS field service management app for a commercial fire inspection company. No build step, no framework. Hosted on Cloudflare Workers at `https://workorder.firelifepro.workers.dev/`.

## Deploy
```bash
npx wrangler deploy
```
Deploys the entire directory as static assets plus the `_worker.js` API routes. Files listed in `.assetsignore` are excluded from the public deploy (e.g. `_worker.js`, `CLAUDE.md`, `README.md`, abandoned test files). Cloudflare caches aggressively — users may need to hard-refresh (Cmd+Shift+R) after a deploy if they have the page open.

---

## Files

| File | Purpose |
|---|---|
| `index.html` | Work order creation — the main form |
| `schedule.html` | Inspection schedule tracker (next-due dates, overdue alerts) |
| `estimate.html` | Estimate builder — PDF + Drive + Gmail draft |
| `estimate-tracker.html` | List/manage estimates, convert to work order |
| `clients.html` | Client list + QuickBooks reconciliation |
| `create-invoices.html` | Create QB invoices from Drive work order PDFs |
| `inspection.html` | iPad fire inspection report (4-step wizard, PDF) |
| `hospital-inspection.html` | Variant inspection form for hospital properties |
| `worklog.html` | Work log / time tracking |
| `sub-invoices.html` | Subcontractor invoice inbox — pulls PDF attachments from Gmail, parses with Claude API, fuzzy-matches to work log rows, writes to Sub Invoices tab in WR sheet |
| `payments.html` | Open invoices dashboard — lists all unpaid QB invoices with aging, records payments (creates QB Payment txn), optionally marks matching Work Log row paid |
| `triage.html` | Inbox triage — pulls recent emails from Gmail, classifies each via Claude (estimate request / scheduling / complaint / AHJ violation / payment / sub invoice / vendor / newsletter / other), fuzzy-matches mentioned property to the property list, groups by category for quick action. Read-only on Gmail; cache lives in `localStorage.flips_triage_v1` keyed by Gmail message ID. |
| `js/flips-google-fetch.js` | **Canonical fetch helpers** — `apiFetch`, `googleFetch`, `refreshAccessToken`. Loaded by every page. Single source of truth for the 401-retry / token-refresh path. |
| `js/flips-shared.js` | Shared auth (`initGoogle`), property loading (`loadSheet`), expense calcs, dynamic row helpers, Drive utilities. Used by `index.html`, `estimate.html`, `estimate-tracker.html`. |
| `js/flips-history.js` | Inspection History writes — `appendInspectionHistory`, `deleteInspectionHistoryEntries`. Direct Sheets API calls (no Apps Script). Used by `index.html`, `schedule.html`, `inspection.html`, `hospital-inspection.html`. |
| `js/inspection-google.js` | Auth + sheet loader specific to `inspection.html` and `hospital-inspection.html` (has its own proactive token refresh). |
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
`clients.html`, `schedule.html`, `worklog.html`, `create-invoices.html`, `sub-invoices.html`, `payments.html`, `triage.html` — each declares its own `let accessToken; let tokenClient;` in an inline `<script>` and just loads:
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
| `flips_anth_key` | localStorage | Anthropic API key (sub-invoices.html) |
| `flips_anth_model` | localStorage | Selected Claude model (sub-invoices.html) |
| `flips_sub_invoices_v1` | localStorage | Cached parsed sub invoice data keyed by Gmail message ID (sub-invoices.html) |
| `flips_triage_v1` | localStorage | Cached classified emails keyed by Gmail message ID (triage.html) — includes per-email `handled` / `dismissed` flags |

---

## Key Constants

### Google Sheets
- **Property list sheet**: `SHEET_ID = '1_Koq_v0RjsFbQ_c2qZh-eQpGQT2-0IkOal-I4CjSJrI'`, `SHEET_GID = '1899870347'` — defined in `flips-shared.js`
- **Work Requests / WO log sheet**: `WR_SHEET_ID = '1-DBErY57b1Avl6UHvuaZeYKkWlyEOLhrNBz6Cozvaik'` — in `estimate.html` and `index.html` (collectForm → createDoc)
- **Inspection History tab**: Same `SHEET_ID` as the property list, tab name `'Inspection History'`. Columns A–H: Property Name, FLPS Acct #, Service Address, Inspection Type, Date Completed, Frequency, Source, Notes. Append-only — schedule.html groups rows and keeps the most recent per (property+type). Read by `schedule.html`, written by `js/flips-history.js`.
- **Sub Invoices tab**: Inside `WR_SHEET_ID`, tab name `'Sub Invoices'` — auto-created on first sync by `sub-invoices.html`. Columns A–O: Email Date, Email From, Gmail Message ID (dedup key), Filename, Vendor, Invoice #, Invoice Date, Amount, Description, Matched WorkLog Row, Matched Property, Matched Work, Status, Notes, Last Updated.

### FLPS Account Number — cross-system key
The FLPS internal account number links the property list sheet to QuickBooks customers:
- **Property list sheet**: stored in a column whose header matches `'flps internal account number'`, `'internal account number'`, `'account number'`, `'account no'`, or `'acct'` (lowercased). The `fill('flps-acct-num', ...)` call in `flips-shared.js` uses this same pattern.
- **QuickBooks customer**: stored in `AlternatePhone.FreeFormNumber` (shown as "Other contact" in the QB Online customer form) **and/or** `AcctNum` (shown as "Account no." on the Additional info tab). `create-invoices.html`'s `findOrCreateCustomer()` checks both fields.
- **Use for matching**: to resolve invoice → property manager, look up the QB customer by `CustomerRef.value`, read their `AlternatePhone.FreeFormNumber` (FLPS acct #), then find the matching row in the property list sheet by that acct #. Name-based fuzzy matching is a weaker fallback — acct # is the reliable join key.

### Google Drive
- **Estimate folder**: `EST_FOLDER_ID = '1Ma-hUFL3t4l6NsWdmPRB45JJMaaK1Oc1'` — estimates saved as `FLPS_EST_*.json` and `FLPS_EST_*.pdf`
- **WO folders**: Named folders ("2 - Ready to Invoice", "3 - Invoice Sent") — `create-invoices.html` finds them by name via Drive API
- **Work order template Google Doc**: `TEMPLATE_DOC_ID = '1x96eu74Jlo-8mz8Ztah2noGc7SY-HvX1CQNQ6Vl07Sc'` — in `index.html`

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
5. Add nav links to all other pages

### Google API calls
Use `googleFetch(url, method, body)` or its alias `apiFetch(url, method, body)` from `js/flips-google-fetch.js`. Both share the same implementation — it handles `Authorization: Bearer` headers and a single-flight 401 retry that refreshes the token via `tokenClient.requestAccessToken({ prompt: '' })`. Concurrent 401s share one refresh promise, so parallel calls won't fight over the token client's callback.

Defaults: `method='GET'`, `body=null`. `Content-Type: application/json` is only set when `body !== null`. For binary downloads (Drive `?alt=media`), pass no body — the helper returns the raw `Response` for you to call `.text()`/`.blob()` on.

### `_worker.js` API routes
- `/api/qb-token` — QB OAuth2 token exchange (uses `QB_CLIENT_ID*` env vars)
- `/api/qb-api` — QB API proxy (forwards `access_token` + `realm_id` from request)

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
- Inspection reports: jsPDF — client-side generation

### QuickBooks
API calls proxied through `_worker.js` at `/api/qb-api` to keep client secrets off the client. See `clients.html` and `create-invoices.html` for QB customer matching and invoice creation logic.

### Payments Dashboard (`payments.html`)
- **QB tokens shared with `create-invoices.html`** via `localStorage.qb_access_token_<env>` etc. — `payments.html` does NOT register its own QB OAuth redirect URI. If tokens are missing, the "Connect QuickBooks" button sets `sessionStorage.qb_return_to` and redirects to `/create-invoices.html?qb_connect=1`; the create-invoices callback handler then bounces the browser back here. (See create-invoices.html `handleQBCallback` for the return-to mechanism.)
- **Loads all invoices with `Balance > '0'`** via paginated `SELECT * FROM Invoice WHERE Balance > '0'` queries (1000-row pages). Aging is computed client-side from `DueDate`.
- **Recording a payment** POSTs to `/payment?minorversion=70` with a `Line[].LinkedTxn` referencing the invoice. PaymentMethodRef is set when the user picks one (Check is auto-selected if it exists in the QB PaymentMethod list).
- **Work Log sync** (optional, default ON): after a successful QB payment, looks up the matching work log row by checking if the QB invoice number appears as a substring in column H (`invoiced`), then writes the payment date (and check #) to column I (`paid`) and sets the row background to green (matches `STATUS_BG.paid` in `worklog.html`).

### Sub Invoice Inbox (`sub-invoices.html`)
- **Auth scopes**: needs both `https://www.googleapis.com/auth/spreadsheets` AND `https://www.googleapis.com/auth/gmail.readonly`. Existing tokens won't have Gmail scope — first connect prompts the consent dialog with `prompt: 'consent'`.
- **Anthropic API**: called directly from the browser via `https://api.anthropic.com/v1/messages` with the `anthropic-dangerous-direct-browser-access: true` header. API key stored in `localStorage.flips_anth_key`. Default model `claude-sonnet-4-6`. PDF passed as a `document` content block (base64). System prompt asks for strict JSON output (no code fences) with vendor / invoiceNumber / invoiceDate / amount / description / properties / lineItems.
- **Gmail attachments are base64URL-encoded** (uses `-` and `_` instead of `+` and `/`); `b64UrlToB64()` converts before sending to Claude.
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
- **Per-row actions**: Open in Gmail, Reply (mailto), category-specific deep links to the relevant page (estimate.html / schedule.html / index.html / sub-invoices.html / payments.html — open in new tab, no auto-prefill), Mark handled, Dismiss.
