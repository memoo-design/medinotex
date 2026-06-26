/**
 * ============================================================
 * MediNoteX — assets/js/pages/doctor.js
 * All page-specific logic for doctor_dashboard.html.
 * Depends on: mockDatabase.js, components.js, ui-shell.js
 * ============================================================
 */
(function () {
  'use strict';

  const { escapeHTML, showToast, openModal, closeModal, simulateDelay, setButtonBusy,
          renderSkeletonRows, renderSkeletonCards, renderEmptyState } = MNX;

  const STATUS = MockDB.STATUS;
  const STATUS_LABELS = MockDB.STATUS_LABELS;
  const STATUS_BADGE_CLASS = MockDB.STATUS_BADGE_CLASS;

  let currentUser = null;
  let patientsCache = [];
  let summariesCache = [];

  function summaryToCase(s) {
    return {
      id: String(s.id),
      patientId: String(s.patient_id),
      doctorId: String(currentUser.id),
      status: s.workflow_status,
      soap: {
        subjective: s.subjective || '',
        objective: s.objective || '',
        assessment: s.assessment || '',
        plan: s.plan || '',
      },
      aiConfidence: s.ai_confidence || 0,
      createdAt: s.created_at,
      updatedAt: s.updated_at || s.created_at,
      history: s.history || [],
      patientName: s.patient_name,
      coderReturnReason: s.coder_return_reason,
    };
  }

  function patientToUi(p) {
    const parts = (p.name || '').split(' ');
    return {
      id: String(p.id),
      firstName: parts[0] || '',
      lastName: parts.slice(1).join(' ') || '',
      age: p.age,
      gender: p.sex,
      diagnosis: p.diagnosis,
      status: p.status,
      primaryDoctorId: String(currentUser.id),
    };
  }

  async function refreshData() {
    const [patientsRes, summariesRes] = await Promise.all([
      MNXApi.listPatients({ per_page: 100 }),
      MNXApi.listSummaries({ per_page: 100 }),
    ]);
    patientsCache = (patientsRes.patients || []).map(patientToUi);
    summariesCache = (summariesRes.summaries || []).map(summaryToCase);
  }

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
  let activeCaseId = null;      // summary id when AI summary exists
  let activeNoteId = null;      // clinical note id for fallback submit
  let pendingUploadFile = null; // File object if drag/drop or browse was used
  let soapDirty = false;

  // ----------------------------------------------------------
  // Boot
  // ----------------------------------------------------------
  document.addEventListener('DOMContentLoaded', async () => {
    try {
      currentUser = await MNXApi.me();
    } catch (e) {
      window.location.href = '/login';
      return;
    }

    await refreshData();

    UIShell.render({
      role: 'doctor',
      activeKey: 'dashboard',
      userId: String(currentUser.id),
      pageTitle: 'Dashboard',
      userName: currentUser.full_name,
      profilePicture: currentUser.profile_picture || '',
    });

    const greeting = document.querySelector('#page-dashboard h1');
    if (greeting && currentUser.full_name) {
      const first = currentUser.full_name.replace(/^Dr\.?\s*/i, '').split(' ')[0];
      greeting.textContent = 'Good morning, Dr. ' + first + ' 👋';
    }

    document.getElementById('current-date').textContent =
      new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

    wireNav();
    wireUploadPanel();
    wireModals();
    wireProfileSettings();
    refreshBadgesAndCounts();

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
      if (href.indexOf('doctor_dashboard.html#') === 0 || href.indexOf('/dashboard#') === 0 || href.indexOf('/#') === 0 || href.indexOf('#') === 0) {
        e.preventDefault();
        const key = href.split('#')[1];
        location.hash = key;
      }
    });
  }

  const PAGE_TITLES = {
    dashboard: 'Dashboard', patients: 'Patients', upload: 'Upload Clinical Note',
    summaries: 'AI Summaries', revisions: 'Needs Revision', appointments: 'Appointments',
    history: 'Medical History', notifications: 'Notifications', profile: 'Profile Settings',
  };

  function profileInitials(name) {
    if (!name) return '??';
    const parts = name.replace(/^Dr\.?\s*/i, '').trim().split(/\s+/).filter(Boolean);
    if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    return (parts[0] || '??').slice(0, 2).toUpperCase();
  }

  function syncShellUser() {
    UIShell.updateUser({
      userName: currentUser.full_name,
      profilePicture: currentUser.profile_picture || '',
    });
  }

  function updateProfileAvatarUI() {
    const img = document.getElementById('profileAvatarImg');
    const initials = document.getElementById('profileAvatarInitials');
    const removeBtn = document.getElementById('removeAvatarBtn');
    if (!img || !initials) return;
    if (currentUser && currentUser.profile_picture) {
      img.src = currentUser.profile_picture + '?t=' + Date.now();
      img.classList.remove('hidden');
      initials.classList.add('hidden');
      if (removeBtn) removeBtn.disabled = false;
    } else {
      img.classList.add('hidden');
      img.removeAttribute('src');
      initials.textContent = profileInitials(currentUser ? currentUser.full_name : '');
      initials.classList.remove('hidden');
      if (removeBtn) removeBtn.disabled = true;
    }
  }

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
    return patientsCache;
  }
  function myCases() {
    return summariesCache.slice().sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
  }
  function patientName(id) {
    const p = myPatients().find((x) => x.id === String(id));
    if (p) return p.firstName + ' ' + p.lastName;
    const c = myCases().find((x) => x.patientId === String(id));
    return c && c.patientName ? c.patientName : 'Unknown Patient';
  }
  function statusBadge(status) {
    const cls = STATUS_BADGE_CLASS[status] || 'bdg-draft';
    const label = STATUS_LABELS[status] || status;
    return '<span class="bdg ' + cls + '"><span class="bdg-dot"></span>' + escapeHTML(label) + '</span>';
  }
  function fmtDate(iso) {
    return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }

  function refreshBadgesAndCounts() {
    const needsRevisionCount = myCases().filter((c) => c.status === STATUS.RETURNED_FOR_CORRECTION).length;
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
      MNXApi.listNotifications().then((res) => {
        const unread = res.unread_count || 0;
        let dot = notifBtn.querySelector('.mnx-notif-dot');
        if (unread > 0) {
          if (!dot) {
            dot = document.createElement('span'); dot.className = 'mnx-notif-dot'; notifBtn.appendChild(dot);
          }
          dot.textContent = unread > 9 ? '9+' : unread;
        } else if (dot) { dot.remove(); }
      }).catch(() => {});
    }
  }

  // ----------------------------------------------------------
  // DASHBOARD
  // ----------------------------------------------------------
  function renderDashboard() {
    const cases = myCases();
    const patients = myPatients();
    const pendingReview = cases.filter((c) =>
      [STATUS.DOCTOR_REVIEW, STATUS.RETURNED_FOR_CORRECTION].includes(c.status)).length;

    MNXApi.dashboardStats().then((stats) => {
      setText('statPatients', stats.total_patients ?? patients.length);
      setText('statNotes', stats.notes_this_week ?? cases.length);
      setText('statSummaries', stats.ai_summaries ?? cases.filter((c) => c.aiConfidence).length);
      setText('statPending', pendingReview);

      setText('aiWidgetCount', pendingReview + ' note' + (pendingReview === 1 ? '' : 's') + ' need' + (pendingReview === 1 ? 's' : '') + ' your review');

      const revisionAlert = document.getElementById('dashRevisionAlert');
      const revisionCount = stats.revisions_needed ?? cases.filter((c) => c.status === STATUS.RETURNED_FOR_CORRECTION).length;
      if (revisionAlert) {
        if (revisionCount === 0) {
          revisionAlert.classList.add('hidden');
        } else {
          revisionAlert.classList.remove('hidden');
          revisionAlert.querySelector('.revision-count').textContent = revisionCount;
        }
      }
    }).catch(() => {
      setText('statPatients', patients.length);
      setText('statNotes', cases.length);
      setText('statSummaries', cases.filter((c) => c.aiConfidence).length);
      setText('statPending', pendingReview);
    });

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

    // Needs-revision mini-alert handled via dashboardStats above
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
    sel.innerHTML = myPatients().map((p) => '<option value="' + p.id + '">' + escapeHTML(p.firstName + ' ' + p.lastName) + ' — #' + String(p.id).slice(-4).toUpperCase() + '</option>').join('');
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
    activeNoteId = null;
    pendingUploadFile = null;
    soapDirty = false;
    document.getElementById('clinical-note-text').value = '';
    document.getElementById('char-count').textContent = '0 characters';
    document.getElementById('file-preview')?.classList.add('hidden');
    setReviewMode({ hasAi: true, noteText: '' });
    updateSubmitButtonState('');
    renderStepper();
  }

  function setReviewMode(opts) {
    const hasAi = opts.hasAi !== false;
    const noteText = opts.noteText || '';
    const patientLabel = opts.patientName || '';

    document.getElementById('aiUnavailableBanner')?.classList.toggle('hidden', hasAi);
    document.getElementById('soapFieldsWrap')?.classList.toggle('hidden', !hasAi);
    document.getElementById('originalNoteReview')?.classList.toggle('hidden', hasAi);
    document.getElementById('reviewConfidenceWrap')?.classList.toggle('hidden', !hasAi);
    document.getElementById('saveSoapBtn')?.classList.toggle('hidden', !hasAi);

    const origEl = document.getElementById('reviewOriginalText');
    if (origEl) origEl.value = noteText;

    if (patientLabel && document.getElementById('reviewPatientName')) {
      document.getElementById('reviewPatientName').textContent = patientLabel;
    }
  }

  function updateSubmitButtonState(noteText) {
    const text = noteText === 'available' ? 'ok' : (noteText || '').trim();
    const btn = document.getElementById('submitToCoderBtn');
    const errEl = document.getElementById('noTextSubmitError');
    const hasText = noteText === 'available' || text.length > 0;
    const canSubmit = hasText && (activeCaseId || activeNoteId);
    if (btn) btn.disabled = !canSubmit;
    if (errEl) errEl.classList.toggle('hidden', canSubmit || !activeNoteId);
  }

  async function showAiUnavailableReview(noteId) {
    activeNoteId = noteId;
    activeCaseId = null;

    let noteDetail;
    try {
      noteDetail = await MNXApi.getNote(noteId);
    } catch (e) {
      showToast('Could not load note details.', 'danger');
      stepIndex = 0;
      renderStepper();
      return;
    }

    const text = (noteDetail.ocr_text || noteDetail.raw_text || '').trim();
    const patientLabel = noteDetail.patient_name || patientName(document.getElementById('uploadPatientSelect')?.value);

    stepIndex = 3;
    renderStepper();
    setReviewMode({ hasAi: false, noteText: text, patientName: patientLabel });
    updateSubmitButtonState(text);

    if (text) {
      showToast('AI summarization is currently unavailable. You can still submit the original uploaded note to the medical coder.', 'warning');
    } else {
      showToast('No clinical note text is available to submit.', 'danger');
    }
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

    try {
      let noteId;
      if (pendingUploadFile) {
        stepIndex = 1;
        renderStepper();
        await runOcrStep();

        const fd = new FormData();
        fd.append('clinical_file', pendingUploadFile);
        fd.append('patient_id', patientId);
        fd.append('visit_type', visitType);
        fd.append('use_soap', 'true');
        fd.append('use_diagnosis', 'true');
        fd.append('use_treatment', 'true');
        fd.append('use_risk', 'false');

        const uploadRes = await MNXApi.uploadFile(fd);
        noteId = uploadRes.note.id;
      } else {
        stepIndex = 2;
        renderStepper();
        const uploadRes = await MNXApi.uploadText({
          patient_id: parseInt(patientId, 10),
          visit_type: visitType,
          text,
        });
        noteId = uploadRes.note.id;
      }

      activeNoteId = noteId;
      try {
        await runAiStep(noteId);
      } catch (aiErr) {
        await showAiUnavailableReview(noteId);
      }
    } catch (err) {
      showToast(err.message || 'Upload failed', 'danger');
      stepIndex = 0;
      activeNoteId = null;
      activeCaseId = null;
      renderStepper();
    } finally {
      restore();
    }
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

  async function runAiStep(noteId) {
    const msgEl = document.getElementById('aiStatusMsg');
    const bar = document.getElementById('aiProgressBar');
    const steps = ['Parsing clinical content…', 'Extracting key symptoms…', 'Analyzing diagnosis patterns…', 'Generating SOAP structure…', 'Finalizing summary…'];
    for (let i = 0; i < steps.length; i++) {
      if (msgEl) msgEl.textContent = steps[i];
      if (bar) bar.style.width = Math.round(((i + 1) / steps.length) * 100) + '%';
      await simulateDelay(200, 400);
    }

    const res = await MNXApi.generateSummary(noteId);
    const newCase = summaryToCase(res.summary);
    activeCaseId = newCase.id;
    activeNoteId = noteId;
    await refreshData();

    showToast('AI summary generated (' + (newCase.aiConfidence || '—') + '% confidence).', 'success');
    stepIndex = 3;
    renderStepper();
    loadCaseIntoReview(newCase.id);
    updateSubmitButtonState('available');
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
    const c = myCases().find((x) => x.id === String(caseId));
    if (!c) return;
    setReviewMode({ hasAi: true, patientName: patientName(c.patientId) });
    document.getElementById('reviewConfidence').textContent = (c.aiConfidence || '—') + '%';
    document.querySelector('[data-soap-field="subjective"]').value = c.soap.subjective || '';
    document.querySelector('[data-soap-field="objective"]').value = c.soap.objective || '';
    document.querySelector('[data-soap-field="assessment"]').value = c.soap.assessment || '';
    document.querySelector('[data-soap-field="plan"]').value = c.soap.plan || '';
    soapDirty = false;
    document.getElementById('unsavedIndicator')?.classList.add('hidden');
    updateSubmitButtonState('available');
  }

  async function handleSaveSoap() {
    if (!activeCaseId) return;
    const btn = document.getElementById('saveSoapBtn');
    const restore = setButtonBusy(btn, 'Saving…');
    try {
      await MNXApi.updateSummary(activeCaseId, {
        subjective: document.querySelector('[data-soap-field="subjective"]').value,
        objective: document.querySelector('[data-soap-field="objective"]').value,
        assessment: document.querySelector('[data-soap-field="assessment"]').value,
        plan: document.querySelector('[data-soap-field="plan"]').value,
      });
      await refreshData();
      soapDirty = false;
      document.getElementById('unsavedIndicator')?.classList.add('hidden');
      showToast('SOAP note saved.', 'success');
    } catch (err) {
      showToast(err.message || 'Save failed', 'danger');
    } finally {
      restore('Save Changes');
    }
  }

  async function handleSubmitToCoder() {
    if (!activeCaseId && !activeNoteId) {
      showToast('No clinical note text is available to submit.', 'warning');
      return;
    }
    if (soapDirty && activeCaseId) { await handleSaveSoap(); }
    const btn = document.getElementById('submitToCoderBtn');
    const restore = setButtonBusy(btn, 'Submitting…');
    try {
      if (activeCaseId) {
        await MNXApi.submitToCoder(activeCaseId);
      } else {
        await MNXApi.submitNoteToCoder(activeNoteId);
      }
      await refreshData();
      stepIndex = 4;
      activeCaseId = null;
      activeNoteId = null;
      renderStepper();
      showToast('Case submitted to the medical coder.', 'success', 'Submitted');
      renderDashboard();
    } catch (err) {
      showToast(err.message || 'Submit failed', 'danger');
    } finally {
      restore('Submit to Coder');
    }
  }

  /** Entry point used by the Needs Revision list to jump straight to Step 4 with the case pre-loaded. */
  function reviseCase(caseId) {
    const c = myCases().find((x) => x.id === String(caseId));
    if (!c) return;
    activeCaseId = c.id;
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
    const c = myCases().find((x) => x.id === String(caseId));
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
    MNXApi.listRevisions().then((items) => {
      const cases = items.map(summaryToCase);
      if (cases.length === 0) {
        renderEmptyState(container, { icon: '✅', title: 'Nothing needs revision', desc: 'Cases returned by the coder will appear here.' });
        return;
      }
      container.innerHTML = cases.map((c) => {
        const reasonEntry = c.history.slice().reverse().find((h) => h.event.indexOf('Returned for correction') === 0);
        const reason = reasonEntry ? reasonEntry.event.replace('Returned for correction: ', '') : (c.coderReturnReason || 'No reason provided');
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
    }).catch(() => {
      renderEmptyState(container, { icon: '⚠️', title: 'Could not load revisions' });
    });
  }

  // ----------------------------------------------------------
  // APPOINTMENTS
  // ----------------------------------------------------------
  function renderAppointments() {
    const container = document.getElementById('appointmentsList');
    if (!container) return;
    MNXApi.listAppointments().then((apts) => {
      if (apts.length === 0) {
        renderEmptyState(container, { icon: '📅', title: 'No appointments scheduled' });
        return;
      }
      container.innerHTML = apts.map((a) => (
        '<div class="card card-lift">' +
          '<div class="card-bd">' +
            '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">' +
              '<span class="bdg bdg-pending">' + new Date(a.scheduled_at).toLocaleString('en-US', { weekday: 'short', hour: 'numeric', minute: '2-digit' }) + '</span>' +
              '<span class="bdg bdg-' + (a.status === 'scheduled' ? 'approved' : 'pending') + '">' + escapeHTML(a.status) + '</span>' +
            '</div>' +
            '<div style="font-weight:700;color:var(--t1)">' + escapeHTML(a.patient_name || 'Patient') + '</div>' +
            '<div style="font-size:12.5px;color:var(--t3)">' + escapeHTML(a.title || a.visit_type) + '</div>' +
          '</div>' +
        '</div>'
      )).join('');
    }).catch(() => {
      renderEmptyState(container, { icon: '⚠️', title: 'Could not load appointments' });
    });
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
    if (!container || !patientId) return;
    MNXApi.patientHistory(patientId).then((res) => {
      const entries = res.entries || [];
      if (entries.length === 0) {
        renderEmptyState(container, { icon: '🕓', title: 'No history yet for this patient' });
        return;
      }
      container.innerHTML = entries.map((e) => (
        '<div style="display:flex;gap:12px;padding:10px 0;border-bottom:1px solid var(--border)">' +
          '<div style="font-size:11px;color:var(--t3);white-space:nowrap;width:90px">' + fmtDate(e.at) + '</div>' +
          '<div style="font-size:13px;color:var(--t1)">' + escapeHTML(e.event) + '</div>' +
        '</div>'
      )).join('');
    }).catch(() => {
      renderEmptyState(container, { icon: '⚠️', title: 'Could not load history' });
    });
  }

  // ----------------------------------------------------------
  // NOTIFICATIONS
  // ----------------------------------------------------------
  function renderNotifications() {
    const container = document.getElementById('notificationsList');
    if (!container) return;
    MNXApi.listNotifications().then((res) => {
      const notifs = res.notifications || [];
      if (notifs.length === 0) {
        renderEmptyState(container, { icon: '🔔', title: 'No notifications' });
        return;
      }
      container.innerHTML = notifs.map((n) => (
        '<div class="card" style="margin-bottom:8px;' + (n.is_read ? '' : 'border-left:3px solid var(--primary)') + '" data-notif="' + n.id + '">' +
          '<div class="card-bd" style="display:flex;justify-content:space-between;gap:10px">' +
            '<div><div style="font-weight:700;font-size:13px;color:var(--t1)">' + escapeHTML(n.title) + '</div>' +
            '<div style="font-size:12.5px;color:var(--t2);margin-top:2px">' + escapeHTML(n.message) + '</div>' +
            '<div style="font-size:11px;color:var(--t3);margin-top:6px">' + new Date(n.created_at).toLocaleString() + '</div></div>' +
            (n.is_read ? '' : '<button class="btn btn-ghost btn-xs" data-mark-read="' + n.id + '">Mark read</button>') +
          '</div>' +
        '</div>'
      )).join('');
      container.querySelectorAll('[data-mark-read]').forEach((btn) => {
        btn.addEventListener('click', async () => {
          await MNXApi.markNotificationRead(btn.getAttribute('data-mark-read'));
          renderNotifications();
          refreshBadgesAndCounts();
        });
      });
    }).catch(() => {
      renderEmptyState(container, { icon: '⚠️', title: 'Could not load notifications' });
    });
  }
  document.addEventListener('click', async (e) => {
    if (e.target && e.target.id === 'markAllReadBtn') {
      await MNXApi.markAllNotificationsRead();
      renderNotifications();
      refreshBadgesAndCounts();
      showToast('All notifications marked as read.', 'success');
    }
  });

  // ----------------------------------------------------------
  // PROFILE SETTINGS
  // ----------------------------------------------------------
  function renderProfile() {
    if (!currentUser) return;
    const setVal = (id, val) => { const el = document.getElementById(id); if (el) el.value = val || ''; };
    setVal('profileFullName', currentUser.full_name);
    setVal('profileEmail', currentUser.email);
    setVal('profilePhone', currentUser.phone);
    setVal('profileSpecialty', currentUser.specialty);
    setVal('profileHospital', currentUser.hospital_clinic);
    setVal('profileAddress', currentUser.address);
    updateProfileAvatarUI();
  }

  function wireProfileSettings() {
    document.getElementById('profileForm')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = document.getElementById('saveProfileBtn');
      const restore = setButtonBusy(btn, 'Saving…');
      try {
        const res = await MNXApi.updateProfile({
          full_name: document.getElementById('profileFullName')?.value.trim(),
          email: document.getElementById('profileEmail')?.value.trim(),
          phone: document.getElementById('profilePhone')?.value.trim(),
          address: document.getElementById('profileAddress')?.value.trim(),
        });
        currentUser = res.user;
        syncShellUser();
        const greeting = document.querySelector('#page-dashboard h1');
        if (greeting && currentUser.full_name) {
          const first = currentUser.full_name.replace(/^Dr\.?\s*/i, '').split(' ')[0];
          greeting.textContent = 'Good morning, Dr. ' + first + ' 👋';
        }
        showToast('Profile changes saved.', 'success');
      } catch (err) {
        showToast(err.message || 'Save failed', 'danger');
      } finally {
        restore('Save Changes');
      }
    });

    document.getElementById('passwordForm')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = document.getElementById('changePasswordBtn');
      const restore = setButtonBusy(btn, 'Updating…');
      try {
        await MNXApi.changePassword({
          current_password: document.getElementById('currentPassword')?.value,
          new_password: document.getElementById('newPassword')?.value,
          confirm_password: document.getElementById('confirmPassword')?.value,
        });
        document.getElementById('currentPassword').value = '';
        document.getElementById('newPassword').value = '';
        document.getElementById('confirmPassword').value = '';
        showToast('Password updated successfully.', 'success');
      } catch (err) {
        showToast(err.message || 'Password update failed', 'danger');
      } finally {
        restore('Update Password');
      }
    });

    document.getElementById('uploadAvatarBtn')?.addEventListener('click', () => {
      document.getElementById('profilePictureInput')?.click();
    });

    document.getElementById('profilePictureInput')?.addEventListener('change', async (e) => {
      const file = e.target.files && e.target.files[0];
      if (!file) return;
      const allowed = ['image/jpeg', 'image/jpg', 'image/png'];
      const ext = file.name.split('.').pop().toLowerCase();
      if (!allowed.includes(file.type) && !['jpg', 'jpeg', 'png'].includes(ext)) {
        showToast('Invalid format. Use JPG, JPEG, or PNG.', 'warning');
        e.target.value = '';
        return;
      }
      if (file.size > 5 * 1024 * 1024) {
        showToast('Image must be under 5 MB.', 'warning');
        e.target.value = '';
        return;
      }
      const btn = document.getElementById('uploadAvatarBtn');
      const restore = setButtonBusy(btn, 'Uploading…');
      try {
        const fd = new FormData();
        fd.append('profile_picture', file);
        const res = await MNXApi.uploadProfilePicture(fd);
        currentUser = res.user;
        updateProfileAvatarUI();
        syncShellUser();
        showToast('Profile picture updated.', 'success');
      } catch (err) {
        showToast(err.message || 'Upload failed', 'danger');
      } finally {
        restore('Upload Photo');
        e.target.value = '';
      }
    });

    document.getElementById('removeAvatarBtn')?.addEventListener('click', async () => {
      const btn = document.getElementById('removeAvatarBtn');
      const restore = setButtonBusy(btn, 'Removing…');
      try {
        const res = await MNXApi.removeProfilePicture();
        currentUser = res.user;
        updateProfileAvatarUI();
        syncShellUser();
        showToast('Profile picture removed.', 'success');
      } catch (err) {
        showToast(err.message || 'Remove failed', 'danger');
      } finally {
        restore('Remove');
      }
    });
  }

  // ----------------------------------------------------------
  // MODALS (logout confirm, add patient)
  // ----------------------------------------------------------
  function wireModals() {
    document.getElementById('confirmLogoutBtn')?.addEventListener('click', async () => {
      closeModal('logoutModal');
      try {
        await MNXApi.logout();
      } catch (e) { /* ignore */ }
      showToast('Signed out.', 'info');
      setTimeout(() => { window.location.href = '/login'; }, 600);
    });
    document.getElementById('mnxUserChip')?.addEventListener('click', () => { location.hash = 'profile'; });

    document.getElementById('addPatientForm')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const first = document.getElementById('newPatientFirstName')?.value?.trim();
      const last = document.getElementById('newPatientLastName')?.value?.trim();
      const name = [first, last].filter(Boolean).join(' ');
      const age = parseInt(document.getElementById('newPatientAge')?.value, 10);
      const sex = document.getElementById('newPatientSex')?.value;
      const diagnosis = document.getElementById('newPatientDiagnosis')?.value?.trim();
      if (!name) { showToast('Patient name is required.', 'warning'); return; }
      try {
        await MNXApi.createPatient({ name, age: isNaN(age) ? null : age, sex, diagnosis });
        await refreshData();
        document.getElementById('uploadPatientSelect')?.removeAttribute('data-populated');
        showToast('Patient added successfully.', 'success');
        closeModal('addPatientModal');
        if (location.hash.replace('#', '') === 'patients') renderPatients();
      } catch (err) {
        showToast(err.message || 'Could not add patient', 'danger');
      }
    });
  }
})();
