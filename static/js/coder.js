/**
 * MediNoteX Medical Coder workflow — queue, review panel, profile.
 * Extends medinotex_coder.html without replacing existing dashboard pages.
 */
(function (global) {
  'use strict';

  const state = {
    user: null,
    queue: [],
    activeNoteId: null,
    noteDetail: null,
    suggestions: null,
    selectedIcd: [],
    selectedCpt: [],
  };

  function esc(s) {
    return String(s || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function splitName(full) {
    const parts = (full || '').trim().split(/\s+/);
    return { first: parts[0] || '', last: parts.slice(1).join(' ') || '' };
  }

  function formatDate(iso) {
    if (!iso) return '—';
    try {
      return new Date(iso).toLocaleString();
    } catch (e) {
      return iso;
    }
  }

  function toast(msg, type) {
    if (typeof global.showToast === 'function') {
      global.showToast(msg, type || 'info');
    }
  }

  async function ensureAuth() {
    try {
      const user = await MNXApi.me();
      if (user.role !== 'medical_coder' && user.role !== 'coder') {
        window.location.href = '/login';
        return null;
      }
      state.user = user;
      return user;
    } catch (e) {
      window.location.href = '/login';
      return null;
    }
  }

  // ── Queue ───────────────────────────────────────────────────────────────────

  async function loadQueue() {
    const container = document.getElementById('pendingList');
    const sub = document.querySelector('#page-pending .section-sub');
    if (!container) return;

    container.innerHTML = '<div class="mnx-empty-queue">Loading queue…</div>';
    try {
      const data = await MNXApi.getCoderQueue();
      state.queue = data.queue || [];
      if (sub) {
        sub.textContent = state.queue.length
          ? `${state.queue.length} case(s) waiting for coding review`
          : 'No cases in queue';
      }
      const badge = document.querySelector('.nav-item[onclick*="pending"] .nav-badge');
      if (badge) badge.textContent = String(state.queue.length);
      renderQueue(state.queue);
    } catch (e) {
      container.innerHTML = '<div class="mnx-empty-queue">Could not load queue. Please refresh.</div>';
    }
  }

  function renderQueue(list) {
    const container = document.getElementById('pendingList');
    if (!container) return;

    if (!list.length) {
      container.innerHTML = '<div class="card card-p mnx-empty-queue">No clinical notes are waiting for coding review.</div>';
      return;
    }

    container.innerHTML = `
      <div class="card mnx-queue-table">
        <div class="tbl-wrap">
          <table>
            <thead>
              <tr>
                <th>Note ID</th>
                <th>Doctor</th>
                <th>Patient</th>
                <th>Submitted</th>
                <th>AI Summary</th>
                <th>Preview</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              ${list.map((row) => `
                <tr>
                  <td class="td-main">#${esc(row.note_id || row.id)}</td>
                  <td>${esc(row.doctor_name || '—')}</td>
                  <td>${esc(row.patient_name || row.pt || '—')}</td>
                  <td style="font-size:12px">${esc(formatDate(row.submitted_at))}</td>
                  <td><span class="badge ${row.has_ai_summary ? 'badge-green' : 'badge-yellow'}">${esc(row.summary_status || (row.has_ai_summary ? 'Available' : 'Not available'))}</span></td>
                  <td style="font-size:12px;max-width:220px">${esc(row.original_preview || (row.original_text || '').slice(0, 120))}</td>
                  <td><span class="badge badge-blue">${esc(row.status || 'submitted_to_coder')}</span></td>
                  <td class="queue-actions">
                    <button class="btn btn-primary btn-sm" onclick="CoderWorkflow.openReview(${row.note_id || row.id})">Review Coding</button>
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>`;
  }

  // ── Review panel ────────────────────────────────────────────────────────────

  function showReviewPage(show) {
    const pending = document.getElementById('page-pending');
    const review = document.getElementById('page-review');
    if (pending) pending.classList.toggle('active', !show);
    if (review) review.classList.toggle('active', !!show);
    if (show && typeof global.lucide !== 'undefined') {
      setTimeout(() => global.lucide.createIcons(), 50);
    }
  }

  async function openReview(noteId) {
    state.activeNoteId = noteId;
    state.selectedIcd = [];
    state.selectedCpt = [];
    showReviewPage(true);

    const root = document.getElementById('reviewPanelRoot');
    if (!root) return;
    root.innerHTML = '<div class="mnx-empty-queue">Loading clinical note…</div>';

    try {
      const [detail, suggestions] = await Promise.all([
        MNXApi.getCoderNote(noteId),
        MNXApi.getCoderSuggestions(noteId),
      ]);
      state.noteDetail = detail;
      state.suggestions = suggestions;
      state.selectedIcd = (suggestions.icd_codes || []).map((c) => ({ ...c, accepted: true }));
      state.selectedCpt = (suggestions.cpt_codes || []).map((c) => ({ ...c, accepted: true }));
      renderReviewPanel();
    } catch (e) {
      root.innerHTML = `<div class="mnx-empty-queue">${esc(e.message || 'Failed to load note')}</div>`;
    }
  }

  function renderReviewPanel() {
    const root = document.getElementById('reviewPanelRoot');
    const d = state.noteDetail;
    const s = state.suggestions;
    if (!root || !d) return;

    const noAiBadge = !d.has_ai_summary
      ? '<span class="badge badge-yellow" style="margin-bottom:12px;display:inline-flex">No AI summary available. Reviewing original clinical note.</span>'
      : '';

    const soapHtml = d.has_ai_summary && d.soap ? `
      <div class="mnx-soap-block">
        <h4>SOAP Summary</h4>
        ${d.soap.subjective ? `<p><strong>S:</strong> ${esc(d.soap.subjective)}</p>` : ''}
        ${d.soap.objective ? `<p><strong>O:</strong> ${esc(d.soap.objective)}</p>` : ''}
        ${d.soap.assessment ? `<p><strong>A:</strong> ${esc(d.soap.assessment)}</p>` : ''}
        ${d.soap.plan ? `<p><strong>P:</strong> ${esc(d.soap.plan)}</p>` : ''}
      </div>` : '';

    root.innerHTML = `
      <div class="mnx-review-back">
        <button class="btn btn-ghost btn-sm" onclick="CoderWorkflow.backToQueue()">← Back to Queue</button>
      </div>
      <div class="section-hdr" style="margin-bottom:16px">
        <div>
          <div class="section-title" style="font-size:18px">Review Coding — Note #${esc(d.note_id)}</div>
          <div class="section-sub">Dr. ${esc(d.doctor?.name)} · ${esc(d.patient?.name)} · ${esc(formatDate(d.submitted_at))}</div>
        </div>
        <span class="badge badge-purple">${esc(s?.method_used || s?.method || 'rule_based')}</span>
      </div>
      <div class="mnx-review-layout">
        <div class="mnx-clinical-panel">
          <div class="section-title" style="margin-bottom:10px">Original Clinical Note</div>
          ${noAiBadge}
          <div class="mnx-clinical-text" id="clinicalTextHighlighted">${s?.highlighted_html || esc(d.original_text || d.extracted_text || '')}</div>
          ${soapHtml}
        </div>
        <div class="mnx-codes-panel">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
            <div class="section-title">ICD / CPT Suggestions</div>
            <span class="conf-badge ${(s?.confidence || 0) >= 0.8 ? 'conf-high' : 'conf-med'}">${Math.round((s?.confidence || 0) * 100)}% confidence</span>
          </div>
          <div style="font-size:11px;color:var(--text3);margin-bottom:12px">Method: <strong>${esc(s?.method_used || s?.method || 'rule_based')}</strong></div>
          <div id="icdSuggestionsList">${renderCodeList('icd')}</div>
          <div style="margin:16px 0 8px;font-size:12px;font-weight:700;color:var(--text3);text-transform:uppercase">CPT Codes</div>
          <div id="cptSuggestionsList">${renderCodeList('cpt')}</div>
          <div style="margin-top:16px">
            <label class="form-label">Add ICD code manually</label>
            <div style="display:flex;gap:8px;margin-bottom:10px">
              <input class="form-input" id="manualIcdInput" placeholder="e.g. I10" style="font-family:monospace"/>
              <button class="btn btn-ghost btn-sm" onclick="CoderWorkflow.addManualCode('icd')">Add</button>
            </div>
            <label class="form-label">Add CPT code manually</label>
            <div style="display:flex;gap:8px">
              <input class="form-input" id="manualCptInput" placeholder="e.g. 99213" style="font-family:monospace"/>
              <button class="btn btn-ghost btn-sm" onclick="CoderWorkflow.addManualCode('cpt')">Add</button>
            </div>
          </div>
          <div style="margin-top:16px">
            <label class="form-label">Review Comments (optional)</label>
            <textarea class="form-input" id="coderReviewComments" rows="3" placeholder="Coding notes for audit trail…"></textarea>
          </div>
          <div style="display:flex;gap:10px;margin-top:16px;flex-wrap:wrap">
            <button class="btn btn-success" onclick="CoderWorkflow.approveCoding()">Approve Final Coding</button>
          </div>
        </div>
      </div>`;

    bindHighlightClicks();
  }

  function renderCodeList(type) {
    const list = type === 'icd' ? state.selectedIcd : state.selectedCpt;
    if (!list.length) {
      return `<div style="font-size:12px;color:var(--text3)">No ${type.toUpperCase()} suggestions</div>`;
    }
    return list.map((c, idx) => {
      const removed = c.removed;
      const cls = removed ? 'removed' : (c.accepted ? 'accepted' : '');
      const conf = Math.round((c.confidence || 0) * 100);
      return `
        <div class="mnx-code-suggestion ${cls}" data-type="${type}" data-idx="${idx}">
          <div style="display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap">
            <div>
              <span class="code-chip">${esc(c.code)}</span>
              <div style="font-size:12px;color:var(--text2);margin-top:6px">${esc(c.description)}</div>
              <div class="code-meta">Mapped: "${esc(c.mapped_text || '—')}" · ${conf}% · ${esc(c.method || 'rule_based')}</div>
            </div>
            <div style="display:flex;gap:6px;flex-wrap:wrap">
              ${!removed ? `<button class="btn btn-success btn-xs" onclick="CoderWorkflow.toggleAccept('${type}',${idx},true)">Accept</button>` : ''}
              <button class="btn btn-ghost btn-xs" onclick="CoderWorkflow.editCode('${type}',${idx})">Edit</button>
              <button class="btn btn-danger btn-xs" onclick="CoderWorkflow.removeCode('${type}',${idx})">Remove</button>
            </div>
          </div>
          ${c.editing ? `
            <div style="margin-top:10px;display:flex;gap:8px">
              <input class="form-input" id="edit-${type}-${idx}" value="${esc(c.code)}" style="font-family:monospace"/>
              <button class="btn btn-primary btn-xs" onclick="CoderWorkflow.saveEdit('${type}',${idx})">Save</button>
            </div>` : ''}
        </div>`;
    }).join('');
  }

  function bindHighlightClicks() {
    document.querySelectorAll('.clinical-highlight').forEach((el) => {
      el.addEventListener('click', () => {
        document.querySelectorAll('.clinical-highlight').forEach((x) => x.classList.remove('active'));
        el.classList.add('active');
        const code = el.getAttribute('data-code');
        document.querySelectorAll('.mnx-code-suggestion').forEach((card) => {
          const chip = card.querySelector('.code-chip');
          if (chip && chip.textContent === code) {
            card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            card.style.boxShadow = '0 0 0 3px rgba(59,130,246,.2)';
            setTimeout(() => { card.style.boxShadow = ''; }, 2000);
          }
        });
      });
    });
  }

  function refreshCodeLists() {
    const icdEl = document.getElementById('icdSuggestionsList');
    const cptEl = document.getElementById('cptSuggestionsList');
    if (icdEl) icdEl.innerHTML = renderCodeList('icd');
    if (cptEl) cptEl.innerHTML = renderCodeList('cpt');
  }

  function toggleAccept(type, idx, val) {
    const list = type === 'icd' ? state.selectedIcd : state.selectedCpt;
    if (list[idx]) list[idx].accepted = val;
    refreshCodeLists();
  }

  function editCode(type, idx) {
    const list = type === 'icd' ? state.selectedIcd : state.selectedCpt;
    if (list[idx]) list[idx].editing = true;
    refreshCodeLists();
  }

  function saveEdit(type, idx) {
    const input = document.getElementById(`edit-${type}-${idx}`);
    const list = type === 'icd' ? state.selectedIcd : state.selectedCpt;
    if (input && list[idx]) {
      list[idx].code = input.value.trim();
      list[idx].editing = false;
      list[idx].method = 'manual';
    }
    refreshCodeLists();
  }

  function removeCode(type, idx) {
    const list = type === 'icd' ? state.selectedIcd : state.selectedCpt;
    if (list[idx]) list[idx].removed = true;
    refreshCodeLists();
  }

  function addManualCode(type) {
    const input = document.getElementById(type === 'icd' ? 'manualIcdInput' : 'manualCptInput');
    const code = (input?.value || '').trim();
    if (!code) return;
    const entry = { code, description: 'Manually added', mapped_text: '', confidence: 1, method: 'manual', accepted: true };
    if (type === 'icd') state.selectedIcd.push(entry);
    else state.selectedCpt.push(entry);
    if (input) input.value = '';
    refreshCodeLists();
  }

  async function approveCoding() {
    const icd = state.selectedIcd.filter((c) => !c.removed && c.accepted !== false);
    const cpt = state.selectedCpt.filter((c) => !c.removed && c.accepted !== false);
    if (!icd.length) {
      toast('At least one ICD code is required', 'danger');
      return;
    }
    const comments = document.getElementById('coderReviewComments')?.value?.trim() || '';
    try {
      await MNXApi.approveCoderNote(state.activeNoteId, {
        final_icd_codes: icd,
        final_cpt_codes: cpt,
        comments,
      });
      toast('Coding approved successfully', 'success');
      backToQueue();
      loadQueue();
    } catch (e) {
      toast(e.message || 'Approval failed', 'danger');
    }
  }

  function backToQueue() {
    showReviewPage(false);
    state.activeNoteId = null;
    if (typeof global.showPage === 'function') {
      global.showPage('pending', document.querySelector('.nav-item[onclick*="pending"]'));
    }
  }

  // ── Profile ─────────────────────────────────────────────────────────────────

  async function loadProfile() {
    try {
      const user = state.user || await MNXApi.getProfile();
      state.user = user;
      const names = splitName(user.full_name);
      setVal('coderFirstName', names.first);
      setVal('coderLastName', names.last);
      setVal('coderPhone', user.phone || '');
      setVal('coderEmployeeId', user.employee_id || '—');
      setVal('coderSpecialty', user.specialty || '—');
      setVal('coderHospital', user.hospital_clinic || '—');
      setVal('coderDepartment', user.department || '—');
      setVal('coderRole', user.role || 'medical_coder');

      const hdr = document.getElementById('coderProfileName');
      if (hdr) hdr.textContent = user.full_name + (user.specialty ? ', ' + user.specialty.split('(')[0].trim() : '');

      const avatarEl = document.getElementById('coderProfileAvatar');
      if (avatarEl) {
        if (user.profile_picture) {
          avatarEl.innerHTML = `<img src="/${user.profile_picture}" alt="" style="width:100%;height:100%;border-radius:50%;object-fit:cover"/>`;
        } else {
          avatarEl.textContent = (names.first[0] || 'C') + (names.last[0] || '');
        }
      }
    } catch (e) {
      toast('Could not load profile', 'danger');
    }
  }

  function setVal(id, val) {
    const el = document.getElementById(id);
    if (el) el.value = val;
  }

  async function saveProfile() {
    const first = document.getElementById('coderFirstName')?.value?.trim() || '';
    const last = document.getElementById('coderLastName')?.value?.trim() || '';
    const phone = document.getElementById('coderPhone')?.value?.trim() || '';
    try {
      await MNXApi.updateProfile({ full_name: `${first} ${last}`.trim(), phone });
      toast('Profile updated successfully', 'success');
      loadProfile();
    } catch (e) {
      toast(e.message || 'Profile update failed', 'danger');
    }
  }

  async function changePassword() {
    const current_password = document.getElementById('coderCurrentPw')?.value || '';
    const new_password = document.getElementById('coderNewPw')?.value || '';
    const confirm_password = document.getElementById('coderConfirmPw')?.value || '';
    try {
      await MNXApi.changePassword({ current_password, new_password, confirm_password });
      toast('Password changed', 'success');
      document.getElementById('coderCurrentPw').value = '';
      document.getElementById('coderNewPw').value = '';
      document.getElementById('coderConfirmPw').value = '';
    } catch (e) {
      toast(e.message || 'Password change failed', 'danger');
    }
  }

  // ── Init ────────────────────────────────────────────────────────────────────

  async function init() {
    const user = await ensureAuth();
    if (!user) return;

    global.renderPending = loadQueue;

    const origShowPage = global.showPage;
    if (typeof origShowPage === 'function') {
      global.showPage = function (page, el) {
        origShowPage(page, el);
        if (page === 'pending') loadQueue();
        if (page === 'profile') loadProfile();
      };
    }

    await loadQueue();
    if (window.location.hash === '#pending') loadQueue();
  }

  const CoderWorkflow = {
    init,
    loadQueue,
    openReview,
    backToQueue,
    toggleAccept,
    editCode,
    saveEdit,
    removeCode,
    addManualCode,
    approveCoding,
    saveProfile,
    changePassword,
    loadProfile,
  };

  global.CoderWorkflow = CoderWorkflow;

  document.addEventListener('DOMContentLoaded', () => {
    setTimeout(init, 100);
  });
})(window);
