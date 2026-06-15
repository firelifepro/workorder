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

// ── buildInspectionMime ─────────────────────────────────────────────────────

test('mime contains To, Subject, the body text, and the attachment filename', () => {
  const raw = buildInspectionMime('owner@example.com', 'Test Subject', 'Hello body — café',
    [{ name: 'FLPS_sprinkler_Acme_2026-06-15.pdf', b64: 'JVBERi0xLjQ=' }]);
  const msg = decodeRaw(raw);
  assert.ok(msg.includes('To: owner@example.com'));
  assert.ok(msg.includes('Subject: Test Subject'));
  assert.ok(msg.includes('multipart/mixed'));
  assert.ok(msg.includes('filename="FLPS_sprinkler_Acme_2026-06-15.pdf"'));
  // body is base64-encoded in its part; decode that part to confirm UTF-8 survives
  const bodyB64 = Buffer.from('Hello body — café', 'utf8').toString('base64');
  assert.ok(msg.includes(bodyB64));
});

test('raw is base64url (no +, /, or = padding)', () => {
  const raw = buildInspectionMime('a@b.com', 'S', 'B', []);
  assert.ok(!/[+/=]/.test(raw));
});
