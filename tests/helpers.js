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

// Load js/inspection-pdf.js in a context with the given `document` stub.
// The file is all function/const declarations (no top-level execution beyond
// PANEL_NOTES_ID), so it loads cleanly with only a document stub, and its
// functions (e.g. buildNotesList) become callable on the returned context.
function loadInspectionPdf(documentStub) {
  const ctx = vm.createContext({ console: console, document: documentStub });
  vm.runInContext(
    fs.readFileSync(path.join(ROOT, 'js/inspection-pdf.js'), 'utf8'),
    ctx
  );
  return ctx;
}

// Minimal DOM stub for the notes/deficiency reads: getElementById resolves
// against `elements` (id → value string), querySelectorAll against `queries`
// (exact selector string → array of value strings), each wrapped as { value }.
function notesDomStub(spec) {
  const elements = (spec && spec.elements) || {};
  const queries  = (spec && spec.queries)  || {};
  const wrap = v => ({ value: v });
  return {
    getElementById: function(id) {
      return Object.prototype.hasOwnProperty.call(elements, id) ? wrap(elements[id]) : null;
    },
    querySelectorAll: function(sel) {
      return (queries[sel] || []).map(wrap);
    },
  };
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

// ── filePropTokens / propFileScore (copied from inspection-audit.html) ────────
// Keep in sync when the source functions change. SYS_SLUGS mirrors the SYS_DEFS
// slugs used for stripping the system segment (only the ones exercised here need
// to be present, but keep the full list to match the source's longest-first scan).

const AUDIT_STOP = new Set(['the', 'and', 'llc', 'inc', 'of', 'co', 'company', 'corp', 'ltd', 'at']);
function auditTokens(s) {
  return (s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').split(' ')
    .filter(function(t) { return t.length >= 3 && !AUDIT_STOP.has(t); });
}
// Longest-first so 'special_suppression' is tried before shorter prefixes.
const SYS_SLUGS = [
  'special_suppression', 'exit_sign_lighting', 'fire_smoke_damper', 'gas_detection',
  'smoke_control', 'internal_pipe', 'extinguisher', 'fire_alarm', 'fire_pump',
  'dry_pipe', 'sprinkler', 'standpipe', 'backflow', 'elevator', 'hydrant',
  'jockey', 'hood', 'hospital', 'bda', 'fdc', 'deficiency', 'correction',
].sort(function(a, b) { return b.length - a.length; });

function filePropTokens(name) {
  var n = (name || '').toLowerCase().replace(/\.pdf$/, '');
  n = n.replace(/^flps_/, '').replace(/^ext_/, '');
  for (var i = 0; i < SYS_SLUGS.length; i++) {
    if (n.indexOf(SYS_SLUGS[i] + '_') === 0) { n = n.slice(SYS_SLUGS[i].length + 1); break; }
  }
  n = n.replace(/^(semi[_-]?annual|annual|quarterly|monthly|weekly|5[_-]?year|3[_-]?year)_/, '');
  n = n.replace(/^(martinez|convergint)_/, '');
  n = n.replace(/_\d{4}-\d{2}-\d{2}(_\d+)?$/, '').replace(/_\d{8}(_\d+)?$/, '');
  return auditTokens(n);
}

function propFileScore(nameToks, addrToks, filePropToks, fileAllToks) {
  if (!nameToks.length) return 0;
  var has = function(t) { return fileAllToks.indexOf(t) !== -1; };
  var nOv = nameToks.filter(has).length / nameToks.length;
  var pool = new Set(nameToks.concat(addrToks));
  var fileCover = filePropToks.length >= 2
    ? filePropToks.filter(function(t) { return pool.has(t); }).length / filePropToks.length
    : 0;
  if (nOv < 0.6 && fileCover < 0.6) return 0;
  var aOv = addrToks.length ? addrToks.filter(has).length / addrToks.length : 0;
  return Math.max(nOv, fileCover) + aOv * 0.5;
}

module.exports = {
  loadShared:        loadShared,
  loadHistory:       loadHistory,
  loadInspectionPdf: loadInspectionPdf,
  notesDomStub:      notesDomStub,
  scoreMatch:     scoreMatch,
  matchProperty:  matchProperty,
  auditTokens:    auditTokens,
  filePropTokens: filePropTokens,
  propFileScore:  propFileScore,
};
