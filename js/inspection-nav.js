// ─────────────────────────────────────────────────────────────────────────────
// NAV
// ─────────────────────────────────────────────────────────────────────────────
function toggleNav() { document.getElementById('nav-menu').classList.toggle('open'); }
document.addEventListener('click', e => {
  if (!e.target.closest('.nav-hamburger')) document.getElementById('nav-menu').classList.remove('open');
});
function toggleDrawer() { document.getElementById('conn-drawer').classList.toggle('open'); }

// ─────────────────────────────────────────────────────────────────────────────
// STEP WIZARD
// ─────────────────────────────────────────────────────────────────────────────
function syncMainNavDisabled() {
  const hasInspection = !!activeInspectionSystem;
  document.querySelectorAll('#step-nav .step-tab').forEach(t => {
    const s = parseInt(t.dataset.step);
    if (s >= 3) t.classList.toggle('disabled', !hasInspection);
  });
}

// Hide every OTHER subsystem's dedicated view — the Sprinkler and Fire-alarm
// static multi-step panels plus their nav bars and "Inspecting:" banners. Called
// before building ANY system so switching systems mid-inspection can't leave the
// previous system's panels/tabs on screen (which stacked two inspections together,
// e.g. Sprinkler + Standpipe both showing with two "Inspecting:" banners).
function _hideAllSubsystemViews() {
  ['sp-step-nav', 'sp-active-banner', 'step-sp-prevdefic',
   'fa-step-nav', 'fa-active-banner'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = 'none';
  });
  (typeof SP_STEP_ORDER !== 'undefined' ? SP_STEP_ORDER : []).forEach(k => {
    const el = document.getElementById('step-sp-' + k);
    if (el) el.style.display = 'none';
  });
  (typeof FA_STEP_ORDER !== 'undefined' ? FA_STEP_ORDER : []).forEach(k => {
    const el = document.getElementById('step-fa-' + k);
    if (el) el.style.display = 'none';
  });
}

function goStep(n) {
  if (n >= 3 && !activeInspectionSystem) return;
  // Auto-save draft for non-FA/SP system types when navigating steps
  if (activeInspectionSystem && !['fire-alarm','sprinkler'].includes(activeInspectionSystem)) {
    saveDraft();
  }
  // Hide every step container explicitly. Don't rely on currentStep — the
  // special-step navigators (goExtSummaryStep/goGenericDeficStep) don't update it,
  // so a stale value could leave the previous step (e.g. Sign & Export) on screen.
  ['step-1','step-2','step-3','step-4','step-generic-defic','step-ext-summary','step-generic-prevdefic'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = 'none';
  });
  document.getElementById('step-' + n).style.display = 'block';
  document.querySelectorAll('#step-nav .step-tab').forEach(t => {
    const s = parseInt(t.dataset.step);
    t.classList.remove('active','done');
    if (s === n) t.classList.add('active');
    else if (s < n) t.classList.add('done');
  });
  // Deficiencies tab: done when on or past step-4, otherwise inactive
  const deficTab = document.getElementById('step-nav-defic-tab');
  if (deficTab) {
    deficTab.classList.remove('active', 'done');
    if (n >= 4) deficTab.classList.add('done');
  }
  // Summary tab: show only for extinguisher inspections
  const summaryTabEl = document.getElementById('step-nav-summary-tab');
  if (summaryTabEl) summaryTabEl.style.display = (activeInspectionSystem === 'extinguisher') ? '' : 'none';
  // Prevdefic tab: mark done when moving past it
  const prevDeficTab = document.getElementById('step-nav-prevdefic-tab');
  if (prevDeficTab && prevDeficTab.style.display !== 'none') {
    prevDeficTab.classList.remove('active');
    prevDeficTab.classList.add('done');
  }
  currentStep = n;
  window.scrollTo({ top: 0, behavior: 'smooth' });
  if (n === 3) updateDeficiencySummary();
  if (n === 4) {
    const sigDate = sigDefaultDate();
    if (!document.getElementById('sig-date').value) document.getElementById('sig-date').value = sigDate;
    if (!document.getElementById('cust-sig-date').value) document.getElementById('cust-sig-date').value = sigDate;
    syncStep4DateType();
    updateDeficiencySummary();
    // Auto-suggest status for generic/extinguisher (FA/SP have their own logic)
    if (activeInspectionSystem && !['fire-alarm','sprinkler'].includes(activeInspectionSystem)) {
      if (!overallStatusUserSet) {
        const genericDefics = document.getElementById('generic-defic-tbody')?.querySelectorAll('tr').length || 0;
        setOverallStatus(genericDefics > 0 ? 'DEFICIENT' : 'COMPLIANT');
      }
      // Extinguisher captures general notes on its own Inspect page
      // (ext-notes-tbody, which the extinguisher PDF reads), so hide the
      // redundant Sign & Export notes card for that system only.
      document.getElementById('fa-notes-card').style.display =
        (activeInspectionSystem === 'extinguisher') ? 'none' : 'block';
      document.getElementById('sp-notes-card').style.display = 'none';
    }
  }
}

function checkConnAndGoSystems() {
  const propSel = document.getElementById('property-select');
  if (!propSel || !propSel.value) {
    toast('⚠ Please select a property before continuing.');
    propSel?.focus();
    return;
  }
  if (!accessToken) {
    toast('⚠ Not connected to Google Drive — data will not save to Drive. Connect in the top bar, or continue offline.');
  }
  goStep(2);
}

// ─────────────────────────────────────────────────────────────────────────────
// FIRE ALARM MULTI-STEP NAVIGATION
// ─────────────────────────────────────────────────────────────────────────────
function goFAStep(key) {
  // Auto-save draft on every step transition
  saveDraft();
  const ALL_FA_KEYS = [...FA_STEP_ORDER, 'sign'];
  // Hide all FA step divs, prevdefic, and step-4
  FA_STEP_ORDER.forEach(k => {
    const el = document.getElementById('step-fa-' + k);
    if (el) el.style.display = 'none';
  });
  document.getElementById('step-fa-prevdefic').style.display = 'none';
  document.getElementById('step-4').style.display = 'none';

  // Handle prevdefic as a special view-only step
  if (key === 'prevdefic') {
    document.getElementById('step-fa-prevdefic').style.display = 'block';
    document.querySelectorAll('#fa-step-nav .step-tab').forEach(t => {
      t.classList.remove('active');
      if (t.dataset.fstep === 'prevdefic') t.classList.add('active');
    });
    currentFAStep = 'prevdefic';
    window.scrollTo({ top: 0, behavior: 'smooth' });
    return;
  }

  // Show target — 'sign' reuses #step-4
  if (key === 'sign') {
    document.getElementById('step-4').style.display = 'block';
    document.getElementById('fa-notes-card').style.display = 'block';
    document.getElementById('sp-notes-card').style.display = 'none';

    const sigDate = sigDefaultDate();
    if (!document.getElementById('sig-date').value) document.getElementById('sig-date').value = sigDate;
    if (!document.getElementById('cust-sig-date').value) document.getElementById('cust-sig-date').value = sigDate;
    syncStep4DateType();
    updateDeficiencySummary();
    const faDeficRows = document.getElementById('fa-defic-tbody')?.querySelectorAll('tr').length || 0;
    if (!overallStatusUserSet) {
      if (faDeficRows > 0) setOverallStatus('DEFICIENT');
      else setOverallStatus('COMPLIANT');
    }
  } else {
    const target = document.getElementById('step-fa-' + key);
    if (target) target.style.display = 'block';
    if (key === 'defic') updateDeficiencySummary();
  }

  // Update tab states — 'property', 'systems', and 'prevdefic' are excluded from done/active progression
  document.querySelectorAll('#fa-step-nav .step-tab').forEach(t => {
    t.classList.remove('active', 'done');
    const fstep = t.dataset.fstep;
    if (fstep === 'property' || fstep === 'systems') { t.classList.add('done'); return; }
    if (fstep === 'prevdefic') return; // never mark prevdefic as done via normal progression
    if (fstep === key) t.classList.add('active');
    else if (ALL_FA_KEYS.indexOf(fstep) < ALL_FA_KEYS.indexOf(key)) t.classList.add('done');
  });
  currentFAStep = key;
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function startFireAlarmInspection() {
  _hideAllSubsystemViews();  // clear any Sprinkler view (or a prior generic form) first
  // Swap navigation
  document.getElementById('step-nav').style.display = 'none';
  document.getElementById('fa-step-nav').style.display = 'flex';
  document.getElementById('fa-active-banner').style.display = 'block';

  // Hide regular step content
  document.getElementById('step-2').style.display = 'none';
  document.getElementById('step-3').style.display = 'none';
  document.getElementById('step-4').style.display = 'none';

  // Hide all FA step divs first
  FA_STEP_ORDER.forEach(k => {
    const el = document.getElementById('step-fa-' + k);
    if (el) el.style.display = 'none';
  });
  document.getElementById('step-fa-prevdefic').style.display = 'none';

  // Reset and initialize
  clearFAInspectionState();
  initFireAlarmPanel();

  // Check for a saved draft first; offer resume via modal
  const draft = loadDraft();
  if (draft) {
    showDraftModal(draft, false,
      () => { _resumeFromDraft(draft); },
      () => { clearDraft(); _continueFireAlarmStart(); },
      () => { clearDraft(); _continueFireAlarmStart(); }
    );
    return; // modal callbacks handle the rest
  } else if (accessToken) {
    // localStorage was empty — check Drive for a backed-up draft
    const key = draftKey();
    loadDraftFromDrive(key).then(driveDraft => {
      if (!driveDraft) { _continueFireAlarmStart(); return; }
      showDraftModal(driveDraft, true,
        () => {
          try { localStorage.setItem(key, JSON.stringify(driveDraft)); } catch(_) {}
          _resumeFromDraft(driveDraft);
        },
        () => { clearDraftFromDrive(key).catch(() => {}); _continueFireAlarmStart(); },
        () => { clearDraftFromDrive(key).catch(() => {}); _continueFireAlarmStart(); }
      );
    }).catch(() => { _continueFireAlarmStart(); });
    return; // wait for async + modal
  }

  _continueFireAlarmStart();
}

function _resumeFromDraft(draft) {
  restoreDraft(draft);
  document.getElementById('step-fa-prevdefic').style.display = 'none';
  // Show prevdefic tab if there are previous deficiencies (even when resuming a draft)
  const faPrevDefics = window._prevInspectionData?.deficiencies || [];
  if (faPrevDefics.length > 0) {
    const faPrevTab = document.querySelector('#fa-step-nav .step-tab[data-fstep="prevdefic"]');
    if (faPrevTab) {
      const tbody = document.getElementById('fa-prevdefic-tbody');
      if (tbody) {
        tbody.innerHTML = faPrevDefics.map((d, i) => `<tr>
          <td style="text-align:center;color:var(--slate);">${i + 1}</td>
          <td>${escHtml(d.item || d.description || '')}</td>
        </tr>`).join('');
      }
      faPrevTab.style.display = '';
    }
  }
  const resumeStep = 'panel';
  currentFAStep = resumeStep;
  const resumeEl = document.getElementById('step-fa-' + resumeStep);
  if (resumeEl) resumeEl.style.display = 'block';
  document.querySelectorAll('#fa-step-nav .step-tab').forEach(t => {
    t.classList.remove('active', 'done');
    if (t.dataset.fstep === 'property' || t.dataset.fstep === 'systems') t.classList.add('done');
    else if (t.dataset.fstep === 'prevdefic') return; // leave prevdefic tab as-is
    else if (t.dataset.fstep === resumeStep) t.classList.add('active');
  });
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function _continueFireAlarmStart() {
  // Restore previous inspection data typed fields + devices
  const prev = window._prevInspectionData;
  if (prev) {
    restorePanelFields(prev);
    if (prev.devices) restoreFADevices(prev.devices);
    toast('✓ Previous data loaded');
  }
  // Always default report type to Annual
  document.getElementById('report-type').value = 'Annual';
  syncFAReportTypeButtons();

  buildItemPanelMap();
  updateDeficiencySummary();

  // If there were previous deficiencies, show the tab and review step first
  const prevDefics = prev?.deficiencies || [];
  if (prevDefics.length > 0) {
    const tbody = document.getElementById('fa-prevdefic-tbody');
    if (tbody) {
      tbody.innerHTML = prevDefics.map((d, i) => `<tr>
        <td style="text-align:center;color:var(--slate);">${i + 1}</td>
        <td>${escHtml(d.item || d.description || '')}</td>
      </tr>`).join('');
    }
    document.querySelector('#fa-step-nav .step-tab[data-fstep="prevdefic"]').style.display = '';
    document.getElementById('step-fa-prevdefic').style.display = 'block';
    document.querySelectorAll('#fa-step-nav .step-tab').forEach(t => {
      t.classList.remove('active', 'done');
      if (t.dataset.fstep === 'property' || t.dataset.fstep === 'systems') t.classList.add('done');
      if (t.dataset.fstep === 'prevdefic') t.classList.add('active');
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
    return;
  }

  // No prev deficiencies — go directly to panel
  currentFAStep = 'panel';
  document.getElementById('step-fa-panel').style.display = 'block';
  document.querySelectorAll('#fa-step-nav .step-tab').forEach(t => {
    t.classList.remove('active', 'done');
    if (t.dataset.fstep === 'property' || t.dataset.fstep === 'systems') t.classList.add('done');
    else if (t.dataset.fstep === 'panel') t.classList.add('active');
  });
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function proceedFromFAPrevDefic() {
  document.getElementById('step-fa-prevdefic').style.display = 'none';
  currentFAStep = 'panel';
  document.getElementById('step-fa-panel').style.display = 'block';
  document.querySelectorAll('#fa-step-nav .step-tab').forEach(t => {
    t.classList.remove('active', 'done');
    if (t.dataset.fstep === 'property' || t.dataset.fstep === 'systems') t.classList.add('done');
    else if (t.dataset.fstep === 'panel') t.classList.add('active');
  });
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function exitFireAlarmInspection(target) {
  // Hide all FA steps and step-4
  FA_STEP_ORDER.forEach(k => {
    const el = document.getElementById('step-fa-' + k);
    if (el) el.style.display = 'none';
  });
  document.getElementById('step-fa-prevdefic').style.display = 'none';
  const faPrevDeficTab = document.querySelector('#fa-step-nav .step-tab[data-fstep="prevdefic"]');
  if (faPrevDeficTab) faPrevDeficTab.style.display = 'none';
  document.getElementById('step-4').style.display = 'none';
  document.getElementById('fa-step-nav').style.display = 'none';
  document.getElementById('fa-active-banner').style.display = 'none';
  document.getElementById('step-nav').style.display = 'flex';
  activeInspectionSystem = null;
  clearDraft();
  syncMainNavDisabled();
  // currentStep is still 2 from when we entered FA mode
  goStep(target === 'property' ? 1 : 2);
}

// ─────────────────────────────────────────────────────────────────────────────
// SPRINKLER MULTI-STEP NAVIGATION
// ─────────────────────────────────────────────────────────────────────────────
function goSPStep(key) {
  saveDraft();
  const ALL_SP_KEYS = [...SP_STEP_ORDER, 'sign'];
  SP_STEP_ORDER.forEach(k => {
    const el = document.getElementById('step-sp-' + k);
    if (el) el.style.display = 'none';
  });
  document.getElementById('step-sp-prevdefic').style.display = 'none';
  document.getElementById('step-4').style.display = 'none';

  // Handle prevdefic as a special view-only step
  if (key === 'prevdefic') {
    document.getElementById('step-sp-prevdefic').style.display = 'block';
    document.querySelectorAll('#sp-step-nav .step-tab').forEach(t => {
      t.classList.remove('active');
      if (t.dataset.sstep === 'prevdefic') t.classList.add('active');
    });
    currentSPStep = 'prevdefic';
    window.scrollTo({ top: 0, behavior: 'smooth' });
    return;
  }

  if (key === 'sign') {
    document.getElementById('step-4').style.display = 'block';
    document.getElementById('fa-notes-card').style.display = 'none';
    document.getElementById('sp-notes-card').style.display = 'block';
    const sigDate = sigDefaultDate();
    if (!document.getElementById('sig-date').value) document.getElementById('sig-date').value = sigDate;
    if (!document.getElementById('cust-sig-date').value) document.getElementById('cust-sig-date').value = sigDate;
    syncStep4DateType();
    updateSPDeficiencySummary();
    const spDeficRows = document.getElementById('sp-defic-tbody')?.querySelectorAll('tr').length || 0;
    if (spDeficRows > 0) setOverallStatus('DEFICIENT');
    else if (overallStatus === '') setOverallStatus('COMPLIANT');
  } else {
    const target = document.getElementById('step-sp-' + key);
    if (target) target.style.display = 'block';
    if (key === 'defic') updateSPDeficiencySummary();
  }

  // Update tab states — 'property', 'systems', and 'prevdefic' excluded from done/active progression
  document.querySelectorAll('#sp-step-nav .step-tab').forEach(t => {
    t.classList.remove('active', 'done');
    const sstep = t.dataset.sstep;
    if (sstep === 'property' || sstep === 'systems') { t.classList.add('done'); return; }
    if (sstep === 'prevdefic') return; // never mark prevdefic as done via normal progression
    if (sstep === key) t.classList.add('active');
    else if (ALL_SP_KEYS.indexOf(sstep) < ALL_SP_KEYS.indexOf(key)) t.classList.add('done');
  });
  currentSPStep = key;
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function startSprinklerInspection() {
  _hideAllSubsystemViews();  // clear any Fire-alarm view (or a prior generic form) first
  document.getElementById('step-nav').style.display = 'none';
  document.getElementById('sp-step-nav').style.display = 'flex';
  document.getElementById('sp-active-banner').style.display = 'block';
  document.getElementById('step-2').style.display = 'none';
  document.getElementById('step-3').style.display = 'none';
  document.getElementById('step-4').style.display = 'none';
  SP_STEP_ORDER.forEach(k => {
    const el = document.getElementById('step-sp-' + k);
    if (el) el.style.display = 'none';
  });
  document.getElementById('step-sp-prevdefic').style.display = 'none';
  clearSPInspectionState();

  const draft = loadDraft();
  if (draft && draft.sysKey === 'sprinkler') {
    showDraftModal(draft, false,
      () => { restoreSPDraft(draft); },
      () => { clearDraft(); _continueSprinklerStart(); }
    );
    return;
  }
  _continueSprinklerStart();
}

function _continueSprinklerStart() {
  const prev = window._prevInspectionData;
  if (prev) {
    // Restore config text fields only — skip hidden, number, button inputs, drain fields, and deficiency note inputs
    Object.entries(prev.fieldData || {}).forEach(([elId, val]) => {
      const el = document.getElementById(elId);
      if (!el || el.type === 'button' || el.type === 'hidden' || el.type === 'number') return;
      if (/^sp-dr-/.test(elId)) return; // drain fields handled separately below
      if (/^sp-defic-note-/.test(elId)) return; // don't restore prev deficiency notes — new inspection starts clean
      el.value = val;
    });
    // Restore drain row locations from previous inspection (PSI values left blank)
    let maxDrainN = 0;
    const drainLocMap = {};
    Object.entries(prev.fieldData || {}).forEach(([id, val]) => {
      const m = id.match(/^sp-dr-loc-(\d+)$/);
      if (m) { const n = parseInt(m[1]); if (n > maxDrainN) maxDrainN = n; drainLocMap[n] = val || ''; }
    });
    if (maxDrainN > 0) {
      document.getElementById('sp-drain-tbody').innerHTML = '';
      spDrainCount = 0;
      for (let i = 1; i <= maxDrainN; i++) addSPDrainRow(drainLocMap[i] || '');
    }
    // Restore SP config number fields (System Configuration card persists across inspections)
    ['sp-heads', 'sp-coverage', 'sp-static-psi', 'sp-residual-psi'].forEach(id => {
      const el = document.getElementById(id);
      const val = (prev.fieldData || {})[id];
      if (el && val !== undefined && val !== '') el.value = val;
    });
    // Restore System Type button selections (multi-select, stored as comma-separated hidden input)
    const spTypeVal = (prev.fieldData || {})['sp-type'] || '';
    if (spTypeVal) {
      const inp = document.getElementById('sp-type');
      if (inp) inp.value = spTypeVal;
      const types = spTypeVal.split(',').map(t => t.trim());
      document.querySelectorAll('#sp-type-btns .pf-btn').forEach(btn => {
        btn.classList.toggle('selected', types.includes(btn.textContent.trim()));
      });
    }
    // Persist the property-level overview + 3/5-Year selections across inspections:
    // "which systems are present" (sp-ov-*-yn) and each 3/5-Year "Applicable?"
    // (sp-35-*-app), plus their counts/locations/last/next years (restored as text
    // above). The per-inspection "Inspecting?/Inspecting Now?" toggles (sp-ov-*-insp
    // / sp-35-*-insp) are intentionally left blank — cleared by clearSPInspectionState
    // and NOT restored here, so each new inspection chooses what it's inspecting fresh.
    const _pfd = prev.fieldData || {};
    ['wet','dry','pump','hdr','fdc','prv','af','standp','del'].forEach(k =>
      _restoreSPToggle('sp-ov-' + k + '-yn', _pfd['sp-ov-' + k + '-yn']));
    ['dv','rt','fdc','ip','standp'].forEach(k =>
      _restoreSPToggle('sp-35-' + k + '-app', _pfd['sp-35-' + k + '-app']));

    // Note: pfStates intentionally NOT restored — new inspections start with blank selections
    toast('✓ Previous config loaded');
  }

  // If there were previous deficiencies, show the tab and review step first
  const prevDefics = prev?.deficiencies || [];
  if (prevDefics.length > 0) {
    const tbody = document.getElementById('sp-prevdefic-tbody');
    if (tbody) {
      tbody.innerHTML = prevDefics.map((d, i) => `<tr>
        <td style="text-align:center;color:var(--slate);">${i + 1}</td>
        <td>${escHtml(d.item || d.description || '')}</td>
      </tr>`).join('');
    }
    document.querySelector('#sp-step-nav .step-tab[data-sstep="prevdefic"]').style.display = '';
    document.getElementById('step-sp-prevdefic').style.display = 'block';
    document.querySelectorAll('#sp-step-nav .step-tab').forEach(t => {
      t.classList.remove('active', 'done');
      if (t.dataset.sstep === 'property' || t.dataset.sstep === 'systems') t.classList.add('done');
      if (t.dataset.sstep === 'prevdefic') t.classList.add('active');
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
    return;
  }

  // No prev deficiencies — go directly to overview
  currentSPStep = 'overview';
  document.getElementById('step-sp-overview').style.display = 'block';
  document.querySelectorAll('#sp-step-nav .step-tab').forEach(t => {
    t.classList.remove('active', 'done');
    if (t.dataset.sstep === 'property' || t.dataset.sstep === 'systems') t.classList.add('done');
    else if (t.dataset.sstep === 'overview') t.classList.add('active');
  });
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function proceedFromGenericPrevDefic() {
  document.getElementById('step-generic-prevdefic').style.display = 'none';
  const prevDeficTab = document.getElementById('step-nav-prevdefic-tab');
  if (prevDeficTab) prevDeficTab.classList.remove('active');
  goStep(3);
}

function goGenericPrevDeficStep() {
  if (!activeInspectionSystem || ['fire-alarm','sprinkler'].includes(activeInspectionSystem)) return;
  document.getElementById('step-3').style.display = 'none';
  document.getElementById('step-4').style.display = 'none';
  document.getElementById('step-generic-defic').style.display = 'none';
  const extSumEl2 = document.getElementById('step-ext-summary');
  if (extSumEl2) extSumEl2.style.display = 'none';
  document.getElementById('step-generic-prevdefic').style.display = 'block';
  const prevDeficTab = document.getElementById('step-nav-prevdefic-tab');
  document.querySelectorAll('#step-nav .step-tab[data-step]').forEach(t => t.classList.remove('active'));
  document.getElementById('step-nav-defic-tab')?.classList.remove('active', 'done');
  if (prevDeficTab) { prevDeficTab.classList.remove('done'); prevDeficTab.classList.add('active'); }
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function goGenericDeficStep() {
  if (!activeInspectionSystem || ['fire-alarm','sprinkler'].includes(activeInspectionSystem)) return;
  saveDraft();

  // For systems using PASS/FAIL (not hood Y/N/N/A, not extinguisher): rebuild from FAIL rows.
  // Hood uses Y/N/N/A with manual deficiency entry — never rebuild, preserve existing rows.
  // Exit Sign & Lighting writes its deficiencies into generic-defic-tbody directly
  // (it has no `.inspect-row` items), so rebuilding would wipe them — preserve instead.
  const usesPF = !['extinguisher', 'hood', 'exit-sign-lighting', 'fire-smoke-damper'].includes(activeInspectionSystem);
  if (usesPF) {
    // The end list is now maintained live by syncGenericDeficList() (Phase 3) on
    // every result change; entering the step just re-syncs to catch programmatic
    // FAILs (demo / restore) while preserving edited + manually-added rows.
    syncGenericDeficList();
  } else if (activeInspectionSystem === 'fire-smoke-damper') {
    // Dampers maintain their deficiencies live (syncDamperDefic on every sub-check).
    // Entering the step just re-syncs each card non-destructively to catch any
    // programmatic FAILs (demo/restore) without wiping edited rows.
    if (typeof syncDamperDefic === 'function') {
      document.querySelectorAll('#damper-cards-container .damper-card').forEach(card => {
        syncDamperDefic(card.dataset.damperId);
      });
    }
  } else if (activeInspectionSystem === 'hood') {
    // Hoods maintain deficiencies live (an "N" answer → syncHoodDefic). Entering the
    // step re-syncs each checklist row non-destructively to catch programmatic "N"s
    // (demo/restore) without disturbing edited or manually-added rows.
    if (typeof syncAllHoodDefic === 'function') syncAllHoodDefic();
  }
  // For extinguisher: deficiencies managed separately (live) — don't rebuild

  // Show/hide
  document.getElementById('step-3').style.display = 'none';
  document.getElementById('step-4').style.display = 'none';
  const extSummaryEl = document.getElementById('step-ext-summary');
  if (extSummaryEl) extSummaryEl.style.display = 'none';
  document.getElementById('step-generic-defic').style.display = 'block';
  // Nav tab states
  document.querySelectorAll('#step-nav .step-tab[data-step]').forEach(t => {
    const s = parseInt(t.dataset.step);
    t.classList.remove('active', 'done');
    if (s <= 3) t.classList.add('done');
  });
  const deficTab = document.getElementById('step-nav-defic-tab');
  if (deficTab) { deficTab.classList.remove('done'); deficTab.classList.add('active'); }
  const summaryTab = document.getElementById('step-nav-summary-tab');
  if (summaryTab) summaryTab.classList.add('done');
  const prevDeficTab = document.getElementById('step-nav-prevdefic-tab');
  if (prevDeficTab && prevDeficTab.style.display !== 'none') prevDeficTab.classList.add('done');
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function addGenericDeficRow() {
  genericDeficCount++;
  const rowId = 'generic-defic-' + genericDeficCount;
  // data-manual so a live re-sync (syncGenericDeficList) preserves it.
  document.getElementById('generic-defic-tbody').insertAdjacentHTML('beforeend', `
    <tr id="${rowId}" data-manual="1">
      <td style="text-align:center;font-weight:700;color:var(--slate);">${genericDeficCount}</td>
      <td><input type="text" placeholder="Describe deficiency…"></td>
      <td><button class="del-btn" onclick="this.closest('tr').remove();if(typeof renumberGenericDefic==='function')renumberGenericDefic()">✕</button></td>
    </tr>`);
}

function proceedFromSPPrevDefic() {
  document.getElementById('step-sp-prevdefic').style.display = 'none';
  currentSPStep = 'overview';
  document.getElementById('step-sp-overview').style.display = 'block';
  document.querySelectorAll('#sp-step-nav .step-tab').forEach(t => {
    t.classList.remove('active', 'done');
    if (t.dataset.sstep === 'property' || t.dataset.sstep === 'systems') t.classList.add('done');
    else if (t.dataset.sstep === 'overview') t.classList.add('active');
  });
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function exitSprinklerInspection(target) {
  SP_STEP_ORDER.forEach(k => {
    const el = document.getElementById('step-sp-' + k);
    if (el) el.style.display = 'none';
  });
  document.getElementById('step-sp-prevdefic').style.display = 'none';
  const spPrevDeficTab = document.querySelector('#sp-step-nav .step-tab[data-sstep="prevdefic"]');
  if (spPrevDeficTab) spPrevDeficTab.style.display = 'none';
  document.getElementById('step-4').style.display = 'none';
  document.getElementById('sp-step-nav').style.display = 'none';
  document.getElementById('sp-active-banner').style.display = 'none';
  document.getElementById('step-nav').style.display = 'flex';
  activeInspectionSystem = null;
  clearDraft();
  syncMainNavDisabled();
  goStep(target === 'property' ? 1 : 2);
}

function clearSPInspectionState() {
  clearStep4State();
  SP_STEP_ORDER.forEach(k => {
    const el = document.getElementById('step-sp-' + k);
    if (!el) return;
    el.querySelectorAll('.pf-btn').forEach(b => b.classList.remove('selected'));
    el.querySelectorAll('.yna-btn').forEach(b => b.classList.remove('selected'));
    el.querySelectorAll('.inspect-row').forEach(r => { r.dataset.val = ''; delete r.dataset.spDeficId; delete r.dataset.spNoteId; });
    el.querySelectorAll('input[type=text], input[type=date], input[type=number], input[type=hidden], textarea').forEach(f => { f.value = ''; });
    el.querySelectorAll('select').forEach(s => { s.selectedIndex = 0; });
    el.querySelectorAll('.deficiency-row').forEach(d => d.classList.remove('show'));
    el.querySelectorAll('.deficiency-row input').forEach(i => { i.value = ''; });
    el.querySelectorAll('.note-row').forEach(d => d.classList.remove('show'));
    el.querySelectorAll('.note-row input').forEach(i => { i.value = ''; });
  });
  ['sp-defic-tbody', 'sp-notes-tbody', 'sp-drain-tbody'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.innerHTML = '';
  });
  spDeficCount = 0;
  spNoteCount = 0;
  spDrainCount = 0;
  addSPDrainRow();
  overallStatus = '';
  clearStatusButtonSelection();  // status buttons only — keep report-type selection intact
  document.getElementById('sp-report-type') && (document.getElementById('sp-report-type').value = 'Annual');
  document.getElementById('sp-rt-annual')?.classList.add('selected');
  document.getElementById('sp-rt-semi')?.classList.remove('selected');
  document.getElementById('sp-rt-quarterly')?.classList.remove('selected');
}

function restoreSPDraft(draft) {
  spDeficCount = draft.counters?.spDeficCount || 0;
  spNoteCount  = draft.counters?.spNoteCount  || 0;
  spDrainCount = draft.counters?.spDrainCount || 0;
  overallStatus = draft.overallStatus || '';
  if (overallStatus) setOverallStatus(overallStatus);
  Object.entries(draft.stepHTML || {}).forEach(([id, html]) => {
    if (id.startsWith('step-sp-')) {
      const el = document.getElementById(id);
      if (el) el.innerHTML = html;
    }
  });
  // Remove any stale General Notes card that old drafts may have embedded in step-sp-defic
  document.getElementById('step-sp-defic')?.querySelectorAll('.card').forEach(card => {
    if (card.querySelector('[id^="sp-note"]')) card.remove();
  });
  Object.entries(draft.step4Fields || {}).forEach(([id, val]) => {
    const el = document.getElementById(id);
    if (el) el.value = val;
  });
  if (draft.spDeficHTML) { const el = document.getElementById('sp-defic-tbody'); if (el) el.innerHTML = draft.spDeficHTML; }
  if (draft.spNotesHTML) { const el = document.getElementById('sp-notes-tbody'); if (el) el.innerHTML = draft.spNotesHTML; }
  if (draft.photos) { inspectionPhotos.length = 0; draft.photos.forEach(p => inspectionPhotos.push({...p})); renderPhotoGrid(); }
  if (draft.sigData) { const sc = document.getElementById('sig-canvas'); if (sc) { const ctx = sc.getContext('2d'); const img = new Image(); img.onload = () => { ctx.drawImage(img,0,0); sigHasData = true; }; img.src = draft.sigData; } }
  if (draft.custSigData) { const cc = document.getElementById('cust-sig-canvas'); if (cc) { const ctx = cc.getContext('2d'); const img = new Image(); img.onload = () => { ctx.drawImage(img,0,0); custSigHasData = true; }; img.src = draft.custSigData; } }
  document.getElementById('step-sp-prevdefic').style.display = 'none';
  // Show prevdefic tab if there are previous deficiencies (even when resuming a draft)
  const spPrevDefics = window._prevInspectionData?.deficiencies || [];
  if (spPrevDefics.length > 0) {
    const spPrevTab = document.querySelector('#sp-step-nav .step-tab[data-sstep="prevdefic"]');
    if (spPrevTab) {
      const tbody = document.getElementById('sp-prevdefic-tbody');
      if (tbody) {
        tbody.innerHTML = spPrevDefics.map((d, i) => `<tr>
          <td style="text-align:center;color:var(--slate);">${i + 1}</td>
          <td>${escHtml(d.item || d.description || '')}</td>
        </tr>`).join('');
      }
      spPrevTab.style.display = '';
    }
  }
  updateSPDeficiencySummary();
  const resumeStep = 'overview';
  currentSPStep = resumeStep;
  const resumeEl = document.getElementById('step-sp-' + resumeStep);
  if (resumeEl) resumeEl.style.display = 'block';
  document.querySelectorAll('#sp-step-nav .step-tab').forEach(t => {
    t.classList.remove('active', 'done');
    if (t.dataset.sstep === 'property' || t.dataset.sstep === 'systems') t.classList.add('done');
    else if (t.dataset.sstep === 'prevdefic') return; // leave prevdefic tab as-is
    else if (t.dataset.sstep === resumeStep) t.classList.add('active');
  });
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function addSPDrainRow(loc, stat, resid, post) {
  spDrainCount++;
  const n = spDrainCount;
  document.getElementById('sp-drain-tbody').insertAdjacentHTML('beforeend', `
    <tr id="sp-dr-row-${n}">
      <td style="text-align:center;color:var(--slate);">${n}</td>
      <td><input type="text" id="sp-dr-loc-${n}" value="${loc||''}"></td>
      <td><input type="number" id="sp-dr-static-${n}" value="${stat||''}"></td>
      <td><input type="number" id="sp-dr-resid-${n}" value="${resid||''}"></td>
      <td><input type="number" id="sp-dr-post-${n}" value="${post||''}"></td>
      <td><button class="del-btn" onclick="removeSPDrainRow(${n})">✕</button></td>
    </tr>`);
}

function removeSPDrainRow(n) {
  document.getElementById('sp-dr-row-' + n)?.remove();
  // Renumber remaining rows
  document.querySelectorAll('#sp-drain-tbody tr').forEach((tr, i) => {
    tr.querySelector('td:first-child').textContent = i + 1;
  });
}

function setSPBtn(btn, fieldId, val) {
  const group = btn.closest('.pf-group');
  group.querySelectorAll('.pf-btn').forEach(b => b.classList.remove('selected'));
  btn.classList.add('selected');
  const inp = document.getElementById(fieldId);
  if (inp) inp.value = val;
}

// Restore a sprinkler Y/N/NA toggle (hidden input + its button's selected state)
// from a saved value. Used to persist "which systems are present" / "applicable?"
// across inspections. The hidden input sits right after its .pf-group in the HTML.
function _restoreSPToggle(fieldId, val) {
  const inp = document.getElementById(fieldId);
  if (!inp) return;
  inp.value = val || '';
  const group = inp.previousElementSibling;
  if (!group || !group.classList || !group.classList.contains('pf-group')) return;
  group.querySelectorAll('.pf-btn').forEach(b => {
    b.classList.toggle('selected', !!val && b.textContent.trim() === val);
  });
}

function toggleSPType(btn, val) {
  btn.classList.toggle('selected');
  const selected = [...document.querySelectorAll('#sp-type-btns .pf-btn.selected')].map(b => b.textContent.trim());
  const inp = document.getElementById('sp-type');
  if (inp) inp.value = selected.join(', ');
}

function setSPReportType(val, btn) {
  reportTypeUserSet = true;
  document.getElementById('sp-report-type').value = val;
  document.querySelectorAll('#sp-rt-annual, #sp-rt-semi, #sp-rt-quarterly').forEach(b => b.classList.remove('selected'));
  if (btn) btn.classList.add('selected');
}

function clearStep4State() {
  inspectionPhotos.length = 0;
  renderPhotoGrid();
  if (typeof clearSig === 'function') clearSig();
  if (typeof clearCustSig === 'function') clearCustSig();
  ['sig-date', 'cust-sig-name', 'cust-sig-title', 'cust-sig-date', 'general-notes', 'overall-status-val'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  // Inspector print name defaults back to the standard signer (not blank) so a
  // fresh inspection starts pre-filled, matching the page's initial HTML value.
  const sigNameEl = document.getElementById('sig-name');
  if (sigNameEl) sigNameEl.value = 'Alan Antonio, F.P.E.';
  // Clear the Sign & Export "General Notes" tables so notes don't carry over from
  // a previous inspection (previously only clearFAInspectionState reset fa-notes).
  ['fa-notes-tbody', 'sp-notes-tbody'].forEach(id => {
    const tb = document.getElementById(id);
    if (tb) tb.innerHTML = '';
  });
}

function clearFAInspectionState() {
  clearStep4State();
  // Clear all PF button selections in FA steps
  FA_STEP_ORDER.forEach(k => {
    const el = document.getElementById('step-fa-' + k);
    if (!el) return;
    el.querySelectorAll('.pf-btn').forEach(b => b.classList.remove('selected'));
    el.querySelectorAll('.inspect-row').forEach(r => { r.dataset.val = ''; });
    el.querySelectorAll('.defic-row').forEach(r => { r.classList.remove('show'); });
    el.querySelectorAll('.defic-txt').forEach(i => { i.value = ''; });
    el.querySelectorAll('.yna-btn').forEach(b => b.classList.remove('y','n','na'));
    el.querySelectorAll('.note-row').forEach(r => r.classList.remove('show'));
    el.querySelectorAll('.note-input').forEach(i => { i.value = ''; });
  });
  // Reset dynamic table bodies (rows will be re-built by initFireAlarmPanel)
  ['fa-subpanel-tbody','fa-detection-tbody','fa-flow-tbody','fa-tamper-tbody','fa-battery-tbody','fa-defic-tbody','fa-notes-tbody'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.innerHTML = '';
  });
  // Clear text fields in FA steps
  FA_STEP_ORDER.forEach(k => {
    const el = document.getElementById('step-fa-' + k);
    if (!el) return;
    el.querySelectorAll('input[type=text], input[type=date], input[type=number], select, textarea').forEach(f => {
      if (f.tagName === 'SELECT') f.selectedIndex = 0;
      else f.value = '';
    });
  });
  // Remove dynamically-added static deficiency inputs
  FA_STEP_ORDER.forEach(k => {
    const el = document.getElementById('step-fa-' + k);
    if (el) el.querySelectorAll('.fa-static-defic').forEach(d => d.remove());
  });
  // Reset report type to Annual (report type is chosen on the Sign & Export step)
  const rtInput = document.getElementById('report-type');
  if (rtInput) rtInput.value = 'Annual';
  document.getElementById('step4-rt-annual')?.classList.add('selected');
  document.getElementById('step4-rt-semi')?.classList.remove('selected');
  // Reset overall status — status buttons only, so the report-type selection stays
  overallStatus = '';
  overallStatusUserSet = false;
  clearStatusButtonSelection();
  // Restore On-Site equipment defaults
  const onsiteDefaults = ['Fire Alarm Control Panel','Initiating Devices','Power Supplies','Graphic Maps','Notification Appliance Devices'];
  onsiteDefaults.forEach((val, i) => {
    const el = document.getElementById('fa-onsite-eq-' + (i + 1));
    if (el) el.value = val;
  });
}

// Date the signatures should default to: the inspection date if set, else today.
function sigDefaultDate() {
  return document.getElementById('insp-date')?.value || todayMT();
}

// Push the inspection date into both signature date fields. Called when the
// inspector changes the Date of Inspection so the signature date follows it
// instead of being stuck on whatever it defaulted to (previously today's date).
function syncSigDatesToInspection() {
  const d = sigDefaultDate();
  const sig = document.getElementById('sig-date');
  const cust = document.getElementById('cust-sig-date');
  if (sig) sig.value = d;
  if (cust) cust.value = d;
}

function syncStep4DateType() {
  const step4Date = document.getElementById('step4-insp-date');
  if (step4Date) {
    const inspDate = document.getElementById('insp-date');
    const val = inspDate?.value || todayMT();
    step4Date.value = val;
    if (inspDate && !inspDate.value) inspDate.value = val;
  }
  // Fire/smoke dampers run on a fixed 4/6-yr test interval (set on page 1) and the
  // report type isn't shown on their PDF — hide the whole card. insp-date is still
  // set (to today) just above, so the completion date is captured.
  const drtCard = document.getElementById('step4-date-rt-card');
  if (drtCard) drtCard.style.display = (activeInspectionSystem === 'fire-smoke-damper') ? 'none' : '';
  // Kitchen hoods default to Semi-Annual until the user explicitly picks a type.
  // Enforce it here so the default holds regardless of how step 4 was reached
  // (fresh build, draft restore, or a stale hidden value).
  if (activeInspectionSystem === 'hood' && !reportTypeUserSet) {
    const rt = document.getElementById('report-type');
    if (rt) rt.value = 'Semi-Annual';
  }
  const curRt = activeInspectionSystem === 'sprinkler'
    ? (document.getElementById('sp-report-type')?.value || 'Annual')
    : (document.getElementById('report-type')?.value || 'Annual');
  document.getElementById('step4-rt-annual')?.classList.toggle('selected', curRt !== 'Semi-Annual');
  document.getElementById('step4-rt-semi')?.classList.toggle('selected', curRt === 'Semi-Annual');
}

function setStep4ReportType(val) {
  reportTypeUserSet = true;
  document.getElementById('step4-rt-annual')?.classList.toggle('selected', val !== 'Semi-Annual');
  document.getElementById('step4-rt-semi')?.classList.toggle('selected', val === 'Semi-Annual');
  if (activeInspectionSystem === 'sprinkler') {
    const el = document.getElementById('sp-report-type');
    if (el) el.value = val;
    document.getElementById('sp-rt-annual')?.classList.toggle('selected', val !== 'Semi-Annual');
    document.getElementById('sp-rt-semi')?.classList.toggle('selected', val === 'Semi-Annual');
  } else {
    const el = document.getElementById('report-type');
    if (el) el.value = val;
    if (activeInspectionSystem === 'fire-alarm') {
      document.getElementById('fa-rt-annual')?.classList.toggle('selected', val !== 'Semi-Annual');
      document.getElementById('fa-rt-semi')?.classList.toggle('selected', val === 'Semi-Annual');
    }
  }
}

function goBackFromSign() {
  if (activeInspectionSystem === 'fire-alarm') {
    goFAStep('defic');
  } else if (activeInspectionSystem === 'sprinkler') {
    goSPStep('defic');
  } else {
    goStep(3);
  }
}

