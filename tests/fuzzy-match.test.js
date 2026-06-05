'use strict';
var helpers      = require('./helpers');
var scoreMatch   = helpers.scoreMatch;
var matchProperty = helpers.matchProperty;

// ─── scoreMatch ───────────────────────────────────────────────────────────────

test('exact property name match contributes 0.55 to score', function() {
  // A pure name match alone = 0.55; reaching the 0.85 auto-threshold also
  // requires date proximity and/or description overlap signals.
  var score = scoreMatch(
    { properties: ['Park Place Apartments'], description: '' },
    { property: 'Park Place Apartments', workReq: '' }
  );
  assert.ok(score >= 0.55, 'expected >= 0.55, got ' + score);
  assert.ok(score < 0.7,   'pure name-only match should not exceed ~0.55, got ' + score);
});

test('completely unrelated property scores near zero', function() {
  var score = scoreMatch(
    { properties: ['Ocean Tower'], description: 'plumbing repair' },
    { property: 'Mountain View',  workReq: 'fire alarm test' }
  );
  assert.ok(score < 0.2, 'expected < 0.2, got ' + score);
});

test('date within 7 days scores higher than date 60 days apart', function() {
  var closeScore = scoreMatch(
    { properties: ['Site A'], invoiceDate: '2025-01-10' },
    { property:   'Site A',  dateComp: '2025-01-12' }
  );
  var farScore = scoreMatch(
    { properties: ['Site A'], invoiceDate: '2025-01-10' },
    { property:   'Site A',  dateComp: '2025-03-15' }
  );
  assert.ok(closeScore > farScore, 'nearby date should score higher');
});

test('overlapping description and work-requested boosts score', function() {
  var withOverlap    = scoreMatch(
    { properties: [], description: 'sprinkler inspection service' },
    { property: 'building', workReq: 'annual sprinkler inspection' }
  );
  var withoutOverlap = scoreMatch(
    { properties: [], description: 'electrical panel upgrade' },
    { property: 'building', workReq: 'annual sprinkler inspection' }
  );
  assert.ok(withOverlap > withoutOverlap, 'description overlap should increase score');
});

test('already-paid row is penalised', function() {
  var unpaid = scoreMatch(
    { properties: ['Site A'] },
    { property: 'Site A', paid: '' }
  );
  var paid = scoreMatch(
    { properties: ['Site A'] },
    { property: 'Site A', paid: 'paid 2025-01-15' }
  );
  assert.ok(unpaid > paid, 'paid row should score lower');
});

test('score is always clamped between 0 and 1', function() {
  var score = scoreMatch(
    { properties: ['Park Place'], description: 'Park Place fire inspection', invoiceDate: '2025-01-01' },
    { property:   'Park Place',  workReq: 'fire inspection', dateComp: '2025-01-02' }
  );
  assert.ok(score >= 0 && score <= 1, 'out of range: ' + score);
});

// ─── matchProperty ────────────────────────────────────────────────────────────

var LIST = [
  { name: 'Park Place Apartments', address: '123 Main Street, Denver CO 80202' },
  { name: 'River Walk Condos',     address: '456 Oak Avenue, Denver CO 80203'  },
  { name: 'Mountain View Tower',   address: '789 Summit Road, Denver CO 80204' },
];

test('exact property name substring matches at high confidence', function() {
  var result = matchProperty('Park Place Apartments', '', LIST);
  assert.ok(result, 'should return a match');
  assert.strictEqual(result.name, 'Park Place Apartments');
  assert.ok(result.score >= 0.9, 'expected score >= 0.9, got ' + result.score);
});

test('address substring in email text resolves correct property', function() {
  // matchProperty requires the full first address line (including city/state) in the probe
  var result = matchProperty('', 'service needed at 456 Oak Avenue, Denver CO 80203', LIST);
  assert.ok(result, 'should find a match via address');
  assert.strictEqual(result.name, 'River Walk Condos');
});

test('unrelated text returns null', function() {
  var result = matchProperty('completely unrelated company name', 'nothing to match', LIST);
  assert.ok(result === null, 'should return null below threshold');
});

test('empty list always returns null', function() {
  assert.strictEqual(matchProperty('Park Place Apartments', '', []), null);
});

test('returned object includes score property', function() {
  var result = matchProperty('Park Place Apartments', '', LIST);
  assert.ok(typeof result.score === 'number', 'result.score should be a number');
});
