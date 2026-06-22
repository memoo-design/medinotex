/**
 * ============================================================
 * MediNoteX — components.js
 * Shared, framework-free UI behaviors used by every page.
 * Replaces 5 duplicated toast implementations and several
 * unescaped innerHTML call sites found in the audit.
 * Load AFTER mockDatabase.js, BEFORE ui-shell.js / page scripts.
 * ============================================================
 */
(function (global) {
  'use strict';

  // ----------------------------------------------------------
  // Escape — use this for ANY dynamic value injected via innerHTML
  // ----------------------------------------------------------
  function escapeHTML(str) {
    return String(str == null ? '' : str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  // ----------------------------------------------------------
  // Toast — single implementation for the whole app
  // ----------------------------------------------------------
  function ensureToastStack() {
    let stack = document.getElementById('mnxToastStack');
    if (!stack) {
      stack = document.createElement('div');
      stack.id = 'mnxToastStack';
      stack.className = 'mnx-toast-stack';
      document.body.appendChild(stack);
    }
    return stack;
  }

  const TOAST_ICONS = { success: '✅', error: '❌', warning: '⚠️', info: 'ℹ️' };
  const TOAST_TITLES = { success: 'Success', error: 'Error', warning: 'Warning', info: 'Info' };
  let toastCounter = 0;

  function showToast(message, type, title) {
    type = type || 'success';
    const stack = ensureToastStack();
    const id = 'mnx-toast-' + (++toastCounter);
    const el = document.createElement('div');
    el.className = 'mnx-toast';
    el.id = id;
    el.style.borderLeftColor =
      type === 'error' ? 'var(--danger)' :
      type === 'warning' ? 'var(--warning)' :
      type === 'info' ? 'var(--primary-light)' : 'var(--success)';
    el.innerHTML =
      '<span class="mnx-toast-icon">' + (TOAST_ICONS[type] || TOAST_ICONS.success) + '</span>' +
      '<div><div class="mnx-toast-title">' + escapeHTML(title || TOAST_TITLES[type] || 'Notice') + '</div>' +
      '<div class="mnx-toast-body">' + escapeHTML(message) + '</div></div>' +
      '<button class="mnx-toast-close" type="button" aria-label="Dismiss">&times;</button>';
    el.querySelector('.mnx-toast-close').addEventListener('click', () => removeToast(id));
    stack.appendChild(el);
    setTimeout(() => removeToast(id), 4500);
    return id;
  }

  function removeToast(id) {
    const el = document.getElementById(id);
    if (!el) return;
    el.classList.add('removing');
    setTimeout(() => el.remove(), 250);
  }

  // ----------------------------------------------------------
  // Modal — single open/close pair for the whole app
  // ----------------------------------------------------------
  function openModal(id) {
    const el = document.getElementById(id);
    if (!el) return;
    el.classList.add('show');
    document.body.style.overflow = 'hidden';
  }
  function closeModal(id) {
    const el = document.getElementById(id);
    if (!el) return;
    el.classList.remove('show');
    document.body.style.overflow = '';
  }
  // Click-outside-to-close, wired once globally
  document.addEventListener('click', (e) => {
    if (e.target.classList && e.target.classList.contains('mnx-modal-overlay')) {
      e.target.classList.remove('show');
      document.body.style.overflow = '';
    }
  });
  // Esc-to-close
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      document.querySelectorAll('.mnx-modal-overlay.show').forEach((el) => el.classList.remove('show'));
      document.body.style.overflow = '';
    }
  });

  // ----------------------------------------------------------
  // simulateDelay — used by every "fake async" workflow action
  // so nothing resolves instantly or stalls too long (UX realism
  // rule from the Frontend Improvement Plan, Section 5D).
  // ----------------------------------------------------------
  function simulateDelay(minMs, maxMs) {
    const min = minMs == null ? 500 : minMs;
    const max = maxMs == null ? 1400 : maxMs;
    const ms = Math.floor(min + Math.random() * (max - min));
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /** Puts a button into a disabled + spinner + label state, returns a restore() fn. */
  function setButtonBusy(btnEl, busyLabel) {
    const original = btnEl.innerHTML;
    const wasDisabled = btnEl.disabled;
    btnEl.disabled = true;
    btnEl.innerHTML = '<span class="mnx-spinner light"></span><span>' + escapeHTML(busyLabel || 'Working…') + '</span>';
    return function restore(newLabelHTML) {
      btnEl.disabled = wasDisabled;
      btnEl.innerHTML = newLabelHTML != null ? newLabelHTML : original;
    };
  }

  // ----------------------------------------------------------
  // Skeleton loaders — render N placeholder rows/cards while
  // a (simulated) async load is in flight.
  // ----------------------------------------------------------
  function renderSkeletonRows(container, count, opts) {
    opts = opts || {};
    const n = count || 4;
    let html = '';
    for (let i = 0; i < n; i++) {
      html += '<div class="mnx-skeleton mnx-skel-row" style="width:' + (opts.width || '100%') + '"></div>';
    }
    container.innerHTML = html;
  }
  function renderSkeletonCards(container, count) {
    const n = count || 3;
    let html = '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:14px">';
    for (let i = 0; i < n; i++) html += '<div class="mnx-skeleton mnx-skel-card"></div>';
    html += '</div>';
    container.innerHTML = html;
  }

  // ----------------------------------------------------------
  // Empty states — one consistent "nothing here" pattern
  // ----------------------------------------------------------
  function renderEmptyState(container, { icon, title, desc } = {}) {
    container.innerHTML =
      '<div class="mnx-empty">' +
        '<div class="mnx-empty-icon">' + (icon || '🗂️') + '</div>' +
        '<div class="mnx-empty-title">' + escapeHTML(title || 'Nothing here yet') + '</div>' +
        '<div class="mnx-empty-desc">' + escapeHTML(desc || '') + '</div>' +
      '</div>';
  }

  // ----------------------------------------------------------
  // Dark mode — single, persisted, shared toggle
  // ----------------------------------------------------------
  const DARK_KEY = 'medinotex_dark_mode';
  function isDark() { return localStorage.getItem(DARK_KEY) === '1'; }
  function applyDark(on) {
    document.documentElement.classList.toggle('dark', !!on);
    localStorage.setItem(DARK_KEY, on ? '1' : '0');
  }
  function toggleDark() {
    applyDark(!isDark());
    return isDark();
  }
  // Apply saved preference immediately on every page load (before paint as much as possible)
  applyDark(isDark());

  global.MNX = {
    escapeHTML,
    showToast,
    openModal,
    closeModal,
    simulateDelay,
    setButtonBusy,
    renderSkeletonRows,
    renderSkeletonCards,
    renderEmptyState,
    isDark,
    applyDark,
    toggleDark,
  };
})(window);
