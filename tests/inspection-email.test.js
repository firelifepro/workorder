'use strict';
const { buildInspectionMime, defaultInspectionEmail } = require('../js/inspection-email.js');

// Decode the base64url `raw` field back into the RFC-2822 message text.
function decodeRaw(raw) {
  const b64 = raw.replace(/-/g, '+').replace(/_/g, '/');
  return Buffer.from(b64, 'base64').toString('utf8');
}

// ── defaultInspectionEmail ──────────────────────────────────────────────────

test('subject includes property, system label, and date', () => {
  const { subject } = defaultInspectionEmail({ propertyName: 'Acme Tower', systemLabel: 'Sprinkler System', date: '2026-06-15' });
  assert.ok(subject.includes('Acme Tower'));
  assert.ok(subject.includes('Sprinkler System'));
  assert.ok(subject.includes('2026-06-15'));
});

test('body greets the contact by first name when present', () => {
  const { body } = defaultInspectionEmail({ propertyName: 'Acme', contactName: 'Jane Doe' });
  assert.ok(body.startsWith('Hi Jane,'));
});

test('body falls back to a generic greeting with no contact', () => {
  const { body } = defaultInspectionEmail({ propertyName: 'Acme' });
  assert.ok(body.startsWith('Hello,'));
});

test('compliant body states the overall status and includes the job location, system + frequency', () => {
  const { body, subject } = defaultInspectionEmail({
    propertyName: 'Strip Plaza - 3985 Tennyson', contactName: 'Mike Jones',
    systemLabel: 'Fire Extinguishers', frequency: 'Annual', date: '2026-05-07',
    serviceAddress: '3985 Tennyson St, Denver', overallStatus: 'COMPLIANT', deficiencies: [],
  });
  assert.ok(body.includes('completed Fire Extinguishers Annual inspection report for Strip Plaza - 3985 Tennyson, dated 2026-05-07.'));
  assert.ok(body.includes('Job Location: 3985 Tennyson St, Denver'));
  assert.ok(body.includes('The report has an overall status of Compliant'));
  assert.ok(!/Deficiencies/i.test(body));
  assert.ok(subject.includes('Fire Extinguishers Annual'));
});

test('deficient body lists the deficiencies and invites scheduling repairs', () => {
  const { body } = defaultInspectionEmail({
    propertyName: 'Acme', contactName: 'Mike', systemLabel: 'Fire Extinguishers', frequency: 'Annual',
    overallStatus: 'DEFICIENT',
    deficiencies: [{ item: 'Extinguisher #3 - Lobby', description: 'Recharge required' }, 'Exit Sign - Stairwell B (Unit #2)'],
  });
  assert.ok(body.includes('The report has an overall status of Deficient with Deficiencies listed at the top of the report as follows:'));
  assert.ok(body.includes('     1. Extinguisher #3 - Lobby: Recharge required'));
  assert.ok(body.includes('     2. Exit Sign - Stairwell B (Unit #2)'));
  // Blank line between the last deficiency and the "reach out" line.
  assert.ok(body.includes('(Unit #2)\n\nPlease reach out'));
  assert.ok(body.includes('schedule repairs'));
});

// ── buildInspectionMime ─────────────────────────────────────────────────────

test('mime contains To, Cc, Subject, the body text, and the attachment filename', () => {
  const raw = buildInspectionMime('owner@example.com', 'cc1@example.com, cc2@example.com', 'Test Subject', 'Hello body — café',
    [{ name: 'FLPS_sprinkler_Acme_2026-06-15.pdf', b64: 'JVBERi0xLjQ=' }]);
  const msg = decodeRaw(raw);
  assert.ok(msg.includes('To: owner@example.com'));
  assert.ok(msg.includes('Cc: cc1@example.com, cc2@example.com'));
  assert.ok(msg.includes('Subject: Test Subject'));
  assert.ok(msg.includes('multipart/mixed'));
  assert.ok(msg.includes('filename="FLPS_sprinkler_Acme_2026-06-15.pdf"'));
  // body is base64-encoded in its part; decode that part to confirm UTF-8 survives
  const bodyB64 = Buffer.from('Hello body — café', 'utf8').toString('base64');
  assert.ok(msg.includes(bodyB64));
});

test('Cc header is omitted when no cc is given', () => {
  const raw = buildInspectionMime('owner@example.com', '', 'S', 'B', []);
  assert.ok(!decodeRaw(raw).includes('Cc:'));
});

test('non-ASCII subject (em dash) is RFC 2047 encoded, not raw UTF-8', () => {
  const subject = 'FLPS Inspection Report — Café Plaza — Exit Sign (2026-05-01)';
  const msg = decodeRaw(buildInspectionMime('a@b.com', '', subject, 'B', []));
  // Header carries an encoded-word, and the raw "—"/"é" bytes are NOT in the header.
  const subjLine = msg.split('\r\n').find(l => l.startsWith('Subject:'));
  assert.ok(subjLine.startsWith('Subject: =?UTF-8?B?'));
  assert.ok(!subjLine.includes('—') && !subjLine.includes('é'));
  // And it round-trips back to the original subject.
  const b64 = subjLine.match(/=\?UTF-8\?B\?(.*)\?=/)[1];
  assert.strictEqual(Buffer.from(b64, 'base64').toString('utf8'), subject);
});

test('raw is base64url (no +, /, or = padding)', () => {
  const raw = buildInspectionMime('a@b.com', '', 'S', 'B', []);
  assert.ok(!/[+/=]/.test(raw));
});
