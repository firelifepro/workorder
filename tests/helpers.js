'use strict';
const vm   = require('vm');
const fs   = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');

// Load js/flips-shared.js in a minimal browser-stub context.
// Returns { ctx, sessionStore, toasts } for use in assertions.
function loadShared() {
  const sessionStore = {};
  const toasts       = [];

  const ctx = vm.createContext({
    console,
    sessionStorage: {
      getItem:    function(k)    { return Object.prototype.hasOwnProperty.call(sessionStore, k) ? sessionStore[k] : null; },
      setItem:    function(k, v) { sessionStore[k] = v; },
      removeItem: function(k)    { delete sessionStore[k]; },
    },
    toast: function(msg) { toasts.push(msg); },
    document: { getElementById: function() { return null; } },
  });

  vm.runInContext(
    fs.readFileSync(path.join(ROOT, 'js/flips-shared.js'), 'utf8'),
    ctx
  );

  // Redirect toast after script load so internal calls are captured.
  // (flips-shared.js defines its own toast function; reassigning here
  // makes parseRows/buildDropdown calls route to our capture array.)
  ctx.toast = function(msg) { toasts.push(msg); };

  return { ctx: ctx, sessionStore: sessionStore, toasts: toasts };
}

// Load js/flips-history.js in a minimal context (only needs _fmtHistoryDate).
function loadHistory() {
  const ctx = vm.createContext({ console: console });
  vm.runInContext(
    fs.readFileSync(path.join(ROOT, 'js/flips-history.js'), 'utf8'),
    ctx
  );
  return ctx;
}

// ── scoreMatch (copied from sub-invoices.html) ────────────────────────────────
// Keep in sync when the source function changes.

function _parseDateLoose(s) {
  if (!s) return null;
  var t = Date.parse(s);
  if (!isNaN(t)) return t;
  var m = String(s).match(/(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})/);
  if (m) {
    var y = parseInt(m[3]); if (y < 100) y += 2000;
    var t2 = Date.parse(m[1] + '/' + m[2] + '/' + y);
    if (!isNaN(t2)) return t2;
  }
  return null;
}

function scoreMatch(inv, row) {
  var s = 0;
  var props   = (inv.properties || []).concat(inv.description ? [inv.description] : []);
  var rowProp = (row.property || '').toLowerCase();
  if (rowProp) {
    for (var i = 0; i < props.length; i++) {
      var ps = (props[i] || '').toLowerCase();
      if (!ps) continue;
      if (ps.includes(rowProp) || rowProp.includes(ps)) { s += 0.55; break; }
      var aTok = new Set(rowProp.split(/[\s,.\-]+/).filter(function(t) { return t.length > 3; }));
      var bTok = new Set(ps.split(/[\s,.\-]+/).filter(function(t) { return t.length > 3; }));
      var inter = Array.from(aTok).filter(function(t) { return bTok.has(t); }).length;
      if (inter > 0) { s += Math.min(0.45, inter * 0.18); break; }
    }
  }
  var desc = ((inv.description || '') + ' ' + (inv.lineItems || []).map(function(l) { return l.desc || ''; }).join(' ')).toLowerCase();
  var work  = (row.workReq || '').toLowerCase();
  if (desc && work) {
    var wTok = new Set(work.split(/[\s,.\-]+/).filter(function(t) { return t.length > 4; }));
    var dTok = new Set(desc.split(/[\s,.\-]+/).filter(function(t) { return t.length > 4; }));
    var dInter = Array.from(wTok).filter(function(t) { return dTok.has(t); }).length;
    if (dInter > 0) s += Math.min(0.25, dInter * 0.06);
  }
  var invD  = _parseDateLoose(inv.invoiceDate);
  var compD = _parseDateLoose(row.dateComp);
  if (invD && compD) {
    var diff = Math.abs(invD - compD) / 86400000;
    if (diff <= 7)        s += 0.15;
    else if (diff <= 30)  s += 0.08;
    else if (diff <= 90)  s += 0.03;
  }
  if (/paid/i.test(row.paid)) s -= 0.05;
  return Math.max(0, Math.min(1, s));
}

// ── matchProperty (copied from triage.html) ───────────────────────────────────
// Keep in sync when the source function changes.

function _tokens(s) {
  return new Set((s || '').toLowerCase().split(/[^a-z0-9]+/).filter(function(t) { return t.length > 2; }));
}
function _jaccard(a, b) {
  if (!a.size || !b.size) return 0;
  var inter = Array.from(a).filter(function(x) { return b.has(x); }).length;
  var union  = new Set(Array.from(a).concat(Array.from(b))).size;
  return inter / union;
}
function matchProperty(claudeProp, fullText, list) {
  if (!list.length) return null;
  var probe = ((claudeProp || '') + ' ' + (fullText || '')).toLowerCase();
  var best  = { p: null, score: 0 };
  for (var i = 0; i < list.length; i++) {
    var p      = list[i];
    var nameLc = p.name.toLowerCase();
    var addrLc = p.address.toLowerCase();
    var score  = 0;
    if (nameLc.length > 4 && probe.includes(nameLc)) score = Math.max(score, 0.95);
    if (addrLc.length > 8 && probe.includes(addrLc.split(/\r?\n/)[0])) score = Math.max(score, 0.85);
    var j = _jaccard(_tokens(p.name + ' ' + p.address), _tokens(claudeProp));
    score = Math.max(score, j);
    if (score > best.score) best = { p: p, score: score };
  }
  return best.score >= 0.45 ? Object.assign({}, best.p, { score: best.score }) : null;
}

module.exports = {
  loadShared:    loadShared,
  loadHistory:   loadHistory,
  scoreMatch:    scoreMatch,
  matchProperty: matchProperty,
};
