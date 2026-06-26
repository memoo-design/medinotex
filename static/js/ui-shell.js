/**
 * ============================================================
 * MediNoteX — ui-shell.js
 * Renders the sidebar + topbar from ONE config object per role,
 * replacing 5 duplicated hand-written <aside>/<header> blocks.
 *
 * Fixes the broken-link bug found in the audit: analytics.html's
 * sidebar pointed at doctor-dashboard.html / note-upload.html /
 * coder-dashboard.html / profile.html, none of which existed.
 * Every href below points at a REAL file in the project.
 *
 * Load AFTER mockDatabase.js + components.js.
 *
 * Usage (on every dashboard page, in <body>):
 *   <div id="mnxSidebarMount"></div>
 *   <div id="mnxTopbarMount"></div>
 *   <div id="mnxOverlayMount"></div>
 *   <main id="mnxMain" class="mnx-main">...page content...</main>
 *   <script>
 *     UIShell.render({ role: 'doctor', activeKey: 'dashboard',
 *                       userId: 'u-doc-1', pageTitle: 'Dashboard' });
 *   </script>
 * ============================================================
 */
(function (global) {
  'use strict';

  const ICONS = {
    dashboard: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"/></svg>',
    patients: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z"/></svg>',
    upload: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"/></svg>',
    summaries: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"/></svg>',
    appointments: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg>',
    history: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>',
    notifications: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"/></svg>',
    profile: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"/></svg>',
    pending: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>',
    icd: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>',
    cpt: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/></svg>',
    ai: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>',
    billing: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>',
    analytics: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"/></svg>',
    users: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z"/></svg>',
    provision: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z"/></svg>',
    notes: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>',
    logs: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M4 6h16M4 10h16M4 14h16M4 18h16"/></svg>',
    settings: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"/><path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/></svg>',
    facilities: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M3 21h18M5 21V7l8-4 8 4v14M9 9h1m4 0h1m-6 4h1m4 0h1m-6 4h1m4 0h1"/></svg>',
    records: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>',
    reports: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>',
    rx: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>',
    logout: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"/></svg>',
  };

  // ----------------------------------------------------------
  // ONE navigation map for the whole app. Every href is a REAL
  // file path — this is what the audit's "broken sidebar link"
  // findings get fixed against.
  // ----------------------------------------------------------
  const NAV_CONFIG = {
    doctor: [
      { section: 'Main' },
      { key: 'dashboard', label: 'Dashboard', href: '/dashboard#dashboard', icon: 'dashboard' },
      { key: 'patients', label: 'Patients', href: '/dashboard#patients', icon: 'patients' },
      { key: 'upload', label: 'Upload Clinical Note', href: '/dashboard#upload', icon: 'upload' },
      { key: 'summaries', label: 'AI Summaries', href: '/dashboard#summaries', icon: 'summaries', badge: 'New' },
      { section: 'Clinical' },
      { key: 'appointments', label: 'Appointments', href: '/dashboard#appointments', icon: 'appointments' },
      { key: 'history', label: 'Medical History', href: '/dashboard#history', icon: 'history' },
      { key: 'notifications', label: 'Notifications', href: '/dashboard#notifications', icon: 'notifications' },
      { section: 'Account' },
      { key: 'profile', label: 'Profile Settings', href: '/dashboard#profile', icon: 'settings' },
    ],
    coder: [
      { section: 'Main' },
      { key: 'dashboard', label: 'Dashboard', href: '/coder', icon: 'dashboard' },
      { key: 'pending', label: 'Pending Reviews', href: '/coder#pending', icon: 'pending' },
      { key: 'icd', label: 'ICD Code Validation', href: '/coder#icd', icon: 'icd' },
      { key: 'cpt', label: 'CPT Code Management', href: '/coder#cpt', icon: 'cpt' },
      { key: 'ai', label: 'AI Coding Suggestions', href: '/coder#ai', icon: 'ai' },
      { section: 'Billing' },
      { key: 'claims', label: 'Claims', href: '/coder#claims', icon: 'billing' },
      { key: 'billing', label: 'Billing Reports', href: '/coder#billing', icon: 'reports' },
      { key: 'analytics', label: 'Analytics', href: 'analytics.html', icon: 'analytics' },
      { section: 'Account' },
      { key: 'profile', label: 'Profile', href: '/#profile', icon: 'profile' },
    ],
    admin: [
      { section: 'Management' },
      { key: 'dashboard', label: 'All Users', href: 'admin-dashboard.html', icon: 'users' },
      { key: 'register', label: 'Add New User', href: 'admin-dashboard.html#register', icon: 'provision' },
      { key: 'notes', label: 'All Notes', href: 'admin-dashboard.html#notes', icon: 'notes' },
      { section: 'Analytics' },
      { key: 'charts', label: 'Performance Charts', href: 'analytics.html', icon: 'analytics' },
      { key: 'metrics', label: 'AI Model Accuracy', href: 'admin-dashboard.html#metrics', icon: 'ai' },
      { section: 'System' },
      { key: 'logs', label: 'System Logs', href: 'admin-dashboard.html#logs', icon: 'logs' },
      { key: 'settings', label: 'Settings', href: 'admin-dashboard.html#settings', icon: 'settings' },
      { section: 'Account' },
      { key: 'profile', label: 'Profile', href: '/#profile', icon: 'profile' },
    ],
    super_admin: [
      { section: 'Platform' },
      { key: 'dashboard', label: 'Overview', href: 'super-admin.html', icon: 'dashboard' },
      { key: 'admins', label: 'Admin Accounts', href: 'super-admin.html#admins', icon: 'users' },
      { key: 'facilities', label: 'Facilities & Departments', href: 'super-admin.html#facilities', icon: 'facilities' },
      { section: 'Governance' },
      { key: 'logs', label: 'Global Audit Log', href: 'super-admin.html#logs', icon: 'logs' },
      { key: 'settings', label: 'System Settings', href: 'super-admin.html#settings', icon: 'settings' },
      { section: 'Account' },
      { key: 'profile', label: 'Profile', href: '/#profile', icon: 'profile' },
    ],
    // patient: [
    //   { section: 'Main' },
    //   { key: 'dashboard', label: 'Dashboard', href: 'patient.html', icon: 'dashboard' },
    //   { key: 'profile', label: 'My Profile', href: 'patient.html#profile', icon: 'profile' },
    //   { key: 'records', label: 'Medical Records', href: 'patient.html#records', icon: 'records' },
    //   { key: 'reports', label: 'Clinical Reports', href: 'patient.html#reports', icon: 'reports' },
    //   { section: 'Care' },
    //   { key: 'appointments', label: 'Appointments', href: 'patient.html#appointments', icon: 'appointments' },
    //   { key: 'prescriptions', label: 'Prescriptions', href: 'patient.html#prescriptions', icon: 'rx' },
    //   { key: 'notifications', label: 'Notifications', href: 'patient.html#notifications', icon: 'notifications' },
    //   { section: 'Account' },
    //   { key: 'settings', label: 'Settings', href: 'patient.html#settings', icon: 'settings' },
    // ],
  };

  const ROLE_LABEL = {
    doctor: 'Clinical Platform', coder: 'Coder Portal', medical_coder: 'Coder Portal',
    admin: 'Admin Panel', super_admin: 'Super Admin',
  };

  function navRole(role) {
    if (role === 'medical_coder') return 'coder';
    return role;
  }

  function svg(key) { return ICONS[key] || ICONS.dashboard; }

  function renderSidebar(role, activeKey) {
    const items = NAV_CONFIG[navRole(role)] || [];
    let html = '';
    items.forEach((item) => {
      if (item.section) {
        html += '<div class="mnx-nav-section-title">' + MNX.escapeHTML(item.section) + '</div>';
        return;
      }
      const active = item.key === activeKey;
      html +=
        '<a href="' + item.href + '" class="mnx-nav-item' + (active ? ' active' : '') + '" data-nav-key="' + item.key + '">' +
          svg(item.icon) +
          '<span class="mnx-nav-label">' + MNX.escapeHTML(item.label) + '</span>' +
          (item.badge ? '<span class="mnx-nav-badge">' + MNX.escapeHTML(item.badge) + '</span>' : '') +
        '</a>';
    });
    return html;
  }

  function initialsFromName(name) {
    if (!name) return '??';
    const parts = name.replace(/^Dr\.?\s*/i, '').trim().split(/\s+/).filter(Boolean);
    if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    return (parts[0] || '??').slice(0, 2).toUpperCase();
  }

  function avatarHtml(profilePicture, displayName, sizeClass) {
    const cls = 'mnx-avatar' + (sizeClass ? ' ' + sizeClass : '') + (profilePicture ? ' has-img' : '');
    if (profilePicture) {
      return '<div class="' + cls + '"><img class="mnx-avatar-img" src="' + MNX.escapeHTML(profilePicture) + '" alt=""/></div>';
    }
    return '<div class="' + cls + '">' + initialsFromName(displayName) + '</div>';
  }

  function initials(user) {
    if (user && user.displayName) return initialsFromName(user.displayName);
    if (!user) return '??';
    return ((user.firstName || ' ')[0] + (user.lastName || ' ')[0]).toUpperCase();
  }

  function render(opts) {
    const role = opts.role;
    const activeKey = opts.activeKey;
    const pageTitle = opts.pageTitle || 'Dashboard';

    const displayName = opts.userName || 'Guest';
    const profilePicture = opts.profilePicture || '';
    const roleLabel = ROLE_LABEL[navRole(role)] || ROLE_LABEL[role] || 'MediNotex';

    const sidebarMount = document.getElementById('mnxSidebarMount');
    const topbarMount = document.getElementById('mnxTopbarMount');
    const overlayMount = document.getElementById('mnxOverlayMount');

    if (sidebarMount) {
      sidebarMount.innerHTML =
        '<aside class="mnx-sidebar" id="mnxSidebar">' +
          '<div class="mnx-logo"><a href="/" style="display:flex;align-items:center;gap:10px;text-decoration:none">' +
            '<div class="mnx-logo-icon"><svg style="width:18px;height:18px" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.3"><path stroke-linecap="round" stroke-linejoin="round" d="M9 3H5a2 2 0 00-2 2v4m6-6h10a2 2 0 012 2v4M9 3v18m0 0h10a2 2 0 002-2V9M9 21H5a2 2 0 01-2-2V9m0 0h18"/></svg></div>' +
            '<div class="mnx-logo-text"><div class="mnx-logo-name">MediNotex</div><div class="mnx-logo-sub">' + MNX.escapeHTML(roleLabel) + '</div></div>' +
          '</a></div>' +
          '<nav class="mnx-nav">' + renderSidebar(navRole(role), activeKey) + '</nav>' +
          '<div class="mnx-sidebar-foot">' +
            '<div class="mnx-user-chip" id="mnxUserChip">' +
              avatarHtml(profilePicture, displayName, '') +
              '<div style="flex:1;min-width:0">' +
                '<div style="color:#fff;font-size:13px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + MNX.escapeHTML(displayName) + '</div>' +
                '<div style="color:rgba(147,197,253,.5);font-size:10px">' + MNX.escapeHTML(roleLabel) + '</div>' +
              '</div>' +
            '</div>' +
            '<a href="/login" class="mnx-nav-item" style="color:rgba(255,180,180,.75);margin-top:8px" id="mnxLogoutLink">' + svg('logout') + '<span class="mnx-nav-label">Logout</span></a>' +
          '</div>' +
        '</aside>';
    }

    if (overlayMount) {
      overlayMount.innerHTML = '<div class="mnx-sidebar-overlay" id="mnxSidebarOverlay"></div>';
    }

    if (topbarMount) {
      topbarMount.innerHTML =
        '<header class="mnx-topbar" id="mnxTopbar">' +
          '<button class="mnx-icon-btn" id="mnxSidebarToggle" type="button" aria-label="Toggle sidebar">' +
            '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="4" y1="6" x2="20" y2="6"/><line x1="4" y1="12" x2="20" y2="12"/><line x1="4" y1="18" x2="20" y2="18"/></svg>' +
          '</button>' +
          '<div style="display:flex;align-items:center;gap:8px;font-size:14px;color:var(--t2)">' +
            '<span style="color:var(--t3)">MediNotex</span><span style="color:var(--t3)">/</span>' +
            '<span style="font-weight:700;color:var(--t1)" class="mnx-breadcrumb-current">' + MNX.escapeHTML(pageTitle) + '</span>' +
          '</div>' +
          '<div style="display:flex;align-items:center;gap:10px;margin-left:auto">' +
            '<button class="mnx-icon-btn" id="mnxDarkToggle" type="button" aria-label="Toggle dark mode">' +
              '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z"/></svg>' +
            '</button>' +
            (function () {
              const notifItem = (NAV_CONFIG[navRole(role)] || []).find((i) => i.key === 'notifications');
              const notifHref = notifItem ? notifItem.href : '#';
              return '<a class="mnx-icon-btn" href="' + notifHref + '" id="mnxNotifBtn" aria-label="Notifications">' +
                '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"/></svg>' +
              '</a>';
            })() +
            avatarHtml(profilePicture, displayName, 'mnx-topbar-avatar') +
          '</div>' +
        '</header>';
    }

    wireBehavior();
  }

  function wireBehavior() {
    const sidebar = document.getElementById('mnxSidebar');
    const overlay = document.getElementById('mnxSidebarOverlay');
    const topbar = document.getElementById('mnxTopbar');
    const main = document.getElementById('mnxMain');
    const toggleBtn = document.getElementById('mnxSidebarToggle');
    const darkBtn = document.getElementById('mnxDarkToggle');

    let desktopCollapsed = false;

    function toggleSidebar() {
      if (window.innerWidth <= 1023) {
        const open = sidebar.classList.toggle('mobile-open');
        if (overlay) overlay.classList.toggle('show', open);
      } else {
        desktopCollapsed = !desktopCollapsed;
        sidebar.classList.toggle('collapsed', desktopCollapsed);
        if (topbar) topbar.classList.toggle('full', false);
        if (main) main.style.marginLeft = desktopCollapsed ? '76px' : 'var(--sidebar-w)';
      }
    }
    function closeMobileSidebar() {
      sidebar.classList.remove('mobile-open');
      if (overlay) overlay.classList.remove('show');
    }

    if (toggleBtn) toggleBtn.addEventListener('click', toggleSidebar);
    if (overlay) overlay.addEventListener('click', closeMobileSidebar);
    if (darkBtn) darkBtn.addEventListener('click', () => MNX.toggleDark());

    const logoutLink = document.getElementById('mnxLogoutLink');
    if (logoutLink) {
      logoutLink.addEventListener('click', (e) => {
        if (document.getElementById('logoutModal')) {
          e.preventDefault();
          MNX.openModal('logoutModal');
        }
        // If a page has no logoutModal, the link's href="login.html" navigates normally.
      });
    }

    window.addEventListener('resize', () => { if (window.innerWidth > 1023) closeMobileSidebar(); });
  }

  function setActive(activeKey) {
    document.querySelectorAll('.mnx-nav-item[data-nav-key]').forEach((el) => {
      el.classList.toggle('active', el.getAttribute('data-nav-key') === activeKey);
    });
  }

  function setTitle(text) {
    const titleEl = document.querySelector('#mnxTopbar .mnx-breadcrumb-current');
    if (titleEl) titleEl.textContent = text;
  }

  function updateUser(opts) {
    const displayName = opts.userName || 'Guest';
    const profilePicture = opts.profilePicture || '';

    const chip = document.getElementById('mnxUserChip');
    if (chip) {
      const nameEl = chip.querySelector('div[style*="font-size:13px"]');
      if (nameEl) nameEl.textContent = displayName;
      const oldAvatar = chip.querySelector('.mnx-avatar');
      if (oldAvatar) {
        const tmp = document.createElement('div');
        tmp.innerHTML = avatarHtml(profilePicture, displayName, '');
        oldAvatar.replaceWith(tmp.firstChild);
      }
    }

    const topbarAvatar = document.querySelector('#mnxTopbar .mnx-topbar-avatar');
    if (topbarAvatar) {
      const tmp = document.createElement('div');
      tmp.innerHTML = avatarHtml(profilePicture, displayName, 'mnx-topbar-avatar');
      topbarAvatar.replaceWith(tmp.firstChild);
    }
  }

  global.UIShell = { render, NAV_CONFIG, setActive, setTitle, updateUser };
})(window);
