# FLIPS — Fire Life Protection Systems Field App

## What this is
Plain HTML/JS field service management app for a commercial fire inspection company. No build step, no framework. Hosted on Cloudflare Workers at `https://workorder.firelifepro.workers.dev/`.

## Deploy
```bash
npx wrangler deploy
```
Deploys the entire directory as static assets plus the `_worker.js` API routes. Cloudflare caches aggressively — users may need to hard-refresh (Cmd+Shift+R) after a deploy if they have the page open.

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
| `js/flips-shared.js` | Shared auth, property loading, expense calcs, Drive/API utilities |
| `js/inspection-*.js` | Inspection page modules (main, pdf, panels, nav, etc.) |
| `_worker.js` | Cloudflare Worker — API proxy routes for QB OAuth and Apps Script |
| `js/AppsScript.gs` | Google Apps Script source (not deployed here — paste into Google) |

---

## Architecture

### Shared JS (`js/flips-shared.js`)
All pages include this after the GIS script tag:
```html
<script src="https://accounts.google.com/gsi/client"></script>
<script src="js/flips-shared.js"></script>
<script> /* page-specific code */ </script>
```

Each page must define `const SCOPES = '...'` in its own `<script>` **before** flips-shared.js loads. The shared file reads `SCOPES` at auth time.

**Extension hooks** — define these in your page script and shared will call them automatically:
- `onAfterAuth()` — called after OAuth token is obtained and `loadSheet()` completes
- `onPropertySelectExtras(d)` — called at the end of `onPropertySelect()` with the row data object

**Shared globals** (defined in flips-shared.js, accessible everywhere):
- `accessToken` — current OAuth Bearer token
- `tokenClient` — GIS TokenClient instance
- `clientData` — `{ [propertyName]: { [lowercasedHeader]: value } }` — loaded from the property list sheet
- `API_KEY_VAL` — Google API key

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

---

## Key Constants

### Google Sheets
- **Property list sheet**: `SHEET_ID = '1_Koq_v0RjsFbQ_c2qZh-eQpGQT2-0IkOal-I4CjSJrI'`, `SHEET_GID = '1899870347'` — defined in `flips-shared.js`
- **Work Requests / WO log sheet**: `WR_SHEET_ID = '1-DBErY57b1Avl6UHvuaZeYKkWlyEOLhrNBz6Cozvaik'` — in `estimate.html` and `index.html` (collectForm → createDoc)
- **Inspection schedule/history**: Same `SHEET_ID` as property list, different tabs — in `schedule.html`

### Google Drive
- **Estimate folder**: `EST_FOLDER_ID = '1Ma-hUFL3t4l6NsWdmPRB45JJMaaK1Oc1'` — estimates saved as `FLPS_EST_*.json` and `FLPS_EST_*.pdf`
- **WO folders**: Named folders ("2 - Ready to Invoice", "3 - Invoice Sent") — `create-invoices.html` finds them by name via Drive API
- **Work order template Google Doc**: `TEMPLATE_DOC_ID = '1x96eu74Jlo-8mz8Ztah2noGc7SY-HvX1CQNQ6Vl07Sc'` — in `index.html`

### Apps Script
- URL and secret are **Cloudflare env vars** (`APPS_SCRIPT_URL`, `APPS_SCRIPT_SECRET`) — injected server-side by `_worker.js` at `/api/apps-script`. Never in client code.
- Apps Script source lives in `js/AppsScript.gs` — must be manually pasted into the Google Apps Script editor.

---

## Cloudflare Environment Variables
Set in Cloudflare dashboard → Worker → Settings → Variables:
- `QB_CLIENT_ID` / `QB_CLIENT_SECRET` — QuickBooks sandbox OAuth
- `QB_CLIENT_ID_PROD` / `QB_CLIENT_SECRET_PROD` — QuickBooks production OAuth
- `APPS_SCRIPT_URL` — Google Apps Script deployment URL
- `APPS_SCRIPT_SECRET` — Shared secret for Apps Script auth

---

## Patterns & Conventions

### Adding a new page
1. Define `const SCOPES = '...'` at the top of the page's inline `<script>`
2. Load `js/flips-shared.js` after the GIS script tag
3. Call `initGoogle()` from your connect button
4. Optionally define `onAfterAuth()` and `onPropertySelectExtras(d)` hooks
5. Add nav links to all other pages

### Google API calls
Always use `googleFetch(url, options)` from flips-shared.js — it handles `Authorization: Bearer` headers, automatic 401 retry with token refresh, and passes `key=` for public endpoints.

Use `apiFetch(url, options)` for the Apps Script proxy (`/api/apps-script`).

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
