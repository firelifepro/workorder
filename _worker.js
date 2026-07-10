// _worker.js
// ─────────────────────────────────────────────────────────────────────────────
// Cloudflare Worker — handles API routes and serves static assets.
//
// Environment variables (set in Cloudflare dashboard → Worker → Settings → Variables):
//   QB_CLIENT_ID          — sandbox QB OAuth2 Client ID
//   QB_CLIENT_SECRET      — sandbox QB OAuth2 Client Secret
//   QB_CLIENT_ID_PROD     — production QB OAuth2 Client ID
//   QB_CLIENT_SECRET_PROD — production QB OAuth2 Client Secret
//
// (Apps Script proxy was removed — the app now writes the Inspection History
// sheet directly via the Sheets API. APPS_SCRIPT_URL / APPS_SCRIPT_SECRET
// env vars in the Cloudflare dashboard can be deleted.)
// ─────────────────────────────────────────────────────────────────────────────

// Origin lock: API routes are only callable from the page itself.
// Same-origin requests from a browser send Origin = our own URL.
// Server-to-server calls (no Origin) are allowed since they can't be CSRF.
function allowedOrigin(request) {
  const origin = request.headers.get('Origin');
  if (!origin) return null;
  const selfOrigin = new URL(request.url).origin;
  return origin === selfOrigin ? origin : false;
}

function corsHeaders(origin) {
  const h = { 'Content-Type': 'application/json' };
  if (origin) {
    h['Access-Control-Allow-Origin'] = origin;
    h['Vary'] = 'Origin';
  }
  return h;
}

function corsResponse(body, status, origin) {
  return new Response(JSON.stringify(body), { status: status || 200, headers: corsHeaders(origin) });
}

function isAuthorized(request) {
  const allowed = allowedOrigin(request);
  return allowed !== false; // null (no Origin) and matching origin both pass
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const origin = allowedOrigin(request);

    // ── CORS preflight ──────────────────────────────────────────────
    if (request.method === 'OPTIONS') {
      if (origin === false) return new Response(null, { status: 403 });
      return new Response(null, {
        status: 204,
        headers: {
          ...(origin ? { 'Access-Control-Allow-Origin': origin, 'Vary': 'Origin' } : {}),
          'Access-Control-Allow-Methods': 'POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
        },
      });
    }

    // ── Cross-origin POSTs to /api/* are rejected ───────────────────
    if (url.pathname.startsWith('/api/') && !isAuthorized(request)) {
      return corsResponse({ error: 'Origin not allowed' }, 403, null);
    }

    // ── /api/qb-token — QB OAuth2 token exchange ────────────────────
    if (url.pathname === '/api/qb-token' && request.method === 'POST') {
      let body;
      try { body = await request.json(); }
      catch (e) { return corsResponse({ error: 'Invalid JSON body' }, 400); }

      const { grant_type, code, refresh_token, redirect_uri } = body;
      if (!grant_type) return corsResponse({ error: 'Missing grant_type' }, 400);

      // Pick sandbox or production credentials based on env field in request
      const isProd = body.env === 'production';
      const QB_CLIENT_ID     = isProd ? env.QB_CLIENT_ID_PROD     : env.QB_CLIENT_ID;
      const QB_CLIENT_SECRET = isProd ? env.QB_CLIENT_SECRET_PROD : env.QB_CLIENT_SECRET;
      if (!QB_CLIENT_ID || !QB_CLIENT_SECRET) {
        const which = isProd ? 'QB_CLIENT_ID_PROD / QB_CLIENT_SECRET_PROD' : 'QB_CLIENT_ID / QB_CLIENT_SECRET';
        return corsResponse({ error: `${which} not configured in Cloudflare env vars` }, 500);
      }

      const params = new URLSearchParams();
      params.append('grant_type', grant_type);
      if (grant_type === 'authorization_code') {
        if (!code || !redirect_uri) return corsResponse({ error: 'Missing code or redirect_uri' }, 400);
        params.append('code', code);
        params.append('redirect_uri', redirect_uri);
      } else if (grant_type === 'refresh_token') {
        if (!refresh_token) return corsResponse({ error: 'Missing refresh_token' }, 400);
        params.append('refresh_token', refresh_token);
      } else {
        return corsResponse({ error: 'Unsupported grant_type' }, 400);
      }

      const credentials = btoa(`${QB_CLIENT_ID}:${QB_CLIENT_SECRET}`);
      try {
        const resp = await fetch('https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer', {
          method: 'POST',
          headers: {
            'Authorization': `Basic ${credentials}`,
            'Content-Type': 'application/x-www-form-urlencoded',
            'Accept': 'application/json',
          },
          body: params.toString(),
        });
        const data = await resp.json();
        return corsResponse(data, resp.status);
      } catch (err) {
        return corsResponse({ error: 'Network error calling QB', message: err.message }, 500);
      }
    }

    // ── /api/qb-api — QB API proxy ──────────────────────────────────
    if (url.pathname === '/api/qb-api' && request.method === 'POST') {
      let body;
      try { body = await request.json(); }
      catch (e) { return corsResponse({ error: 'Invalid JSON body' }, 400); }

      const { access_token, realm_id, method, path, payload, env: qbEnv } = body;
      if (!access_token || !realm_id || !method || !path) {
        return corsResponse({ error: 'Missing required fields: access_token, realm_id, method, path' }, 400);
      }

      const baseUrl = qbEnv === 'production'
        ? `https://quickbooks.api.intuit.com/v3/company/${realm_id}`
        : `https://sandbox-quickbooks.api.intuit.com/v3/company/${realm_id}`;

      try {
        const fetchOpts = {
          method,
          headers: {
            'Authorization': `Bearer ${access_token}`,
            'Accept': 'application/json',
            // Only set Content-Type when sending a body — QB rejects it on GET
            ...(payload ? { 'Content-Type': 'application/json' } : {}),
          },
        };
        if (payload) fetchOpts.body = JSON.stringify(payload);

        const resp = await fetch(`${baseUrl}${path}`, fetchOpts);
        const data = await resp.json();
        return corsResponse(data, resp.status);
      } catch (err) {
        return corsResponse({ error: 'QB API request failed', message: err.message }, 500);
      }
    }

    // ── /api/qb-upload — attach a file to a QB entity (Invoice) ─────
    // The QB Attachable "upload" endpoint needs multipart/form-data, which the
    // JSON qb-api proxy above can't send. The browser base64-encodes the report
    // PDF and posts JSON here; the Worker rebuilds the multipart body server-side
    // and links it to the invoice with IncludeOnSend so it rides along when the
    // invoice is emailed from QuickBooks.
    if (url.pathname === '/api/qb-upload' && request.method === 'POST') {
      let body;
      try { body = await request.json(); }
      catch (e) { return corsResponse({ error: 'Invalid JSON body' }, 400, origin); }

      const { access_token, realm_id, env: qbEnv, invoiceId, fileName, contentBase64, includeOnSend } = body;
      if (!access_token || !realm_id || !invoiceId || !fileName || !contentBase64) {
        return corsResponse({ error: 'Missing required fields: access_token, realm_id, invoiceId, fileName, contentBase64' }, 400, origin);
      }

      const baseUrl = qbEnv === 'production'
        ? `https://quickbooks.api.intuit.com/v3/company/${realm_id}`
        : `https://sandbox-quickbooks.api.intuit.com/v3/company/${realm_id}`;

      try {
        // base64 → bytes
        const bin = atob(contentBase64);
        const bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);

        const metadata = {
          AttachableRef: [{
            EntityRef: { type: 'Invoice', value: String(invoiceId) },
            IncludeOnSend: includeOnSend !== false,
          }],
          FileName: fileName,
          ContentType: 'application/pdf',
        };

        // QB expects two named parts: file_metadata_01 (the Attachable JSON) and
        // file_content_01 (the bytes). FormData builds the multipart boundary for us.
        const form = new FormData();
        form.append('file_metadata_01', new Blob([JSON.stringify(metadata)], { type: 'application/json' }), 'metadata.json');
        form.append('file_content_01', new Blob([bytes], { type: 'application/pdf' }), fileName);

        const resp = await fetch(`${baseUrl}/upload`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${access_token}`,
            'Accept': 'application/json',
          },
          body: form,
        });
        const data = await resp.json();
        return corsResponse(data, resp.status, origin);
      } catch (err) {
        return corsResponse({ error: 'QB upload failed', message: err.message }, 500, origin);
      }
    }

    // ── /api/fetch-report — host-locked proxy for Inspect Point reports ──
    // import-inspectpoint.html follows the "Click here to view your invoice"
    // link in Martinez/Inspect Point emails. That link (…inspectpoint.com/
    // invoices/view_report?token=…) and the CloudFront PDFs it embeds can't be
    // fetched directly from the browser (CORS). This proxies the GET server-side.
    // Locked to inspectpoint.com + cloudfront.net so it can't be used as an open
    // proxy. Returns the upstream bytes verbatim (HTML for the viewer page,
    // application/pdf for the report) so the page can parse / upload them.
    if (url.pathname === '/api/fetch-report' && request.method === 'POST') {
      let body;
      try { body = await request.json(); }
      catch (e) { return corsResponse({ error: 'Invalid JSON body' }, 400, origin); }

      const target = body.url;
      if (!target) return corsResponse({ error: 'Missing url' }, 400, origin);
      let tu;
      try { tu = new URL(target); } catch (_) { return corsResponse({ error: 'Bad url' }, 400, origin); }
      const host = tu.hostname.toLowerCase();
      const hostOk = host === 'inspectpoint.com' || host.endsWith('.inspectpoint.com') || host.endsWith('.cloudfront.net');
      if (tu.protocol !== 'https:' || !hostOk) {
        return corsResponse({ error: 'Host not allowed' }, 403, origin);
      }

      try {
        const upstream = await fetch(target, {
          headers: { 'User-Agent': 'Mozilla/5.0 (FLPS Report Fetcher)' },
          redirect: 'follow',
        });
        const buf = await upstream.arrayBuffer();
        return new Response(buf, {
          status: upstream.status,
          headers: {
            'Content-Type': upstream.headers.get('content-type') || 'application/octet-stream',
            ...(origin ? { 'Access-Control-Allow-Origin': origin, 'Vary': 'Origin' } : {}),
          },
        });
      } catch (err) {
        return corsResponse({ error: 'Fetch failed', message: err.message }, 502, origin);
      }
    }

    // ── Static assets — pass everything else through ─────────────────
    return env.ASSETS.fetch(request);
  },
};
