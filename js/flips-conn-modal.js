/* flips-conn-modal.js — centralized connection modal for all FLIPS pages
 *
 * Usage: each page sets window.FLIPS_MODAL_CONFIG before loading this script:
 *   <script>window.FLIPS_MODAL_CONFIG = { requiresQB: false };</script>
 *   <script src="js/flips-conn-modal.js"></script>
 *
 * The modal appears automatically when Google (or QB on QB pages) is not connected.
 * It cannot be dismissed — the user must connect. It re-appears if the connection
 * drops mid-session (checked every 30 seconds).
 *
 * Delegates to the page's own initGoogle() and connectQuickBooks() — no auth logic here.
 */
(function () {
  const CSS = `
    #flips-conn-modal-overlay {
      position: fixed;
      inset: 0;
      z-index: 99999;
      background: rgba(0, 0, 0, 0.82);
      display: flex;
      align-items: center;
      justify-content: center;
      font-family: system-ui, -apple-system, sans-serif;
    }
    #flips-conn-modal-card {
      background: #0f0f23;
      border: 1px solid #2a2a4a;
      border-radius: 12px;
      padding: 36px 40px 32px;
      max-width: 440px;
      width: calc(100% - 32px);
      color: #d0d0e8;
      box-shadow: 0 24px 64px rgba(0,0,0,0.7);
    }
    #flips-conn-modal-card h2 {
      margin: 0 0 6px;
      font-size: 1.3rem;
      color: #fff;
      font-weight: 600;
    }
    #flips-conn-modal-card .flips-modal-subtitle {
      margin: 0 0 24px;
      font-size: 0.88rem;
      color: #888aaa;
      line-height: 1.5;
    }
    #flips-conn-modal-card .flips-modal-section-title {
      font-size: 0.78rem;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      color: #6668aa;
      margin: 0 0 14px;
    }
    #flips-conn-modal-card .flips-modal-field {
      margin-bottom: 14px;
    }
    #flips-conn-modal-card .flips-modal-field label {
      display: block;
      font-size: 0.8rem;
      color: #8890b8;
      margin-bottom: 5px;
    }
    #flips-conn-modal-card .flips-modal-field input {
      width: 100%;
      box-sizing: border-box;
      background: #1a1a38;
      border: 1px solid #2a2a50;
      border-radius: 6px;
      color: #d0d0f0;
      padding: 9px 12px;
      font-size: 0.88rem;
      outline: none;
      transition: border-color 0.15s;
    }
    #flips-conn-modal-card .flips-modal-field input:focus {
      border-color: #4a4a9a;
    }
    #flips-conn-modal-card .flips-modal-btn {
      display: inline-block;
      margin-top: 6px;
      padding: 10px 20px;
      border-radius: 6px;
      border: none;
      cursor: pointer;
      font-size: 0.9rem;
      font-weight: 600;
      transition: opacity 0.15s;
    }
    #flips-conn-modal-card .flips-modal-btn:hover { opacity: 0.88; }
    #flips-conn-modal-card .flips-modal-btn-google {
      background: #3c5acd;
      color: #fff;
    }
    #flips-conn-modal-card .flips-modal-btn-qb {
      background: #2ca01c;
      color: #fff;
    }
    #flips-conn-modal-card .flips-modal-status {
      display: none;
      margin-top: 10px;
      font-size: 0.82rem;
      color: #f08080;
      background: rgba(240,128,128,0.1);
      border-radius: 5px;
      padding: 7px 10px;
    }
    #flips-conn-modal-card .flips-modal-divider {
      border: none;
      border-top: 1px solid #2a2a4a;
      margin: 24px 0;
    }
    #flips-conn-modal-card .flips-modal-qb-note {
      font-size: 0.83rem;
      color: #888aaa;
      margin: 0 0 18px;
      line-height: 1.5;
    }
  `;

  let _config      = {};
  let _observer    = null;
  let _qbObserver  = null;
  let _healthTimer = null;
  let _pollTimer   = null;

  // ── Pill detection ──────────────────────────────────────────────────────────

  function _googlePillId() {
    for (const id of ['conn-status-google', 'conn-status', 'conn-pill']) {
      if (document.getElementById(id)) return id;
    }
    return null;
  }

  function _qbPillId() {
    for (const id of ['conn-status-qb', 'qb-status-pill', 'qb-pill']) {
      if (document.getElementById(id)) return id;
    }
    return null;
  }

  function _pillIsOk(id) {
    const el = document.getElementById(id);
    return el ? el.classList.contains('ok') : false;
  }

  // ── Connection state ────────────────────────────────────────────────────────

  function _googleIsConnected() {
    const pillId = _googlePillId();
    if (pillId && _pillIsOk(pillId)) return true;
    const tok    = localStorage.getItem('flips_access_token');
    const expiry = Number(localStorage.getItem('flips_token_expiry')) || 0;
    return !!(tok && expiry > Date.now());
  }

  function _qbIsConnected() {
    const env    = localStorage.getItem('qb_env') || 'sandbox';
    const token  = localStorage.getItem('qb_access_token_' + env);
    const expiry = Number(localStorage.getItem('qb_expires_at_' + env)) || 0;
    const realm  = localStorage.getItem('qb_realm_id_' + env);
    return !!(token && realm && (expiry === 0 || Date.now() < expiry));
  }

  function _needsModal() {
    if (!_googleIsConnected()) return true;
    if (_config.requiresQB && !_qbIsConnected()) return true;
    return false;
  }

  // ── DOM injection ───────────────────────────────────────────────────────────

  function _buildHTML() {
    const qbSection = _config.requiresQB ? `
      <hr class="flips-modal-divider" id="flips-modal-qb-divider">
      <div id="flips-modal-qb-section">
        <div class="flips-modal-section-title">QuickBooks</div>
        <p class="flips-modal-qb-note">Google is connected. QuickBooks is also required on this page. Click below to authenticate — you'll be redirected to Intuit and returned here.</p>
        <button class="flips-modal-btn flips-modal-btn-qb" id="flips-modal-connect-qb">🔗 Connect QuickBooks</button>
        <div class="flips-modal-status" id="flips-modal-qb-status"></div>
      </div>` : '';

    return `
      <div id="flips-conn-modal-card">
        <h2>Connection Required</h2>
        <p class="flips-modal-subtitle">This page needs a Google connection to work. Enter your credentials below and click Connect.</p>
        <div id="flips-modal-google-section">
          <div class="flips-modal-section-title">Google</div>
          <div class="flips-modal-field">
            <label>Google API Key</label>
            <input type="password" id="flips-modal-api-key" placeholder="AIzaSy…" autocomplete="off">
          </div>
          <div class="flips-modal-field">
            <label>OAuth Client ID</label>
            <input type="text" id="flips-modal-client-id" placeholder="123456….apps.googleusercontent.com">
          </div>
          <button class="flips-modal-btn flips-modal-btn-google" id="flips-modal-connect-google">🔗 Connect Google</button>
          <div class="flips-modal-status" id="flips-modal-google-status"></div>
        </div>
        ${qbSection}
      </div>`;
  }

  function _inject() {
    if (document.getElementById('flips-conn-modal-overlay')) return;

    const style = document.createElement('style');
    style.textContent = CSS;
    document.head.appendChild(style);

    const overlay = document.createElement('div');
    overlay.id = 'flips-conn-modal-overlay';
    overlay.innerHTML = _buildHTML();
    document.body.appendChild(overlay);

    document.getElementById('flips-modal-connect-google')
      .addEventListener('click', _onClickGoogle);

    if (_config.requiresQB) {
      document.getElementById('flips-modal-connect-qb')
        .addEventListener('click', _onClickQB);
    }
  }

  // ── Inputs ──────────────────────────────────────────────────────────────────

  function _prefill() {
    const apiKeyEl  = document.getElementById('flips-modal-api-key');
    const clientEl  = document.getElementById('flips-modal-client-id');
    if (apiKeyEl) apiKeyEl.value  = localStorage.getItem('flips_api_key')   || '';
    if (clientEl) clientEl.value  = localStorage.getItem('flips_client_id') || '';
  }

  function _syncToDrawerInputs() {
    const modalKey    = (document.getElementById('flips-modal-api-key')?.value  || '').trim();
    const modalClient = (document.getElementById('flips-modal-client-id')?.value || '').trim();
    const drawerKey   = document.getElementById('api-key');
    const drawerClient= document.getElementById('client-id');
    if (drawerKey    && modalKey)    drawerKey.value    = modalKey;
    if (drawerClient && modalClient) drawerClient.value = modalClient;
  }

  // ── Button handlers ─────────────────────────────────────────────────────────

  function _onClickGoogle() {
    const apiKey   = (document.getElementById('flips-modal-api-key')?.value  || '').trim();
    const clientId = (document.getElementById('flips-modal-client-id')?.value || '').trim();
    if (!apiKey || !clientId) {
      _setModalStatus('google', '⚠ Enter both API Key and Client ID');
      return;
    }
    _clearModalStatus('google');
    _syncToDrawerInputs();
    if (typeof window.initGoogle === 'function') {
      window.initGoogle();
      _startGoogleObserver();
      _startPoll();
    } else {
      _setModalStatus('google', '⚠ initGoogle() not found — check script load order');
    }
  }

  function _onClickQB() {
    _clearModalStatus('qb');
    if (typeof window.connectQuickBooks === 'function') {
      window.connectQuickBooks();
    } else {
      _setModalStatus('qb', '⚠ connectQuickBooks() not found');
    }
  }

  function _setModalStatus(which, msg) {
    const id = which === 'qb' ? 'flips-modal-qb-status' : 'flips-modal-google-status';
    const el = document.getElementById(id);
    if (!el) return;
    el.textContent = msg;
    el.style.display = msg ? 'block' : 'none';
  }

  function _clearModalStatus(which) { _setModalStatus(which, ''); }

  // ── Section visibility ──────────────────────────────────────────────────────

  function _updateSections() {
    const gOk = _googleIsConnected();
    const googleSection = document.getElementById('flips-modal-google-section');
    const qbSection     = document.getElementById('flips-modal-qb-section');
    const qbDivider     = document.getElementById('flips-modal-qb-divider');

    if (googleSection) googleSection.style.display = gOk ? 'none' : 'block';

    if (_config.requiresQB) {
      const qbVisible = gOk;
      if (qbSection)  qbSection.style.display  = qbVisible ? 'block' : 'none';
      if (qbDivider)  qbDivider.style.display  = qbVisible ? 'block' : 'none';
    }
  }

  // ── Show / hide ─────────────────────────────────────────────────────────────

  function _show() {
    _inject();
    _prefill();
    _updateSections();
    const overlay = document.getElementById('flips-conn-modal-overlay');
    if (overlay) overlay.style.display = 'flex';
  }

  function _hide() {
    const overlay = document.getElementById('flips-conn-modal-overlay');
    if (overlay) overlay.style.display = 'none';
    _stopObservers();
    _stopPoll();
  }

  // ── MutationObserver ────────────────────────────────────────────────────────

  function _startGoogleObserver() {
    const pillId = _googlePillId();
    if (!pillId || _observer) return;
    const pill = document.getElementById(pillId);
    if (!pill) return;

    _observer = new MutationObserver(() => {
      if (!_pillIsOk(pillId)) return;
      _observer.disconnect();
      _observer = null;
      if (!_config.requiresQB || _qbIsConnected()) {
        _hide();
      } else {
        _updateSections();
        _startQBObserver();
      }
    });
    _observer.observe(pill, { attributes: true, attributeFilter: ['class'] });
  }

  function _startQBObserver() {
    const pillId = _qbPillId();
    if (!pillId || _qbObserver) return;
    const pill = document.getElementById(pillId);
    if (!pill) return;

    _qbObserver = new MutationObserver(() => {
      if (!_pillIsOk(pillId)) return;
      _qbObserver.disconnect();
      _qbObserver = null;
      if (!_needsModal()) _hide();
    });
    _qbObserver.observe(pill, { attributes: true, attributeFilter: ['class'] });
  }

  function _stopObservers() {
    if (_observer)   { _observer.disconnect();   _observer   = null; }
    if (_qbObserver) { _qbObserver.disconnect(); _qbObserver = null; }
  }

  // ── Polling fallback ────────────────────────────────────────────────────────
  // Handles cases where MutationObserver misses the pill update (race conditions,
  // pages that update innerText rather than classList, etc.)

  function _startPoll() {
    _stopPoll();
    let attempts = 0;
    _pollTimer = setInterval(() => {
      attempts++;
      if (!_needsModal()) {
        _hide();
      } else if (_googleIsConnected() && _config.requiresQB) {
        _updateSections();
        _startQBObserver();
      }
      if (attempts > 120) _stopPoll(); // give up after 60s
    }, 500);
  }

  function _stopPoll() {
    if (_pollTimer) { clearInterval(_pollTimer); _pollTimer = null; }
  }

  // ── Health check ────────────────────────────────────────────────────────────

  function _startHealthCheck() {
    if (_healthTimer) return;
    _healthTimer = setInterval(() => {
      if (_needsModal()) {
        _show();
        _startGoogleObserver();
        if (_config.requiresQB && _googleIsConnected()) _startQBObserver();
      }
    }, 30_000);
  }

  // ── Init ────────────────────────────────────────────────────────────────────

  function init(config) {
    _config = Object.assign({ requiresQB: false }, config || {});

    function _run() {
      if (_needsModal()) {
        _show();
        _startGoogleObserver();
        if (_config.requiresQB && _googleIsConnected()) _startQBObserver();
      }
      _startHealthCheck();
    }

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', _run);
    } else {
      _run();
    }
  }

  window._flipsConnModal = { init };
})();

_flipsConnModal.init(window.FLIPS_MODAL_CONFIG);
