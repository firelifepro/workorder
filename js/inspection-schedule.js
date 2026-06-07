// ─────────────────────────────────────────────────────────────────────────────
// INSPECTION SCHEDULE UPDATE
// Called after the inspection PDF is saved and downloaded. Appends a row
// directly to the Inspection History sheet via flips-history.js
// (appendInspectionHistory).
// ─────────────────────────────────────────────────────────────────────────────

// Maps activeInspectionSystem keys → inspection type names used in the schedule sheet
const INSP_SYS_TYPE_MAP = {
  'fire-alarm':         'Fire Alarm Inspection',
  'sprinkler':          'Sprinkler Inspection',
  'extinguisher':       'Extinguisher Inspection',
  'exit-sign-lighting': 'Emergency Exit Light Inspection',
  'hood':               'Hood Inspection',
  'fire-pump':          'Fire Pump Inspection',
  'backflow':           'Annual Backflow Prevention Test',
  'hospital':           'Hospital TJC/CMS Inspection',
};

// Maps report-type field values → canonical frequency strings for the schedule sheet
const INSP_FREQ_MAP = {
  'annual':      'Annual',
  'semi-annual': 'Semi Annual',
  'semi annual': 'Semi Annual',
  'quarterly':   'Quarterly',
  'monthly':     'Monthly',
};

// Canonical frequency string for an inspection — shared by the schedule append
// and the saved report filename (js/inspection-main.js) so they stay in sync.
function inspectionFrequency(data) {
  const sysKey = (data && data.inspectionSystem) ||
    (typeof activeInspectionSystem !== 'undefined' ? activeInspectionSystem : '') || '';
  const rawFreq = sysKey === 'sprinkler'
    ? ((data && data.fieldData && data.fieldData['sp-report-type']) || 'Annual').toLowerCase()
    : ((data && data.inspection && data.inspection.reportType) || 'Annual').toLowerCase();
  return INSP_FREQ_MAP[rawFreq] || 'Annual';
}

// ─────────────────────────────────────────────────────────────────────────────
// updateInspectionSchedule — non-blocking, fire-and-forget.
// data: result of collectAllData()
// ─────────────────────────────────────────────────────────────────────────────
async function updateInspectionSchedule(data) {
  const propertyName  = data.property?.name || '';
  const acctNum       = data.property?.acct || '';
  const dateCompleted = data.inspection?.date || '';
  const sysKey        = data.inspectionSystem || activeInspectionSystem || '';

  if (!propertyName) {
    console.warn('[Schedule] No property name — skipping schedule update');
    return;
  }
  if (!dateCompleted) {
    console.warn('[Schedule] No inspection date — skipping schedule update');
    return;
  }
  if (!sysKey) {
    console.warn('[Schedule] No inspection system — skipping schedule update');
    return;
  }

  const inspectionType = INSP_SYS_TYPE_MAP[sysKey];
  if (!inspectionType) {
    console.log(`[Schedule] System "${sysKey}" is not tracked in the schedule — skipping`);
    return;
  }

  // Sprinkler has its own report-type field; all others use the main one
  const frequency = inspectionFrequency(data);

  const updates = [{ propertyName, acctNum, inspectionType, dateCompleted, frequency, source: 'Inspection' }];

  console.log(`[Schedule] Appending → ${propertyName} | ${inspectionType} | ${frequency} | ${dateCompleted}`);

  try {
    await appendInspectionHistory(updates);
    console.log(`[Schedule] ✓ History row appended: ${inspectionType} for ${propertyName}`);
  } catch(e) {
    console.warn('[Schedule] History append failed:', e.message);
  }
}
