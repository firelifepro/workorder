'use strict';
const { statusDeficiencyMismatch } = require('../js/inspection-utils.js');

// ── consistent combinations return null ─────────────────────────────────────
test('COMPLIANT with zero deficiencies is consistent', () => {
  assert.strictEqual(statusDeficiencyMismatch('COMPLIANT', 0), null);
});

test('DEFICIENT with one or more deficiencies is consistent', () => {
  assert.strictEqual(statusDeficiencyMismatch('DEFICIENT', 1), null);
  assert.strictEqual(statusDeficiencyMismatch('DEFICIENT', 5), null);
});

test('IMPAIRED is never flagged (with or without deficiencies)', () => {
  assert.strictEqual(statusDeficiencyMismatch('IMPAIRED', 0), null);
  assert.strictEqual(statusDeficiencyMismatch('IMPAIRED', 3), null);
});

test('unset / empty status is never flagged', () => {
  assert.strictEqual(statusDeficiencyMismatch('', 4), null);
  assert.strictEqual(statusDeficiencyMismatch(null, 4), null);
  assert.strictEqual(statusDeficiencyMismatch(undefined, 0), null);
});

// ── mismatches return a message ─────────────────────────────────────────────
test('COMPLIANT with deficiencies is flagged', () => {
  const msg = statusDeficiencyMismatch('COMPLIANT', 2);
  assert.ok(msg && /COMPLIANT/.test(msg) && /2 items/.test(msg));
});

test('COMPLIANT with a single deficiency uses singular wording', () => {
  const msg = statusDeficiencyMismatch('COMPLIANT', 1);
  assert.ok(msg && /1 item\b/.test(msg) && !/1 items/.test(msg));
});

test('DEFICIENT with zero deficiencies is flagged', () => {
  const msg = statusDeficiencyMismatch('DEFICIENT', 0);
  assert.ok(msg && /DEFICIENT/.test(msg) && /no deficiencies/.test(msg));
});

// ── input coercion ──────────────────────────────────────────────────────────
test('status is matched case-insensitively', () => {
  assert.ok(statusDeficiencyMismatch('compliant', 1));
  assert.ok(statusDeficiencyMismatch('deficient', 0));
});

test('non-numeric deficiency count coerces to zero', () => {
  assert.strictEqual(statusDeficiencyMismatch('COMPLIANT', undefined), null);
  assert.ok(statusDeficiencyMismatch('DEFICIENT', undefined));
});
