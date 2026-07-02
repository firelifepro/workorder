'use strict';
// Unit tests for buildNotesList — the Phase 1 normalization that collapses each
// inspection system's "General Notes & Site Observations" sources into one ordered
// array of non-empty strings (js/inspection-pdf.js). This freezes the data
// contract the PDF builders now render from.
const { loadInspectionPdf, notesDomStub } = require('./helpers');

const FA_SEL = '#fa-notes-tbody td:nth-child(2) input, #fa-notes-tbody td:nth-child(2) textarea';

function build(system, dom, extinguishers) {
  const ctx = loadInspectionPdf(dom);
  // Copy across the vm realm boundary so deepStrictEqual's prototype check passes
  // (the vm returns an array backed by the vm context's Array constructor).
  return Array.from(ctx.buildNotesList(system, extinguishers));
}

test('extinguisher: dynamic notes + per-unit note lines, empties trimmed', () => {
  const dom = notesDomStub({ queries: { '#ext-notes-tbody textarea': ['Note A', '   ', ' Note B '] } });
  const ext = [
    { rowNum: 1, location: 'Kitchen', noteTxt: 'gauge low' },
    { rowNum: 2, location: '', noteTxt: '' },       // no note → skipped
    { rowNum: 3, location: 'Lobby', noteTxt: 'obstructed' },
  ];
  assert.deepStrictEqual(build('extinguisher', dom, ext), [
    'Note A', 'Note B',
    'Unit #1 – Kitchen: gauge low',
    'Unit #3 – Lobby: obstructed',
  ]);
});

test('sprinkler: reads sp-notes note column, drops blanks', () => {
  const dom = notesDomStub({ queries: { '#sp-notes-tbody td:nth-child(2) input': ['SP1', '  ', 'SP2'] } });
  assert.deepStrictEqual(build('sprinkler', dom), ['SP1', 'SP2']);
});

test('exit-sign-lighting: single esl-notes field', () => {
  assert.deepStrictEqual(build('exit-sign-lighting', notesDomStub({ elements: { 'esl-notes': 'exit obs' } })), ['exit obs']);
  assert.deepStrictEqual(build('exit-sign-lighting', notesDomStub({ elements: { 'esl-notes': '   ' } })), []);
});

test('fire-alarm: shared step-4 table only (no panel field)', () => {
  const dom = notesDomStub({ queries: { [FA_SEL]: ['FA note', ''] } });
  assert.deepStrictEqual(build('fire-alarm', dom), ['FA note']);
});

test('hood: shared step-4 table only (no panel field)', () => {
  const dom = notesDomStub({ queries: { [FA_SEL]: ['hood obs'] } });
  assert.deepStrictEqual(build('hood', dom), ['hood obs']);
});

test('generic (standpipe): panel notes field precede the shared table', () => {
  const dom = notesDomStub({
    elements: { 'std-notes': 'panel note' },
    queries:  { [FA_SEL]: ['table obs'] },
  });
  assert.deepStrictEqual(build('standpipe', dom), ['panel note', 'table obs']);
});

test('generic with empty panel field falls through to table only', () => {
  const dom = notesDomStub({
    elements: { 'bf-notes': '' },
    queries:  { [FA_SEL]: ['backflow obs'] },
  });
  assert.deepStrictEqual(build('backflow', dom), ['backflow obs']);
});

test('empty everywhere yields an empty array', () => {
  assert.deepStrictEqual(build('hood', notesDomStub({})), []);
});
