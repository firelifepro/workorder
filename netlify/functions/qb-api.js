// netlify/functions/qb-api.js
// ─────────────────────────────────────────────────────────────────────────────
// QuickBooks API proxy — routes all QB API calls server-side to avoid CORS.
// The browser sends the QB access token and the desired API call details.
// This function forwards the request to QB and returns the response.
//
// Supports: GET queries and POST creates for Customer and Invoice endpoints.
// ─────────────────────────────────────────────────────────────────────────────

exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json',
  };

  // Handle CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  let body;
  try {
    body = JSON.parse(event.body);
  } catch (e) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid JSON body' }) };
  }

  const { access_token, realm_id, method, path, payload, env } = body;

  if (!access_token || !realm_id || !method || !path) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Missing required fields: access_token, realm_id, method, path' }) };
  }

  const baseUrl = env === 'production'
    ? `https://quickbooks.api.intuit.com/v3/company/${realm_id}`
    : `https://sandbox-quickbooks.api.intuit.com/v3/company/${realm_id}`;

  const url = `${baseUrl}${path}`;

  try {
    const fetchOpts = {
      method,
      headers: {
        'Authorization': `Bearer ${access_token}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
    };
    if (payload) fetchOpts.body = JSON.stringify(payload);

    const response = await fetch(url, fetchOpts);
    const data = await response.json();

    return {
      statusCode: response.status,
      headers,
      body: JSON.stringify(data),
    };
  } catch (err) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'QB API request failed', message: err.message }),
    };
  }
};
