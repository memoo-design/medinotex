/**
 * ============================================================
 * MediNoteX — assets/js/pages/doctor.js
 * All page-specific logic for doctor_dashboard.html.
 * Depends on: mockDatabase.js, components.js, ui-shell.js
 * ============================================================
 */
(function () {
  'use strict';

  const DOCTOR_ID = 'u-doc-1';
  const { escapeHTML, showToast, openModal, closeModal, simulateDelay, setButtonBusy,
          renderSkeletonRows, renderSkeletonCards, renderEmptyState } = MNX;

  // ----------------------------------------------------------
  // Stepper state (Upload -> OCR -> AI -> Doctor Review -> Submit)
  // ----------------------------------------------------------
  const STEPS = [
    { key: 'upload', label: 'Upload / Dictate' },
    { key: 'ocr', label: 'OCR Extraction' },
    { key: 'ai', label: 'AI Summarization' },
    { key: 'review', label: 'Doctor Review' },
    { key: 'submit', label: 'Submitted to Coder' },
  ];
  let stepIndex = 0;            // 0-based index into STEPS
  let activeCaseId = null;      // case being built/edited in the stepper
  let pendingUploadFile = null; // File object if drag/drop or browse was used
  let soapDirty = false;

  // ----------------------------------------------------------
  // Boot
  // ----------------------------------------------------------
  document.addEventListener('DOMContentLoaded', () => {
    UIShell.render({ role: 'doctor', activeKey: 'dashboard', userId: DOCTOR_ID, pageTitle: 'Dashboard' });
    document.getElementById('current-date').textContent =
      new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

    wireNav();
    wireUploadPanel();
    wireModals();
    MockDB.subscribe(() => refreshBadgesAndCounts()); // live refresh if data changes (e.g. cross-tab)

    routeFromHash();
    window.addEventListener('hashchange', routeFromHash);
  });

  function routeFromHash() {
    const key = (location.hash || '#dashboard').replace('#', '') || 'dashboard';
    showPage(key);
  }

  function wireNav() {
    // Intercept clicks on the rendered sidebar so we don't full-reload the page
    // for in-file sections (the real navigation target is the URL hash).
    document.addEventListener('click', (e) => {
      const link = e.target.closest('.mnx-nav-item[data-nav-key]');
      if (!link) return;
      const href = link.getAttribute('href') || '';
      if (href.indexOf('doctor_dashboard.html#') === 0 || href.indexOf('#') === 0) {
        e.preventDefault();
        const key = href.split('#')[1];
        location.hash = key;
      }
    });
  }

  const PAGE_TITLES = {
    dashboard: 'Dashboard', patients: 'Patients', upload: 'Upload Clinical Note',
    summaries: 'AI Summaries', revisions: 'Needs Revision', appointments: 'Appointments',
    history: 'Medical History', notifications: 'Notifications', profile: 'My Profile',
  };

  function showPage(key) {
    if (!PAGE_TITLES[key]) key = 'dashboard';
    document.querySelectorAll('.page-section').forEach((el) => el.classList.remove('active'));
    const target = document.getElementById('page-' + key);
    if (target) target.classList.add('active');
    UIShell.setActive(key === 'revisions' ? 'summaries' : key);
    UIShell.setTitle(PAGE_TITLES[key]);

    if (key === 'dashboard') renderDashboard();
    if (key === 'patients') renderPatients();
    if (key === 'summaries') renderSummaries();
    if (key === 'revisions') renderNeedsRevision();
    if (key === 'appointments') renderAppointments();
    if (key === 'history') renderHistory();
    if (key === 'notifications') renderNotifications();
    if (key === 'profile') renderProfile();
    if (key === 'upload') { populateUploadPatientSelect(); }

    document.querySelector('main')?.scrollTo({ top: 0 });
  }

  // ----------------------------------------------------------
  // Helpers
  // ----------------------------------------------------------
  function myPatients() {
    return MockDB.getUsersByRole('patient').filter((p) => p.primaryDoctorId === DOCTOR_ID);
  }
  function myCases() {
    return MockDB.getCases({ doctorId: DOCTOR_ID }).sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
  }
  function patientName(id) {
    const p = MockDB.getUser(id);
    return p ? p.firstName + ' ' + p.lastName : 'Unknown Patient';
  }
  function statusBadge(status) {
    const cls = MockDB.STATUS_BADGE_CLASS[status] || 'bdg-draft';
    const label = MockDB.STATUS_LABELS[status] || status;
    return '<span class="bdg ' + cls + '"><span class="bdg-dot"></span>' + escapeHTML(label) + '</span>';
  }
  function fmtDate(iso) {
    return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }

  function refreshBadgesAndCounts() {
    const needsRevisionCount = myCases().filter((c) => c.status === MockDB.STATUS.RETURNED_FOR_CORRECTION).length;
    const navItem = document.querySelector('.mnx-nav-item[data-nav-key="summaries"] .mnx-nav-badge');
    // dynamic badge: show count of cases needing revision next to "AI Summaries" if any exist
    const summariesLink = document.querySelector('.mnx-nav-item[data-nav-key="summaries"]');
    if (summariesLink) {
      let badge = summariesLink.querySelector('.mnx-nav-badge.dynamic');
      if (needsRevisionCount > 0) {
        if (!badge) {
          badge = document.createElement('span');
          badge.className = 'mnx-nav-badge red dynamic';
          summariesLink.appendChild(badge);
        }
        badge.textContent = needsRevisionCount;
      } else if (badge) {
        badge.remove();
      }
    }
    const notifBtn = document.getElementById('mnxNotifBtn');
    if (notifBtn) {
      const unread = MockDB.getNotifications({ userId: DOCTOR_ID, unreadOnly: true }).length;
      let dot = notifBtn.querySelector('.mnx-notif-dot');
      if (unread > 0) {
        if (!dot) {
          dot = document.createElement('span'); dot.className = 'mnx-notif-dot'; notifBtn.appendChild(dot);
        }
        dot.textContent = unread > 9 ? '9+' : unread;
      } else if (dot) { dot.remove(); }
    }
  }

  // ----------------------------------------------------------
  // DASHBOARD
  // ----------------------------------------------------------
  function renderDashboard() {
    const cases = myCases();
    const patients = myPatients();
    const pendingReview = cases.filter((c) =>
      [MockDB.STATUS.DOCTOR_REVIEW, MockDB.STATUS.RETURNED_FOR_CORRECTION].includes(c.status)).length;

    setText('statPatients', patients.length);
    setText('statNotes', cases.length);
    setText('statSummaries', cases.filter((c) => c.aiConfidence).length);
    setText('statPending', pendingReview);

    // AI engine widget — real count instead of hardcoded "3 notes queued"
    setText('aiWidgetCount', pendingReview + ' note' + (pendingReview === 1 ? '' : 's') + ' need' + (pendingReview === 1 ? 's' : '') + ' your review');

    // Recent cases table
    const tbody = document.getElementById('recentCasesBody');
    if (tbody) {
      if (cases.length === 0) {
        renderEmptyState(tbody.closest('.tbl-wrap') || tbody, { icon: '📋', title: 'No cases yet', desc: 'Upload your first clinical note to get started.' });
      } else {
        tbody.innerHTML = cases.slice(0, 6).map((c) => (
          '<tr>' +
            '<td class="td-main">' + escapeHTML(patientName(c.patientId)) + '</td>' +
            '<td>' + escapeHTML(c.soap?.assessment ? c.soap.assessment.slice(0, 40) + '…' : '—') + '</td>' +
            '<td>' + fmtDate(c.updatedAt) + '</td>' +
            '<td>' + statusBadge(c.status) + '</td>' +
          '</tr>'
        )).join('');
      }
    }

    // Needs-revision mini-alert on dashboard
    const revisionAlert = document.getElementById('dashRevisionAlert');
    const revisionCases = cases.filter((c) => c.status === MockDB.STATUS.RETURNED_FOR_CORRECTION);
    if (revisionAlert) {
      if (revisionCases.length === 0) {
        revisionAlert.classList.add('hidden');
      } else {
        revisionAlert.classList.remove('hidden');
        revisionAlert.querySelector('.revision-count').textContent = revisionCases.length;
      }
    }

    refreshBadgesAndCounts();
  }
  function setText(id, val) { const el = document.getElementById(id); if (el) el.textContent = val; }

  // ----------------------------------------------------------
  // PATIENTS
  // ----------------------------------------------------------
  function renderPatients(filter) {
    const tbody = document.getElementById('patientTbody');
    if (!tbody) return;
    let list = myPatients();
    if (filter) {
      const q = filter.toLowerCase();
      list = list.filter((p) => (p.firstName + ' ' + p.lastName).toLowerCase().includes(q));
    }
    if (list.length === 0) {
      renderEmptyState(tbody, { icon: '🧑‍⚕️', title: 'No patients found', desc: 'Try a different search term.' });
      return;
    }
    tbody.innerHTML = list.map((p) => {
      const pCases = myCases().filter((c) => c.patientId === p.id);
      const latest = pCases[0];
      return (
        '<tr>' +
          '<td class="td-main">' + escapeHTML(p.firstName + ' ' + p.lastName) + '<div style="font-size:11px;color:var(--t3)">' + escapeHTML(p.mrn || '') + '</div></td>' +
          '<td>' + ageFromDob(p.dob) + ' · ' + escapeHTML(p.gender || '') + '</td>' +
          '<td>' + escapeHTML(latest?.soap?.assessment?.slice(0, 36) || 'No notes yet') + '</td>' +
          '<td>' + pCases.length + '</td>' +
          '<td>' + (latest ? statusBadge(latest.status) : '<span class="bdg bdg-draft">No cases</span>') + '</td>' +
          '<td><a href="#upload" class="btn btn-ghost btn-xs" data-prefill-patient="' + p.id + '">New Note</a></td>' +
        '</tr>'
      );
    }).join('');

    tbody.querySelectorAll('[data-prefill-patient]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        location.hash = 'upload';
        setTimeout(() => {
          const sel = document.getElementById('uploadPatientSelect');
          if (sel) sel.value = btn.getAttribute('data-prefill-patient');
        }, 50);
      });
    });
  }
  function ageFromDob(dob) {
    if (!dob) return '—';
    const diff = Date.now() - new Date(dob).getTime();
    return Math.floor(diff / 31557600000) + 'y';
  }

  document.addEventListener('input', (e) => {
    if (e.target && e.target.id === 'patientSearch') renderPatients(e.target.value);
  });

  // ----------------------------------------------------------
  // UPLOAD STEPPER  (Upload -> OCR -> AI -> Doctor Review -> Submit)
  // ----------------------------------------------------------
  function populateUploadPatientSelect() {
    const sel = document.getElementById('uploadPatientSelect');
    if (!sel || sel.dataset.populated) return;
    sel.innerHTML = myPatients().map((p) => '<option value="' + p.id + '">' + escapeHTML(p.firstName + ' ' + p.lastName) + ' — #' + p.id.slice(-4).toUpperCase() + '</option>').join('');
    sel.dataset.populated = '1';
  }

  function renderStepper() {
    const wrap = document.getElementById('stepperTrack');
    if (!wrap) return;
    wrap.innerHTML = STEPS.map((s, i) => {
      const cls = i < stepIndex ? 'done' : i === stepIndex ? 'active' : '';
      const dotContent = i < stepIndex ? '✓' : (i + 1);
      return (
        '<div class="mnx-step ' + cls + '">' +
          '<div class="mnx-step-dot">' + dotContent + '</div>' +
          '<div class="mnx-step-label">' + escapeHTML(s.label) + '</div>' +
        '</div>'
      );
    }).join('');

    ['panel-upload', 'panel-ocr', 'panel-ai', 'panel-review', 'panel-done'].forEach((id, i) => {
      const el = document.getElementById(id);
      if (el) el.classList.toggle('hidden', i !== stepIndex);
    });
  }

  function resetStepper() {
    stepIndex = 0;
    activeCaseId = null;
    pendingUploadFile = null;
    soapDirty = false;
    document.getElementById('clinical-note-text').value = '';
    document.getElementById('char-count').textContent = '0 characters';
    document.getElementById('file-preview')?.classList.add('hidden');
    renderStepper();
  }

  function wireUploadPanel() {
    const textArea = document.getElementById('clinical-note-text');
    textArea?.addEventListener('input', function () {
      document.getElementById('char-count').textContent = this.value.length + ' characters';
    });

    const dropZone = document.getElementById('dropZone');
    const fileInput = document.getElementById('file-input');
    if (dropZone) {
      dropZone.addEventListener('dragover', (e) => { e.preventDefault(); dropZone.classList.add('drag-over'); });
      dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag-over'));
      dropZone.addEventListener('drop', (e) => {
        e.preventDefault(); dropZone.classList.remove('drag-over');
        if (e.dataTransfer.files[0]) acceptFile(e.dataTransfer.files[0]);
      });
    }
    fileInput?.addEventListener('change', (e) => { if (e.target.files[0]) acceptFile(e.target.files[0]); });

    document.getElementById('removeFileBtn')?.addEventListener('click', () => {
      pendingUploadFile = null;
      document.getElementById('file-preview').classList.add('hidden');
      if (fileInput) fileInput.value = '';
    });

    document.getElementById('voiceNoteBtn')?.addEventListener('click', startVoiceNote);
    document.getElementById('startProcessingBtn')?.addEventListener('click', handleStartProcessing);
    document.getElementById('saveSoapBtn')?.addEventListener('click', handleSaveSoap);
    document.getElementById('submitToCoderBtn')?.addEventListener('click', handleSubmitToCoder);
    document.getElementById('newNoteBtn')?.addEventListener('click', () => { resetStepper(); location.hash = 'upload'; });

    document.querySelectorAll('#panel-review [data-soap-field]').forEach((ta) => {
      ta.addEventListener('input', () => {
        soapDirty = true;
        const ind = document.getElementById('unsavedIndicator');
        if (ind) ind.classList.remove('hidden');
      });
    });

    renderStepper();
  }

  function acceptFile(file) {
    pendingUploadFile = file;
    document.getElementById('file-name').textContent = file.name;
    document.getElementById('file-size').textContent = (file.size / 1024).toFixed(1) + ' KB';
    document.getElementById('file-preview').classList.remove('hidden');
  }

  function startVoiceNote() {
    showToast('Voice recording started — speak your note…', 'info');
    const btn = document.getElementById('voiceNoteBtn');
    btn.classList.add('ring-2', 'ring-red-400');
    setTimeout(() => {
      btn.classList.remove('ring-2', 'ring-red-400');
      showToast('Voice note captured and added to the text field.', 'success');
      const ta = document.getElementById('clinical-note-text');
      if (ta && !ta.value.trim()) {
        ta.value = 'Patient reports stable symptoms since last visit. No new complaints. Vitals within normal limits.';
        ta.dispatchEvent(new Event('input'));
      }
    }, 3000);
  }

  async function handleStartProcessing() {
    const patientId = document.getElementById('uploadPatientSelect').value;
    const visitType = document.getElementById('uploadVisitType').value;
    const text = document.getElementById('clinical-note-text').value.trim();

    if (!patientId) { showToast('Please select a patient first.', 'warning'); return; }
    if (!pendingUploadFile && text.length < 20) {
      showToast('Type at least 20 characters or upload a file before processing.', 'warning');
      return;
    }

    const btn = document.getElementById('startProcessingBtn');
    const restore = setButtonBusy(btn, 'Starting…');
    await simulateDelay(300, 600);
    restore();

    stepIndex = 1; // -> OCR (or skip straight to AI for typed notes)
    renderStepper();

    if (pendingUploadFile) {
      await runOcrStep();
    } else {
      stepIndex = 2;
      renderStepper();
    }
    await runAiStep(patientId, visitType, text);
  }

  async function runOcrStep() {
    const msgEl = document.getElementById('ocrStatusMsg');
    const bar = document.getElementById('ocrProgressBar');
    const messages = ['Detecting document layout…', 'Extracting text regions…', 'Validating extraction confidence…'];
    for (let i = 0; i < messages.length; i++) {
      if (msgEl) msgEl.textContent = messages[i];
      if (bar) bar.style.width = Math.round(((i + 1) / messages.length) * 100) + '%';
      await simulateDelay(500, 900);
    }
    showToast('Text extracted from uploaded document.', 'success');
    stepIndex = 2;
    renderStepper();
  }

  async function runAiStep(patientId, visitType, rawText) {
    const msgEl = document.getElementById('aiStatusMsg');
    const bar = document.getElementById('aiProgressBar');
    const steps = ['Parsing clinical content…', 'Extracting key symptoms…', 'Analyzing diagnosis patterns…', 'Generating SOAP structure…', 'Finalizing summary…'];
    for (let i = 0; i < steps.length; i++) {
      if (msgEl) msgEl.textContent = steps[i];
      if (bar) bar.style.width = Math.round(((i + 1) / steps.length) * 100) + '%';
      await simulateDelay(450, 750);
    }

    const soapDraft = buildSoapDraft(patientId, visitType, rawText);
    const newCase = MockDB.createCase({
      patientId, doctorId: DOCTOR_ID,
      sourceType: pendingUploadFile ? 'upload' : 'typed',
      soapDraft,
    });
    MockDB.updateCaseStatus(newCase.id, MockDB.STATUS.DOCTOR_REVIEW, 'AI summary ready — awaiting doctor review');
    activeCaseId = newCase.id;

    showToast('AI summary generated (' + newCase.aiConfidence + '% confidence).', 'success');
    stepIndex = 3;
    renderStepper();
    loadCaseIntoReview(newCase.id);
  }

  /** Lightweight client-side templating — NOT a real AI call (frontend-only by design). */
  function buildSoapDraft(patientId, visitType, rawText) {
    const p = MockDB.getUser(patientId);
    const name = p ? p.firstName + ' ' + p.lastName : 'the patient';
    const age = p ? ageFromDob(p.dob) : '—';
    const excerpt = rawText ? rawText.slice(0, 160) : 'Clinical findings extracted from the uploaded document.';
    return {
      subjective: name + ', ' + age + ' old, presenting for a ' + (visitType || 'consultation') + '. ' + excerpt,
      objective: 'Vitals reviewed and within the range documented in the encounter. Physical exam findings recorded as charted.',
      assessment: 'Clinical impression pending physician confirmation based on the information above.',
      plan: 'Continue current management. Doctor to confirm, edit, and finalize before submitting for coding review.',
    };
  }

  function loadCaseIntoReview(caseId) {
    const c = MockDB.getCase(caseId);
    if (!c) return;
    document.getElementById('reviewPatientName').textContent = patientName(c.patientId);
    document.getElementById('reviewConfidence').textContent = c.aiConfidence + '%';
    document.querySelector('[data-soap-field="subjective"]').value = c.soap.subjective || '';
    document.querySelector('[data-soap-field="objective"]').value = c.soap.objective || '';
    document.querySelector('[data-soap-field="assessment"]').value = c.soap.assessment || '';
    document.querySelector('[data-soap-field="plan"]').value = c.soap.plan || '';
    soapDirty = false;
    document.getElementById('unsavedIndicator')?.classList.add('hidden');
  }

  async function handleSaveSoap() {
    if (!activeCaseId) return;
    const btn = document.getElementById('saveSoapBtn');
    const restore = setButtonBusy(btn, 'Saving…');
    await simulateDelay(300, 500);
    MockDB.updateSoap(activeCaseId, {
      subjective: document.querySelector('[data-soap-field="subjective"]').value,
      objective: document.querySelector('[data-soap-field="objective"]').value,
      assessment: document.querySelector('[data-soap-field="assessment"]').value,
      plan: document.querySelector('[data-soap-field="plan"]').value,
    });
    restore('Save Changes');
    soapDirty = false;
    document.getElementById('unsavedIndicator')?.classList.add('hidden');
    showToast('SOAP note saved.', 'success');
  }

  async function handleSubmitToCoder() {
    if (!activeCaseId) return;
    if (soapDirty) { await handleSaveSoap(); }
    const btn = document.getElementById('submitToCoderBtn');
    const restore = setButtonBusy(btn, 'Submitting…');
    await simulateDelay(500, 900);
    MockDB.submitToCoder(activeCaseId);
    restore('Submit to Coder');
    stepIndex = 4;
    renderStepper();
    showToast('Case submitted to the medical coder.', 'success', 'Submitted');
    renderDashboard();
  }

  /** Entry point used by the Needs Revision list to jump straight to Step 4 with the case pre-loaded. */
  function reviseCase(caseId) {
    const c = MockDB.getCase(caseId);
    if (!c) return;
    MockDB.updateCaseStatus(caseId, MockDB.STATUS.DOCTOR_REVIEW, 'Doctor revising returned case');
    activeCaseId = caseId;
    stepIndex = 3;
    location.hash = 'upload';
    setTimeout(() => { renderStepper(); loadCaseIntoReview(caseId); }, 50);
    showToast('Case loaded for revision.', 'info');
  }
  window.MNX_reviseCase = reviseCase; // exposed for inline onclick handlers rendered from templates

  // ----------------------------------------------------------
  // AI SUMMARIES (My Cases list + SOAP viewer)
  // ----------------------------------------------------------
  function renderSummaries() {
    const container = document.getElementById('summariesList');
    if (!container) return;
    renderSkeletonCards(container, 3);
    setTimeout(() => {
      const cases = myCases().filter((c) => c.aiConfidence);
      if (cases.length === 0) {
        renderEmptyState(container, { icon: '🧠', title: 'No AI summaries yet', desc: 'Generate one from the Upload page.' });
        return;
      }
      container.innerHTML = cases.map((c) => (
        '<div class="card card-lift" style="cursor:pointer" data-view-case="' + c.id + '">' +
          '<div class="card-bd">' +
            '<div style="display:flex;justify-content:space-between;align-items:start;gap:8px;margin-bottom:8px">' +
              '<div><div style="font-weight:700;color:var(--t1)">' + escapeHTML(patientName(c.patientId)) + '</div>' +
              '<div style="font-size:11.5px;color:var(--t3)">' + fmtDate(c.createdAt) + ' · ' + c.aiConfidence + '% confidence</div></div>' +
              statusBadge(c.status) +
            '</div>' +
            '<p style="font-size:12.5px;color:var(--t2);line-height:1.5;max-height:54px;overflow:hidden">' + escapeHTML(c.soap.assessment || '') + '</p>' +
          '</div>' +
        '</div>'
      )).join('');
      container.querySelectorAll('[data-view-case]').forEach((card) => {
        card.addEventListener('click', () => openSoapViewer(card.getAttribute('data-view-case')));
      });
    }, 350);
  }

  function openSoapViewer(caseId) {
    const c = MockDB.getCase(caseId);
    if (!c) return;
    document.getElementById('soapModalPatient').textContent = patientName(c.patientId) + ' — AI SOAP Summary';
    document.getElementById('soapModalMeta').textContent = fmtDate(c.createdAt) + ' · ' + c.aiConfidence + '% AI confidence';
    document.getElementById('soapModalStatus').innerHTML = statusBadge(c.status);
    document.getElementById('soap-view-S').textContent = c.soap.subjective || '—';
    document.getElementById('soap-view-O').textContent = c.soap.objective || '—';
    document.getElementById('soap-view-A').textContent = c.soap.assessment || '—';
    document.getElementById('soap-view-P').textContent = c.soap.plan || '—';
    switchSoapTab('S');
    openModal('soapViewerModal');
  }
  window.switchSoapTab = function (letter) {
    document.querySelectorAll('.soap-content').forEach((el) => el.classList.add('hidden'));
    document.querySelectorAll('.soap-tab').forEach((el) => el.classList.remove('active'));
    document.getElementById('soap-view-' + letter)?.parentElement.classList.remove('hidden');
    document.querySelector('.soap-tab[data-tab="' + letter + '"]')?.classList.add('active');
  };

  // ----------------------------------------------------------
  // NEEDS REVISION
  // ----------------------------------------------------------
  function renderNeedsRevision() {
    const container = document.getElementById('revisionsList');
    if (!container) return;
    const cases = myCases().filter((c) => c.status === MockDB.STATUS.RETURNED_FOR_CORRECTION);
    if (cases.length === 0) {
      renderEmptyState(container, { icon: '✅', title: 'Nothing needs revision', desc: 'Cases returned by the coder will appear here.' });
      return;
    }
    container.innerHTML = cases.map((c) => {
      const reasonEntry = c.history.slice().reverse().find((h) => h.event.indexOf('Returned for correction') === 0);
      const reason = reasonEntry ? reasonEntry.event.replace('Returned for correction: ', '') : 'No reason provided';
      return (
        '<div class="card revision-card">' +
          '<div class="card-bd">' +
            '<div style="display:flex;justify-content:space-between;gap:8px;align-items:start;margin-bottom:8px">' +
              '<div style="font-weight:700;color:var(--t1)">' + escapeHTML(patientName(c.patientId)) + '</div>' +
              statusBadge(c.status) +
            '</div>' +
            '<div style="font-size:12.5px;color:var(--t2);margin-bottom:10px"><strong>Coder note:</strong> ' + escapeHTML(reason) + '</div>' +
            '<button class="btn btn-primary btn-sm" onclick="MNX_reviseCase(\'' + c.id + '\')">Revise &amp; Resubmit</button>' +
          '</div>' +
        '</div>'
      );
    }).join('');
  }

  // ----------------------------------------------------------
  // APPOINTMENTS
  // ----------------------------------------------------------
  function renderAppointments() {
    const container = document.getElementById('appointmentsList');
    if (!container) return;
    const apts = MockDB.getAppointments({ doctorId: DOCTOR_ID });
    if (apts.length === 0) {
      renderEmptyState(container, { icon: '📅', title: 'No appointments scheduled' });
      return;
    }
    container.innerHTML = apts.map((a) => (
      '<div class="card card-lift">' +
        '<div class="card-bd">' +
          '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">' +
            '<span class="bdg bdg-pending">' + new Date(a.scheduledAt).toLocaleString('en-US', { weekday: 'short', hour: 'numeric', minute: '2-digit' }) + '</span>' +
            '<span class="bdg bdg-' + (a.status === 'confirmed' ? 'approved' : 'pending') + '">' + escapeHTML(a.status) + '</span>' +
          '</div>' +
          '<div style="font-weight:700;color:var(--t1)">' + escapeHTML(patientName(a.patientId)) + '</div>' +
          '<div style="font-size:12.5px;color:var(--t3)">' + escapeHTML(a.reason || a.visitType) + '</div>' +
        '</div>' +
      '</div>'
    )).join('');
  }

  // ----------------------------------------------------------
  // MEDICAL HISTORY
  // ----------------------------------------------------------
  function renderHistory() {
    const select = document.getElementById('historyPatientSelect');
    if (select && !select.dataset.populated) {
      select.innerHTML = myPatients().map((p) => '<option value="' + p.id + '">' + escapeHTML(p.firstName + ' ' + p.lastName) + '</option>').join('');
      select.dataset.populated = '1';
      select.addEventListener('change', () => renderHistoryTimeline(select.value));
    }
    if (select) renderHistoryTimeline(select.value);
  }
  function renderHistoryTimeline(patientId) {
    const container = document.getElementById('historyTimeline');
    if (!container) return;
    const cases = myCases().filter((c) => c.patientId === patientId);
    if (cases.length === 0) {
      renderEmptyState(container, { icon: '🕓', title: 'No history yet for this patient' });
      return;
    }
    let entries = [];
    cases.forEach((c) => c.history.forEach((h) => entries.push({ at: h.at, event: h.event, caseId: c.id })));
    entries.sort((a, b) => new Date(b.at) - new Date(a.at));
    container.innerHTML = entries.map((e) => (
      '<div style="display:flex;gap:12px;padding:10px 0;border-bottom:1px solid var(--border)">' +
        '<div style="font-size:11px;color:var(--t3);white-space:nowrap;width:90px">' + fmtDate(e.at) + '</div>' +
        '<div style="font-size:13px;color:var(--t1)">' + escapeHTML(e.event) + '</div>' +
      '</div>'
    )).join('');
  }

  // ----------------------------------------------------------
  // NOTIFICATIONS
  // ----------------------------------------------------------
  function renderNotifications() {
    const container = document.getElementById('notificationsList');
    if (!container) return;
    const notifs = MockDB.getNotifications({ userId: DOCTOR_ID });
    if (notifs.length === 0) {
      renderEmptyState(container, { icon: '🔔', title: 'No notifications' });
      return;
    }
    container.innerHTML = notifs.map((n) => (
      '<div class="card" style="margin-bottom:8px;' + (n.isRead ? '' : 'border-left:3px solid var(--primary)') + '" data-notif="' + n.id + '">' +
        '<div class="card-bd" style="display:flex;justify-content:space-between;gap:10px">' +
          '<div><div style="font-weight:700;font-size:13px;color:var(--t1)">' + escapeHTML(n.title) + '</div>' +
          '<div style="font-size:12.5px;color:var(--t2);margin-top:2px">' + escapeHTML(n.body) + '</div>' +
          '<div style="font-size:11px;color:var(--t3);margin-top:6px">' + new Date(n.createdAt).toLocaleString() + '</div></div>' +
          (n.isRead ? '' : '<button class="btn btn-ghost btn-xs" data-mark-read="' + n.id + '">Mark read</button>') +
        '</div>' +
      '</div>'
    )).join('');
    container.querySelectorAll('[data-mark-read]').forEach((btn) => {
      btn.addEventListener('click', () => { MockDB.markNotificationRead(btn.getAttribute('data-mark-read')); renderNotifications(); refreshBadgesAndCounts(); });
    });
  }
  document.addEventListener('click', (e) => {
    if (e.target && e.target.id === 'markAllReadBtn') {
      MockDB.markAllRead(DOCTOR_ID);
      renderNotifications();
      refreshBadgesAndCounts();
      showToast('All notifications marked as read.', 'success');
    }
  });

  // ----------------------------------------------------------
  // PROFILE
  // ----------------------------------------------------------
  function renderProfile() {
    const u = MockDB.getUser(DOCTOR_ID);
    if (!u) return;
    setText('profileName', u.firstName + ' ' + u.lastName);
    setText('profileSpecialty', u.specialty + ' · ' + u.license);
    setText('profileEmail', u.email);
    setText('profileFacility', u.facility);
    setText('profileDepartment', u.department);
  }
  document.addEventListener('click', (e) => {
    if (e.target && e.target.id === 'saveProfileBtn') showToast('Profile changes saved.', 'success');
  });

  // ----------------------------------------------------------
  // MODALS (logout confirm, add patient)
  // ----------------------------------------------------------
  function wireModals() {
    document.getElementById('confirmLogoutBtn')?.addEventListener('click', () => {
      closeModal('logoutModal');
      showToast('Signed out.', 'info');
      setTimeout(() => { window.location.href = 'login.html'; }, 600);
    });
    document.getElementById('mnxUserChip')?.addEventListener('click', () => { location.hash = 'profile'; });

    document.getElementById('addPatientForm')?.addEventListener('submit', (e) => {
      e.preventDefault();
      showToast('Patient intake is finalized by Admin; this request has been queued. (Frontend demo — no backend yet.)', 'info');
      closeModal('addPatientModal');
    });
  }
})();
