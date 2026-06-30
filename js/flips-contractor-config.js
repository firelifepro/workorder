// ─────────────────────────────────────────────────────────────────────────────
// FLIPS CONTRACTOR CONFIG — reusable sandbox routing for outside inspectors.
//
// SECURITY NOTE: this file does NOT enforce access control. The app has none —
// every page runs as whatever the signed-in Google account is allowed to do.
// A contractor is contained by GOOGLE DRIVE/SHEETS SHARING ONLY: give them a
// dedicated Google account that can see exactly one Shared Drive (their sandbox)
// and only their sandbox property/history sheets. This file just routes the
// inspection app's reads/writes to those sandbox resources and labels the UI.
//
// To onboard another contractor (or reuse one on more buildings/other work):
//   1. Provision their Google account + Shared Drive + property/history sheets
//      and share ONLY those (see plan Part A).
//   2. Add one entry below.
//   3. Open inspection-contractor.html?contractor=<slug>.
//
// Loaded BEFORE js/inspection-config.js so the IDs there can read the override.
// ─────────────────────────────────────────────────────────────────────────────

const FLIPS_CONTRACTORS = {
  deo: {
    label: 'Deo — Contractor Sandbox',
    // Sandbox "Contractor Properties" sheet (same column layout as the main
    // property list). Drives the inspection page's property dropdown + autofill.
    sheetId: 'REPLACE_WITH_CONTRACTOR_PROPERTIES_SHEET_ID',
    sheetGid: '0',
    // Sandbox "Contractor Inspection History" sheet. Set to null to skip history
    // writes entirely (saveAndDownload won't error if history isn't shared).
    historySheetId: 'REPLACE_WITH_CONTRACTOR_HISTORY_SHEET_ID',
    // null = let getFlpsRootFolderId() auto-pick the single Shared Drive the
    // sandbox account can see. Pin a folder id here only if the account can see
    // more than one Shared Drive and routing must be deterministic.
    rootFolderId: null,
  },
};

// Resolve the active contractor from ?contractor=<slug>. Null = normal mode
// (all existing pages and the default inspection.html are unaffected).
window.FLIPS_CONTRACTOR = (function () {
  try {
    const slug = new URLSearchParams(location.search).get('contractor');
    return slug && FLIPS_CONTRACTORS[slug] ? FLIPS_CONTRACTORS[slug] : null;
  } catch (e) {
    return null;
  }
})();
