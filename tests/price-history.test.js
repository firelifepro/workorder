'use strict';
const {
  phIsRateable, phComboKey, phParseAmount, phAvg, phMedian,
  phTruncateBytes, phParseRowValues, phComputeStats,
} = require('../js/flips-price-history.js');

// NOTE: service names use the en-dash (–) exactly as the index.html
// checkbox values do — that's the exact-match key.

// ── small helpers ─────────────────────────────────────────────────────────────

test('phIsRateable: inspections yes, one-offs no', () => {
  assert.strictEqual(phIsRateable('Sprinkler – Annual'), true);
  assert.strictEqual(phIsRateable('Fire Alarm – Quarterly'), true);
  assert.strictEqual(phIsRateable('5-Year FDC Hydrostatic Test'), true);
  assert.strictEqual(phIsRateable('Annual Backflow Prevention Test'), true);
  assert.strictEqual(phIsRateable('Repair / Service Call'), false);
  assert.strictEqual(phIsRateable('Deficiency Correction'), false);
  assert.strictEqual(phIsRateable('Other: replaced panel'), false);
  assert.strictEqual(phIsRateable(''), false);
});

test('phComboKey is order-insensitive and trims', () => {
  assert.strictEqual(
    phComboKey(['Sprinkler – Annual', 'Fire Alarm – Annual']),
    phComboKey([' Fire Alarm – Annual ', 'Sprinkler – Annual'])
  );
  assert.strictEqual(phComboKey(['A', '', 'B']), 'A|B');
});

test('phParseAmount strips $ and commas', () => {
  assert.strictEqual(phParseAmount('$1,234.50'), 1234.5);
  assert.strictEqual(phParseAmount('450'), 450);
  assert.strictEqual(phParseAmount(''), null);
  assert.strictEqual(phParseAmount('N/A'), null);
});

test('phMedian: odd, even, empty', () => {
  assert.strictEqual(phMedian([3, 1, 2]), 2);
  assert.strictEqual(phMedian([1, 2, 3, 100]), 2.5);
  assert.strictEqual(phMedian([]), null);
});

test('phAvg', () => {
  assert.strictEqual(phAvg([100, 200]), 150);
  assert.strictEqual(phAvg([]), null);
});

test('phTruncateBytes respects UTF-8 byte length', () => {
  assert.strictEqual(phTruncateBytes('short', 100), 'short');
  const long = 'Fire Alarm – Annual | Sprinkler – Annual | Extinguisher – Annual | Exit Light – Annual | Hood Inspection – Annual';
  const cut = phTruncateBytes(long, 60);
  assert.ok(new TextEncoder().encode(cut).length <= 60);
  assert.ok(cut.endsWith('…'));
});

test('phParseRowValues maps sheet columns', () => {
  const r = phParseRowValues(
    ['2025-03-10', '214', 'Oak Plaza', 'FLPS-042', 'AP@LCP.COM', 'LCP Mgmt',
     'Sprinkler – Annual | Fire Alarm – Annual', '2', '850', 'Yes',
     'backfill', '1044', '850', '2026-07-15T00:00:00Z'], 7);
  assert.strictEqual(r.rowNum, 7);
  assert.strictEqual(r.billingEmail, 'ap@lcp.com');   // lowercased group key
  assert.deepStrictEqual(r.services, ['Sprinkler – Annual', 'Fire Alarm – Annual']);
  assert.strictEqual(r.total, 850);
  assert.strictEqual(r.fixedRate, true);
  assert.strictEqual(r.source, 'backfill');
  assert.strictEqual(r.qbAmount, 850);
});

// ── phComputeStats ────────────────────────────────────────────────────────────

const mk = (over) => Object.assign({
  date: '2025-01-01', lineNum: '100', property: 'Oak Plaza', acctNum: 'A1',
  billingEmail: 'ap@lcp.com', services: ['Sprinkler – Annual'], total: 450,
  source: 'live', qbInvoice: '', qbAmount: null,
}, over);

const CTX = {
  services: ['Sprinkler – Annual'], acctNum: 'A1',
  billingEmail: 'AP@lcp.com', propertyName: 'Oak Plaza',
};

test('stats: property / group / all tiers from single-service rows', () => {
  const rows = [
    mk({ lineNum: '1', total: 450, date: '2025-03-01' }),                                    // this property
    mk({ lineNum: '2', total: 430, acctNum: 'A2', property: 'Elm Court' }),                  // same group
    mk({ lineNum: '3', total: 400, acctNum: 'A3', property: 'Far Away', billingEmail: 'x@y.com' }), // all only
  ];
  const s = phComputeStats(rows, CTX).services[0];
  assert.strictEqual(s.rateable, true);
  assert.strictEqual(s.property.length, 1);
  assert.strictEqual(s.property[0].total, 450);
  assert.deepStrictEqual({ n: s.group.n, avg: s.group.avg }, { n: 2, avg: 440 });
  assert.strictEqual(s.all.n, 3);
});

test('stats: aggregates count distinct properties', () => {
  const rows = [
    mk({ lineNum: '1', total: 400 }),
    mk({ lineNum: '2', total: 500 }),                                   // same property
    mk({ lineNum: '3', total: 450, acctNum: 'A2', property: 'Elm Court' }),
  ];
  const s = phComputeStats(rows, CTX).services[0];
  assert.strictEqual(s.all.n, 3);
  assert.strictEqual(s.all.props, 2);
});

test('stats: QB-reconciled amount supersedes the work-order total', () => {
  const rows = [
    mk({ lineNum: '1', total: 500, qbAmount: 525, source: 'qb-reconciled' }),
    mk({ lineNum: '2', total: 475 }),   // no QB amount → WO total stands
  ];
  const s = phComputeStats(rows, CTX).services[0];
  assert.strictEqual(s.all.avg, 500);   // (525 + 475) / 2 — not (500 + 475) / 2
  const latest = s.property.find(e => e.lineNum === '1');
  assert.strictEqual(latest.total, 525);
});

test('stats: multi-service rows are excluded from per-service math', () => {
  const rows = [
    mk({ lineNum: '1', total: 450 }),
    mk({ lineNum: '2', total: 9999, services: ['Sprinkler – Annual', 'Fire Alarm – Annual'] }),
  ];
  const s = phComputeStats(rows, CTX).services[0];
  assert.strictEqual(s.all.n, 1);
  assert.strictEqual(s.all.avg, 450);
});

test('stats: zero/blank totals and empty services are ignored', () => {
  const rows = [mk({ total: 0 }), mk({ services: [] }), mk({ total: 500, lineNum: '9' })];
  const s = phComputeStats(rows, CTX).services[0];
  assert.strictEqual(s.all.n, 1);
});

test('stats: one-off services get no averages, only recent examples', () => {
  const ctx = Object.assign({}, CTX, { services: ['Repair / Service Call'] });
  const rows = [
    mk({ lineNum: '1', services: ['Repair / Service Call'], total: 300, date: '2025-02-01' }),
    mk({ lineNum: '2', services: ['Repair / Service Call'], total: 1200, acctNum: 'A2', property: 'Elm Court', date: '2025-04-01' }),
  ];
  const s = phComputeStats(rows, ctx).services[0];
  assert.strictEqual(s.rateable, false);
  assert.strictEqual(s.group, null);
  assert.strictEqual(s.all, null);
  assert.strictEqual(s.property.length, 1);       // this property's own one-off
  assert.strictEqual(s.groupRecent.length, 2);    // examples, sorted desc by date
  assert.strictEqual(s.groupRecent[0].total, 1200);
});

test('stats: property matched by acct # even when name differs', () => {
  const rows = [mk({ property: 'Oak Plaza (fka Oakwood)', acctNum: 'A1' })];
  const s = phComputeStats(rows, CTX).services[0];
  assert.strictEqual(s.property.length, 1);
});

test('stats: group key is case-insensitive billing email', () => {
  const rows = [mk({ acctNum: 'A2', property: 'Elm Court', billingEmail: 'ap@lcp.com' })];
  const s = phComputeStats(rows, Object.assign({}, CTX, { billingEmail: 'AP@LCP.com' })).services[0];
  assert.strictEqual(s.group.n, 1);
});

test('stats: combo matches exact service sets, same property first', () => {
  const ctx = Object.assign({}, CTX, { services: ['Sprinkler – Annual', 'Fire Alarm – Annual'] });
  const rows = [
    mk({ lineNum: '1', services: ['Fire Alarm – Annual', 'Sprinkler – Annual'], total: 850,
         acctNum: 'A2', property: 'Elm Court', date: '2025-06-01' }),
    mk({ lineNum: '2', services: ['Sprinkler – Annual', 'Fire Alarm – Annual'], total: 800, date: '2024-01-01' }),
    mk({ lineNum: '3', services: ['Sprinkler – Annual'], total: 450 }),   // not the combo
  ];
  const { combo } = phComputeStats(rows, ctx);
  assert.strictEqual(combo.n, 2);
  assert.strictEqual(combo.entries[0].lineNum, '2');   // same property outranks recency
  assert.strictEqual(combo.entries[1].lineNum, '1');
});

test('stats: no combo section for a single service', () => {
  assert.strictEqual(phComputeStats([mk({})], CTX).combo, null);
});
