// ─────────────────────────────────────────────────────────────────────────────
// INSPECTION EMAIL — email the completed report PDF to the property owner
// ─────────────────────────────────────────────────────────────────────────────
// Used by inspection.html and hospital-inspection.html. After a report is saved,
// the save flow calls maybeEmailInspectionReport(): if the "email the owner"
// toggle is checked (default on) and we're connected to Google, it opens a quick
// review modal pre-filled with To / Subject / Body and the freshly-built PDF as
// an attachment. Clicking Send POSTs to Gmail's messages.send.
//
// Reuses the proven MIME builder from inspection-audit.html (buildMimeDraft), but
// SENDS (gmail.send) instead of creating a draft. Needs googleFetch + accessToken
// from js/inspection-google.js, so load this AFTER it.
(function () {
  'use strict';

  const SEND_URL = 'https://gmail.googleapis.com/gmail/v1/users/me/messages/send';

  // Build an RFC-2822 multipart/mixed message, base64url-encoded for Gmail's
  // messages.send `raw` field. Body + PDFs are base64 so any UTF-8 (—, •,
  // accented names) survives intact. Mirrors inspection-audit.html buildMimeDraft.
  function buildInspectionMime(to, cc, subject, body, attachments) {
    const boundary = 'flips_insp_' + Date.now();
    const L = [];
    if (to) L.push(`To: ${to}`);
    if (cc) L.push(`Cc: ${cc}`);
    L.push(`Subject: ${subject}`);
    L.push('MIME-Version: 1.0');
    L.push(`Content-Type: multipart/mixed; boundary="${boundary}"`);
    L.push('');
    L.push(`--${boundary}`);
    L.push('Content-Type: text/plain; charset="UTF-8"');
    L.push('Content-Transfer-Encoding: base64');
    L.push('');
    const bodyB64 = btoa(unescape(encodeURIComponent(body || '')));
    for (let i = 0; i < bodyB64.length; i += 76) L.push(bodyB64.slice(i, i + 76));
    L.push('');
    (attachments || []).forEach(a => {
      const safeName = (a.name || 'report.pdf').replace(/"/g, '');
      L.push(`--${boundary}`);
      L.push(`Content-Type: application/pdf; name="${safeName}"`);
      L.push('Content-Transfer-Encoding: base64');
      L.push(`Content-Disposition: attachment; filename="${safeName}"`);
      L.push('');
      for (let i = 0; i < a.b64.length; i += 76) L.push(a.b64.slice(i, i + 76));
      L.push('');
    });
    L.push(`--${boundary}--`);
    const rawMime = L.join('\r\n');
    return btoa(unescape(encodeURIComponent(rawMime)))
      .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }

  // Default subject + body for a single completed inspection report.
  function defaultInspectionEmail({ propertyName, contactName, systemLabel, date } = {}) {
    const prop = (propertyName || '').trim() || 'your property';
    const first = (contactName || '').trim().split(/\s+/)[0];
    const greeting = first ? `Hi ${first},` : 'Hello,';
    const sys = (systemLabel || '').trim() || 'fire & life-safety';
    const subject = `FLPS Inspection Report — ${(propertyName || '').trim() || 'Your Property'}`
      + (systemLabel ? ` — ${systemLabel}` : '')
      + (date ? ` (${date})` : '');
    const body = [
      greeting,
      '',
      `Attached is the completed ${sys} inspection report for ${prop}${date ? `, dated ${date}` : ''}.`,
      '',
      'Please keep this report on file for your records and for any authority-having-jurisdiction (AHJ) requests. '
        + 'If you have any questions, or would like to schedule corrective work for any noted deficiencies, just reply to this email.',
      '',
      'Thank you,',
      'Fire Life Protection Systems',
    ].join('\n');
    return { subject, body };
  }

  // Convert in-memory PDF bytes (Uint8Array | ArrayBuffer) to base64.
  function pdfBytesToBase64(bytes) {
    const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    let bin = '';
    const chunk = 0x8000;
    for (let i = 0; i < u8.length; i += chunk) bin += String.fromCharCode.apply(null, u8.subarray(i, i + chunk));
    return btoa(bin);
  }

  // POST to Gmail messages.send. Throws with a user-friendly message on failure.
  async function sendInspectionEmail({ to, cc, subject, body, pdfBase64, filename }) {
    const atts = pdfBase64 ? [{ name: filename || 'report.pdf', b64: pdfBase64 }] : [];
    const res = await googleFetch(SEND_URL, 'POST', { raw: buildInspectionMime(to, cc, subject, body, atts) });
    if (!res.ok) {
      const txt = await res.text().catch(() => '');
      if (/insufficient|ACCESS_TOKEN_SCOPE|PERMISSION_DENIED|scope/i.test(txt)) {
        throw new Error('Gmail permission not granted yet — reconnect Google (the consent screen now includes “send email”), then try again.');
      } else if (/accessNotConfigured|not been used|disabled/i.test(txt)) {
        throw new Error('Gmail API not enabled for this Google project — enable it and reconnect.');
      } else if (res.status === 401) {
        throw new Error('Session expired — reconnect Google, then try again.');
      }
      throw new Error('Send failed: ' + txt.substring(0, 140));
    }
    return { ok: true };
  }

  // ── Review modal (created once, lazily) ───────────────────────────────────
  let _ctx = null;

  function _toast(msg) {
    if (typeof toast === 'function') toast(msg);
    else if (typeof showToast === 'function') showToast(msg);
  }

  function ensureModal() {
    if (document.getElementById('insp-email-overlay')) return;
    const inp = 'width:100%;border:1.5px solid #cbd5e1;border-radius:7px;padding:9px 11px;font-size:0.88rem;font-family:inherit;margin-bottom:12px;box-sizing:border-box;';
    const lbl = 'display:block;font-size:0.72rem;font-weight:700;color:#475569;text-transform:uppercase;letter-spacing:.03em;margin-bottom:4px;';
    const div = document.createElement('div');
    div.id = 'insp-email-overlay';
    div.style.cssText = 'display:none;position:fixed;inset:0;background:rgba(0,0,0,0.55);z-index:10001;align-items:center;justify-content:center;padding:16px;';
    div.innerHTML = `
      <div style="background:#fff;border-radius:12px;max-width:560px;width:100%;max-height:90vh;overflow:auto;padding:22px;box-shadow:0 20px 60px rgba(0,0,0,0.3);font-family:inherit;">
        <h2 style="margin:0 0 4px;font-size:1.15rem;color:#0f172a;">📧 Email report to property owner</h2>
        <div style="font-size:0.8rem;color:#555;margin-bottom:14px;">Sends the inspection PDF to the recipient below. Edit anything before sending.</div>
        <label style="${lbl}">To</label>
        <input id="insp-email-to" type="email" style="${inp}">
        <label style="${lbl}">Cc <span style="font-weight:400;text-transform:none;letter-spacing:0;color:#94a3b8;">(comma-separated, optional)</span></label>
        <input id="insp-email-cc" type="text" style="${inp}">
        <label style="${lbl}">Subject</label>
        <input id="insp-email-subject" type="text" style="${inp}">
        <label style="${lbl}">Message</label>
        <textarea id="insp-email-body" spellcheck="false" style="width:100%;min-height:170px;border:1.5px solid #cbd5e1;border-radius:7px;padding:9px 11px;font-size:0.85rem;font-family:inherit;line-height:1.5;resize:vertical;box-sizing:border-box;"></textarea>
        <div id="insp-email-attach" style="font-size:0.76rem;color:#555;margin:10px 0 4px;"></div>
        <div id="insp-email-status" style="font-size:0.8rem;margin:6px 0;min-height:1em;"></div>
        <div style="display:flex;gap:10px;justify-content:flex-end;margin-top:14px;">
          <button id="insp-email-cancel" type="button" style="border:1.5px solid #cbd5e1;background:#fff;color:#334155;border-radius:7px;padding:9px 16px;font-size:0.85rem;font-weight:600;cursor:pointer;font-family:inherit;">Cancel</button>
          <button id="insp-email-send" type="button" style="border:none;background:#dc2626;color:#fff;border-radius:7px;padding:9px 18px;font-size:0.85rem;font-weight:700;cursor:pointer;font-family:inherit;">📨 Send email</button>
        </div>
      </div>`;
    document.body.appendChild(div);
    div.addEventListener('click', e => { if (e.target === div) closeModal(); });
    document.getElementById('insp-email-cancel').addEventListener('click', closeModal);
    document.getElementById('insp-email-send').addEventListener('click', doSend);
  }

  function closeModal() {
    const o = document.getElementById('insp-email-overlay');
    if (o) o.style.display = 'none';
    _ctx = null;
  }

  async function doSend() {
    const btn = document.getElementById('insp-email-send');
    const statusEl = document.getElementById('insp-email-status');
    const to = document.getElementById('insp-email-to').value.trim();
    if (!to) { statusEl.style.color = '#b45309'; statusEl.textContent = '⚠ Enter a recipient email address.'; return; }
    const cc = document.getElementById('insp-email-cc').value.trim();
    const subject = document.getElementById('insp-email-subject').value;
    const body = document.getElementById('insp-email-body').value;
    const orig = btn.textContent;
    btn.disabled = true; btn.textContent = '⏳ Sending…';
    statusEl.style.color = '#475569'; statusEl.textContent = 'Sending…';
    try {
      await sendInspectionEmail({ to, cc, subject, body, pdfBase64: _ctx && _ctx.pdfBase64, filename: _ctx && _ctx.filename });
      statusEl.style.color = '#16a34a'; statusEl.textContent = '✓ Sent to ' + to;
      _toast('✓ Report emailed to ' + to);
      setTimeout(closeModal, 900);
    } catch (e) {
      statusEl.style.color = '#dc2626'; statusEl.textContent = '✗ ' + e.message;
    } finally {
      btn.disabled = false; btn.textContent = orig;
    }
  }

  function openInspectionEmailModal({ to, cc, subject, body, pdfBase64, filename }) {
    ensureModal();
    _ctx = { pdfBase64, filename };
    document.getElementById('insp-email-to').value = to || '';
    document.getElementById('insp-email-cc').value = cc || '';
    document.getElementById('insp-email-subject').value = subject || '';
    document.getElementById('insp-email-body').value = body || '';
    document.getElementById('insp-email-attach').textContent = filename ? '📎 ' + filename : '';
    document.getElementById('insp-email-status').textContent = '';
    document.getElementById('insp-email-overlay').style.display = 'flex';
    if (!to) document.getElementById('insp-email-to').focus();
  }

  // High-level entry point for the save flows. Best-effort — never throws.
  // opts: { toggleId, pdfBytes, filename, recipient, propertyName, contactName, systemLabel, date }
  function maybeEmailInspectionReport(opts) {
    try {
      opts = opts || {};
      const tgl = opts.toggleId && document.getElementById(opts.toggleId);
      if (tgl && !tgl.checked) return;                 // user opted out
      if (typeof accessToken !== 'undefined' && !accessToken) return; // not connected → skip silently
      const { subject, body } = defaultInspectionEmail({
        propertyName: opts.propertyName,
        contactName:  opts.contactName,
        systemLabel:  opts.systemLabel,
        date:         opts.date,
      });
      const pdfBase64 = opts.pdfBytes ? pdfBytesToBase64(opts.pdfBytes) : '';
      openInspectionEmailModal({ to: opts.recipient || '', subject, body, pdfBase64, filename: opts.filename });
    } catch (e) {
      console.warn('[InspectionEmail] modal open failed:', e.message);
    }
  }

  if (typeof window !== 'undefined') {
    window.buildInspectionMime        = buildInspectionMime;
    window.defaultInspectionEmail     = defaultInspectionEmail;
    window.pdfBytesToBase64           = pdfBytesToBase64;
    window.sendInspectionEmail        = sendInspectionEmail;
    window.openInspectionEmailModal   = openInspectionEmailModal;
    window.maybeEmailInspectionReport = maybeEmailInspectionReport;
  }

  // CommonJS export tail for unit tests (mirrors js/inspection-pdf-layout.js).
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { buildInspectionMime, defaultInspectionEmail, pdfBytesToBase64 };
  }
})();
