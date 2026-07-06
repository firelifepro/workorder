#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// One-off: merge Door / Unit ID / Height / SN from the Sloan's Lake "Fire
// Extinguisher Master Inspection Sheet" into the property-profile JSON.
//
// SAFE BY DESIGN:
//   • Only ADDS door/unitId/height/sn to each matched extinguisher.
//   • Never touches any existing field.
//   • Matches by LOCATION (normalized), with an explicit ALIAS map for the
//     units the sheet renamed (LC↔PAM, SHC↔White box, abbreviations, etc.).
//   • Anything it can't match confidently is LEFT BLANK and printed in a
//     "NEEDS MANUAL" report — no guessed serials, ever.
//
// USAGE:
//   node tools/merge-sloans-ext.js <input.json> [output.json]
//   (defaults: input "FLPS_Profile_85_Sloans_Lake_Medical_Center.json",
//              output "<input>.MERGED.json")
//
// Serial numbers below were transcribed from PHOTOS of the sheet — VERIFY them
// against the paper (a few 8-digit SNs sit one digit apart). Rows 1–31 (page 1,
// floors 8–3) are pending a straight-on re-shoot and are intentionally omitted;
// those units will show up under NEEDS MANUAL until added here.
// ─────────────────────────────────────────────────────────────────────────────

const fs = require('fs');

const norm = (s) => String(s || '').toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim();

// ── Sheet transcription (rows 32–121). Keyed by the SHEET's location text. ──
// [ sheetLocation, door, unitId, height, sn ]
const SHEET = [
  ['3rd floor west stair C', '3SC', '3-06', '56"', 'H-19223357'],
  ['M3 3rd floor roof', '3M3', '3-07', '45"', 'H-22587751'],
  ['3rd floor south near dialysis', '341', '3-08', '55"', 'H-96866555'],
  ['3rd floor south stair B', '3SB', '3-09', '55"', 'H-22587716'],
  ['2nd floor north stair A', '2SA', '2-01', '55"', 'H-22587733'],
  ['2nd floor near room 212', '212', '2-02', '48"', 'F-91669356'],
  ['Pharmacy', '216', '2-03', '58.5"', 'H-22587685'],
  ['2nd floor electrical room', '222', '2-04', '49"', 'H-22587742'],
  ['2nd floor center hall', '222', '2-05', '57"', 'H-22587741'],
  ['2nd floor south stair B', '2SB', '2-06', '54"', 'H-22587673'],
  ['2nd floor radiology', '221A', '2-07', '47"', 'I-20542835'],
  ['2nd floor west stair C', '2SC', '2-08', '56"', 'H-22587682'],
  ["2nd floor PACU nurses' station", '236A', '2-09', '43"', 'H-22587702'],
  ['2nd floor PACU east corridor', '2PACUE', '2-10', '43"', 'H-22587693'],
  ['2nd floor northwest stair D', '2SD', '2-11', '58"', 'F-91669338'],
  ['2nd floor west corridor near ICU 8', '264', '2-12', '44"', 'H-22587692'],
  ['2nd floor ICU electrical room', '264', '2-13', '46"', 'H-22587746'],
  ['2nd floor corridor to ICU', '236', '2-14', '58"', 'H-96866551'],
  ['1st floor south stair B', '1SB', '1-01', '55"', 'H-96866552'],
  ['Kitchen PAM near elevator 6', 'EL-6', '1-03', '59"', 'H-96866562'],
  ['Kitchen PAM near hood system', 'SWE', '1-04', '52"', 'H-19961612'],
  ['Kitchen PAM near sink/disposal', 'L1005', '1-05', '56"', 'H-22587705'],
  ['Kitchen PAM near dishwasher', 'L1015C', '1-06', '57"', 'H-96866550'],
  ['1st floor east lobby', 'EE1', '1-07', '53"', 'H-22587684'],
  ['White box south by entry', 'SCHE1', '1-08', '56"', 'CONSTRUCTION'],
  ['White box west', '1158', '1-09', '98"', 'CONSTRUCTION'],
  ['White box east', '1151', '1-11', '37"', 'CONSTRUCTION'],
  ['White box north by stair A', '1SA', '1-12', '56"', 'CONSTRUCTION'],
  ['1st floor north drive up entry', '1122', '1-14', '56"', 'H-96866549'],
  ['1st floor northwest stair D', '1SD', '1-15', '57"', 'F-19166946'],
  ['1st floor SLR across from rehab gym', '1004', '1-16', '48"', 'I-28694857'],
  ['1st floor SLR in rehab gym by room 102', '1020', '1-17', '48"', 'I-26754176'],
  ['1st floor SLR in housekeeping', '1016', '1-18', '54"', 'I-26754178'],
  ['1st floor SLR across from water heater', '1010', '1-19', '48"', 'I-26754182'],
  ['1st floor SCL cancer center hall', '1000-RR', '1-21', '48"', 'CONSTRUCTION'],
  ['1st floor SLR electrical closet 1', '1001', '1-22', '53"', 'I-26754180'],
  ['1st floor by employee entrance/security', '1000A', '1-23', '48"', 'I-26754153'],
  ['1st floor SLR electrical closet 2', '1028', '1-24', '54"', 'I-28694871'],
  ['1st floor SLR near southwest exit', '1034', '1-25', '48"', 'I-26754156'],
  ['Kitchen SLR across from sink', '1012', '1-26', '54"', 'H-19961596'],
  ['Kitchen SLR near storage', '1012', '1-27', '55"', 'H-19961597'],
  ['1st floor west lobby', 'WE1', '1-28', '54"', 'H-22587752'],
  ['1st floor west stair C', '1SC', '1-29', '55"', 'H-96866495'],
  ['Basement dock door', 'DD', 'B-01', '50"', 'H-22587714'],
  ['Basement M1 south cabinet', 'M1', 'B-02', '59"', 'H-22587696'],
  ['Basement M1 phone room', 'B-33', 'B-03', '56"', 'G-02323193'],
  ['IT Office', 'B-33', 'B-03a', '54"', 'H-96866542'],
  ['Basement corridor near M1', 'B-11', 'B-04', '58"', 'H-19223341'],
  ['Basement paint supply room B-11 hall', 'B-34', 'B-05', '49"', 'H-22687713'],
  ['Basement M1 north cabinet', 'M1', 'B-06', '57"', 'H-19223303'],
  ['Main electrical room east door', 'Elec 1', 'B-07', '52"', 'H-22587734'],
  ['Main electrical room north door', 'Elec 1', 'B-08', '51"', 'H-22587744'],
  ['Basement outside maintenance shop', 'BSCFD', 'B-09', '55"', 'H-96866565'],
  ['Maintenance shop breakroom', 'B-2', 'B-10', '54"', 'H-96866496'],
  ['Basement M2 north', 'M2', 'B-11', '58"', 'F-91669337'],
  ['Basement M2 south', 'M2', 'B-12', '59"', 'F-91669360'],
  ['Maintenance shop workspace', 'B-35', 'B-14', '51"', 'G-02323180'],
  ['Basement PAM central supply', '068', 'B-15', '54"', 'H-22587747'],
  ['Basement PAM maintenance', '067', 'B-16', '54"', 'H-22587726'],
  ['Basement near housekeeping', '064', 'B-17', '52"', 'H-22587704'],
  ['Basement dry storage', 'B-18', 'B-18', '48"', 'H-96866564'],
  ['Basement boiler room on column', 'BR1', 'B-19', '49"', 'G-02323162'],
  ['Basement boiler room in chiller room', 'BR2', 'B-20', '59"', 'H-19223364'],
  ['Basement boiler room hall', 'B-30', 'B-21', '56"', 'H-22587743'],
  ['Basement refrigerant room', 'B-31', 'B-22', '57"', 'H-22587736'],
  ['Basement SLR laundry room by washer', 'B-14C', 'B-23', '59"', 'I-26754165'],
  ['Basement SLR laundry room by dryers', 'B-14B', 'B-24', '51"', 'I-28694868'],
  ['Basement SLR laundry room mechanic', 'B-14A', 'B-25', '52"', 'G-02323164'],
  ['Basement near building managers office', '062', 'B-26', '58"', 'H-96866543'],
  ['Basement west stair C', 'BSC', 'B-27', '56"', 'H-22587718'],
  ['Basement NSM by entry', '027', 'B-33', '55"', 'H-96866498'],
  ['Basement NSM west exit', '031', 'B-28', '54"', 'H-19223318'],
  ['Basement near electrical closet 035', '035', 'B-29', '54"', 'I-26754181'],
  ['Basement Geller storage', '003', 'B-30', '59"', 'G-02323222'],
  ['Basement northwest stair D', 'BSD', 'B-31', '58"', 'F-91669361'],
  ['Basement Dashr hall', '045', 'B-32', '59"', 'H-22587674'],
  ['Basement west storage', '022', 'B-34', '58"', 'G-02323184'],
  ['Welding cart', 'BR1', 'C-01', 'N/A', 'G-02323199'],
  ['maintenance shop parts cart', 'BR1', 'C-02', 'N/A', 'G-02323190'],
  ['Dupler 1st floor', 'D26', 'D-01', '52"', 'H-96866567'],
  ['Dupler basement', 'D18', 'D-02', '48"', 'I-26754174'],
  ['Main electrical room main disconnect', 'Elec 2', 'E-01', '51"', 'H-22587694'],
  ['Main electrical room transfer switch', 'Elec 3', 'E-02', '48"', 'H-22587695'],
  ['Generator west', 'GEN', 'G-01', '58"', 'H-22587711'],
  ['Generator east', 'GEN', 'G-02', '58"', 'H-22587717'],

  // ── Page 1 (rows 1–31, floors 8→3). Keyed by the JSON's exact location text
  // (these are unique and align 1:1 with the sheet by Unit ID), so they match
  // directly with no alias. Doors on some stair units were the hardest to read —
  // verify Door + SN against the paper. ──
  ['8TH FLOOR WEST STAIR C', 'M8D1', '8-01', '41"', 'H-38340104'],
  ['8TH FLOOR MECHANICAL ROOM', 'M8D2', '8-02', '53"', 'H-22587703'],
  ['7TH FLOOR WEST STAIR C', 'M7D1', '7-01', '51"', 'H-96866557'],
  ['7TH FLOOR PENTHOUSE', 'M7D2', '7-02', '45"', 'H-22487750'],
  ['7TH FLOOR SOUTH MECH ROOM', '7SE', '7-03', '58"', 'H-96866561'],
  ['7TH FLOOR S MECH ROOM ELEVATOR', '7SE', '7-04', '50"', 'H-96866560'],
  ['7TH FLOOR NORTH MECH. ROOM', '7NE', '7-05', '59"', 'H-22587725'],
  ['7TH FLOOR N MECH. ROOM ELEVATOR', '7NE', '7-06', '56"', 'H-22587735'],
  ['7TH FLOOR CHILLER ROOM', '7CH', '7-07', '56"', 'H-19223304'],
  ['6TH FLOOR NORTH STAIR A', '6034', '6-01', '48"', 'H-96866545'],
  ['6TH FLOOR IN ELECTRICAL CLOSET', '6029', '6-02', '56"', 'H-22587715'],
  ['6TH FLOOR CENTER HALL', '6029', '6-03', '56"', 'H-19223335'],
  ['6TH FLOOR WEST STAIR C', '6SC', '6-04', '56"', 'H-19223327'],
  ['6TH FLOOR SOUTH STAIR B', '6SB', '6-05', '55"', 'H-22587719'],
  ['5TH FLOOR NORTH STAIR A', '5SA', '5-01', '55"', 'I-28694860'],
  ['5TH FLOOR IN ELECTRICAL CLOSET', '5029', '5-02', '55"', 'I-26754173'],
  ['5TH FLOOR CENTER HALL', '5029', '5-03', '56"', 'I-26754155'],
  ['5TH FLOOR WEST STAIR C', '5SC', '5-04', '54"', 'I-28694876'],
  ['5TH FLOOR SOUTH STAIR B', '5SB', '5-05', '55"', 'I-26754164'],
  ['4TH FLOOR NORTH STAIR A', '4SA', '4-01', '55"', 'H-96866558'],
  ['4TH FLOOR NEAR ROOM 414', '414', '4-02', '55"', 'F-91669333'],
  ['4TH FLOOR ELECTRICAL ROOM', '429', '4-03', '53"', 'H-22587738'],
  ['4TH FLOOR CENTER HALL', '429', '4-04', '57"', 'H-19223362'],
  ['4TH FLOOR CONFERENCE ROOM', '452', '4-05', '55"', 'H-96866572'],
  ['4TH FLOOR WEST STAIR C', '4SC', '4-06', '55"', 'H-22587748'],
  ['4TH FLOOR SOUTH STAIR B', '4SB', '4-07', '56"', 'H-22587706'],
  ['3RD FLOOR NORTH STAIR A', '3SA', '3-01', '58"', 'H-96866571'],
  ['3RD FLOOR NEAR ROOM 314', '314', '3-02', '56"', 'H-96866544'],
  ['3RD FLOOR ELECTRICAL ROOM', '328', '3-03', '49"', 'H-22587668'],
  ['3RD FLOOR CENTER HALL', '328', '3-04', '56"', 'H-96866569'],
  ['3RD FLOOR WEST REHAB', '340', '3-05', '58"', 'H-22587676'],
  // The 5 "Maintenance shop" SPARES (117–121) are intentionally NOT mapped —
  // the JSON's spares are "SPARES/PUMP ROOM" (a different location), so they'd
  // be a guess. Add them by hand if desired.
];

// JSON location  →  Sheet location, for units the sheet renamed. Only pairings
// confident from floor order + the photos are listed; genuinely ambiguous units
// (e.g. "BASEMENT MORGUE WEST CORRIDOR", "OUTSIDE SLR CENTER") are deliberately
// omitted so they land in NEEDS MANUAL rather than get a guessed serial.
const ALIAS = {
  'DIALYSIS / RESTROOM HALL': '3rd floor south near dialysis',
  'KITCHEN LC NEAR ELEVATOR 6': 'Kitchen PAM near elevator 6',
  'KITCHEN LC NEAR HOOD SYSTEM': 'Kitchen PAM near hood system',
  'KITCHEN LC NEAR SINK/DISPOSAL': 'Kitchen PAM near sink/disposal',
  'KITCHEN LC NEAR DISHWASHER': 'Kitchen PAM near dishwasher',
  'SHC SOUTH': 'White box south by entry',
  'SHC WEST': 'White box west',
  'SHC EAST': 'White box east',
  'SHC NORTH STAIR A': 'White box north by stair A',
  '1ST FLOOR NORTH AUTO DOORS': '1st floor north drive up entry',
  '1ST FLOOR SLR BY WATER HEATER': '1st floor SLR across from water heater',
  '1ST FLOOR SLR BY EMPLOYEE ENTRANCE': '1st floor by employee entrance/security',
  'BASEMENT PAINT SUPPLY RM B-11 HALL': 'Basement paint supply room B-11 hall',
  'MAIN ELECTRICAL ROOM E DOOR': 'Main electrical room east door',
  'MAIN ELECTRICAL ROOM N DOOR': 'Main electrical room north door',
  'BASEMENT OUTSIDE MAINT. SHOP': 'Basement outside maintenance shop',
  'BASEMENT LC CENTRAL SUPPLY': 'Basement PAM central supply',
  'BASEMENT LC MAINTENANCE': 'Basement PAM maintenance',
  'BASEMENT BOILER ROOM COLUMN': 'Basement boiler room on column',
  'BASEMENT LAUNDRY ROOM BY WASHERS': 'Basement SLR laundry room by washer',
  'BASEMENT LAUNDRY ROOM BY DRYERS': 'Basement SLR laundry room by dryers',
  'BASEMENT LAUNDRY ROOM MECHANICAL': 'Basement SLR laundry room mechanic',
  'BASEMENT BY BLDG MANAGERS OFFICE': 'Basement near building managers office',
  'BASEMENT NORTH WEST STAIR D': 'Basement northwest stair D',
  '2ND FLOOR NORTH WEST STAIR D': '2nd floor northwest stair D',
  '1ST FLOOR NORTH WEST STAIR D': '1st floor northwest stair D',
  '1ST FLOOR SLR NEAR SOUTH WEST EXIT': '1st floor SLR near southwest exit',
  'MAIN ELEC ROOM MAIN DISCONNECT': 'Main electrical room main disconnect',
  'MAIN ELECTRICAL ROOM GEN TRANSFER': 'Main electrical room transfer switch',
};

// ── Build lookup, guarding against duplicate sheet locations ──
const byLoc = new Map();
for (const [loc, door, unitId, height, sn] of SHEET) {
  const k = norm(loc);
  if (byLoc.has(k)) { console.warn('⚠ Duplicate sheet location, second ignored:', loc); continue; }
  byLoc.set(k, { door, unitId, height, sn, sheetLoc: loc });
}

// ── Load profile ──
const inPath  = process.argv[2] || 'FLPS_Profile_85_Sloans_Lake_Medical_Center.json';
const outPath = process.argv[3] || inPath.replace(/\.json$/i, '') + '.MERGED.json';
const profile = JSON.parse(fs.readFileSync(inPath, 'utf8'));
const exts = profile?.lastInspBySystem?.hospital?.extinguishers;
if (!Array.isArray(exts)) { console.error('✗ No lastInspBySystem.hospital.extinguishers array found.'); process.exit(1); }

const used = new Set();
let matched = 0;
const needManual = [];

exts.forEach((e, i) => {
  const jsonLoc = e.loc || e.location || '';
  const target = ALIAS[jsonLoc] ? norm(ALIAS[jsonLoc]) : norm(jsonLoc);
  const hit = byLoc.get(target);
  if (!hit) { needManual.push(`#${i + 1}  "${jsonLoc}"  — no sheet match`); return; }
  if (used.has(target)) { needManual.push(`#${i + 1}  "${jsonLoc}"  — sheet row already used (ambiguous), skipped`); return; }
  used.add(target);
  e.door = hit.door;
  e.unitId = hit.unitId;
  e.height = hit.height;
  e.sn = hit.sn;
  matched++;
});

fs.writeFileSync(outPath, JSON.stringify(profile, null, 2));

// ── Report ──
console.log(`\n✓ Wrote ${outPath}`);
console.log(`  Extinguishers: ${exts.length}`);
console.log(`  Filled (door/unitId/height/sn): ${matched}`);
console.log(`  Left blank (need manual): ${needManual.length}`);
const unusedSheet = [...byLoc.entries()].filter(([k]) => !used.has(k)).map(([, v]) => v.sheetLoc);
if (unusedSheet.length) console.log(`  Sheet rows never matched (${unusedSheet.length}): ${unusedSheet.join(' | ')}`);
console.log('\nNEEDS MANUAL (left blank — fill from the sheet by hand):');
needManual.forEach(l => console.log('  ' + l));
console.log('\n⚠ VERIFY serials against the paper sheet before uploading — they were read from photos.');
