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
    // Sandbox "Contractor_Clients_Master" sheet (4 properties, same column
    // layout as the main property list) — drives the property dropdown +
    // autofill. NOTE: in contractor mode this never falls back to the real
    // property list; null here would mean "no sheet", not "use the default".
    sheetId: '1Yk_C1DXboyLwUhHpuJpAK2C_945rH2Q-DfhRjbUB5kE',
    sheetGid: '1899870347',
    // Optional sandbox "Contractor Inspection History" sheet. null = skip
    // history/schedule writes entirely (saveAndDownload won't 403 on a sheet the
    // sandbox account can't reach). Records still save as PDF + JSON to Drive.
    historySheetId: null,
    // Pinned to the "FLPS Contractor" Shared Drive (signed in as
    // Contractor_1@firelifeprotectionsystems.com). Every inspection PDF / JSON /
    // property profile is created inside this drive and nowhere else.
    rootFolderId: '0APieefnMyrJuUk9PVA',
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
