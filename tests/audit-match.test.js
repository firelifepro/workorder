'use strict';
// Tests for inspection-audit.html Phase-1 report→property matching.
// Regression: a report saved with a SHORT property name must still match a
// master whose NAME is a long concatenated string (city / zip / "…, LLC").
const { auditTokens, filePropTokens, propFileScore } = require('./helpers');

// Score a filename against a property {name, addr} the way matchReports() does.
function score(name, addr, fileName) {
  return propFileScore(
    auditTokens(name),
    auditTokens(addr),
    filePropTokens(fileName),
    auditTokens(fileName)
  );
}

// The real 2555 S. Sante Fe master row (name carries city/zip/entity tokens the
// short-named fire-alarm report never included).
const SANTE_NAME = '2555 S. Sante Fe,  Denver, CO 80223,  2555 South Sante Fe, LLC';
const SANTE_ADDR = '2555 S. Sante Fe Denver, CO 80223';

test('short-named fire-alarm report matches long concatenated master name', () => {
  const s = score(SANTE_NAME, SANTE_ADDR,
    'FLPS_fire_alarm_Annual_2555_S_Sante_Fe_2555_S_Sante_Fe_2026-06-14.pdf');
  assert.ok(s > 0, 'expected a match, got ' + s);
});

test('the old name-only gate would have missed it (documents the bug)', () => {
  // nOv = fraction of master NAME tokens present in the filename.
  const nameToks = auditTokens(SANTE_NAME);
  const fileToks = auditTokens(
    'FLPS_fire_alarm_Annual_2555_S_Sante_Fe_2555_S_Sante_Fe_2026-06-14.pdf');
  const nOv = nameToks.filter(t => fileToks.includes(t)).length / nameToks.length;
  assert.ok(nOv < 0.6, 'name-only overlap should be under the old 0.6 gate, was ' + nOv);
});

test('long-named extinguisher report still matches the same property', () => {
  const s = score(SANTE_NAME, SANTE_ADDR,
    'FLPS_extinguisher_Annual_2555_S_Sante_Fe_Denver_CO_80223_2555_South_Sante_Fe_LLC_2555_2026-01-01_2.pdf');
  assert.ok(s > 0, 'expected a match, got ' + s);
});

test('externally-sourced (EXT_) report matches after vendor segment is stripped', () => {
  const s = score(SANTE_NAME, SANTE_ADDR,
    'EXT_sprinkler_Annual_Martinez_2555_S_Sante_Fe_Denver_CO_80223_2555_South_Sante_Fe_LLC_2555_2026-05-20.pdf');
  assert.ok(s > 0, 'expected a match, got ' + s);
});

test('a single-token filename does not over-match (guards the containment gate)', () => {
  // Only "2555" survives as a property token — too weak to claim the property.
  const s = score(SANTE_NAME, SANTE_ADDR, 'FLPS_fire_alarm_Annual_2555_2026-06-14.pdf');
  assert.strictEqual(s, 0);
});

test('a different property does not match the Sante Fe report', () => {
  const s = score('1000 Broadway, Denver, CO 80203, Broadway Plaza, LLC',
    '1000 Broadway Denver, CO 80203',
    'FLPS_fire_alarm_Annual_2555_S_Sante_Fe_2555_S_Sante_Fe_2026-06-14.pdf');
  assert.strictEqual(s, 0);
});

test('the correct property outscores a same-street-number decoy', () => {
  const file = 'FLPS_fire_alarm_Annual_2555_S_Sante_Fe_2555_S_Sante_Fe_2026-06-14.pdf';
  const right = score(SANTE_NAME, SANTE_ADDR, file);
  // Same street number 2555 but a different street — should not win.
  const decoy = score('2555 N. Wynkoop, Denver, CO 80216, Wynkoop, LLC',
    '2555 N. Wynkoop Denver, CO 80216', file);
  assert.ok(right > decoy, 'correct=' + right + ' decoy=' + decoy);
});
