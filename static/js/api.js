/**
 * MediNoteX API client — talks to the Flask backend with session cookies.
 */
(function (global) {
  'use strict';

  const BASE = '';  // same origin when served by Flask

  async function request(method, path, body, isForm) {
    const opts = {
      method,
      credentials: 'include',
      headers: {},
    };
    if (body) {
      if (isForm) {
        opts.body = body;
      } else {
        opts.headers['Content-Type'] = 'application/json';
        opts.body = JSON.stringify(body);
      }
    }
    const res = await fetch(BASE + path, opts);
    let data = null;
    const ct = res.headers.get('content-type') || '';
    if (ct.indexOf('application/json') !== -1) {
      data = await res.json();
    } else if (!res.ok) {
      data = { error: res.statusText };
    }
    if (!res.ok) {
      const err = new Error((data && data.error) || res.statusText || 'Request failed');
      err.status = res.status;
      err.data = data;
      throw err;
    }
    return data;
  }

  const MNXApi = {
    login: (email, password, remember) =>
      request('POST', '/auth/login', { email, password, remember: !!remember }),
    logout: () => request('POST', '/auth/logout'),
    me: () => request('GET', '/auth/me'),

    dashboardStats: () => request('GET', '/api/dashboard/stats'),

    listPatients: (params) => {
      const q = new URLSearchParams(params || {}).toString();
      return request('GET', '/api/patients/' + (q ? '?' + q : ''));
    },
    createPatient: (data) => request('POST', '/api/patients/', data),

    listNotes: (params) => {
      const q = new URLSearchParams(params || {}).toString();
      return request('GET', '/api/upload/' + (q ? '?' + q : ''));
    },
    uploadFile: (formData) => request('POST', '/api/upload/file', formData, true),
    uploadText: (data) => request('POST', '/api/upload/text', data),
    getNote: (id) => request('GET', '/api/upload/' + id),

    generateSummary: (noteId) => request('POST', '/api/summaries/generate', { note_id: noteId }),
    listSummaries: (params) => {
      const q = new URLSearchParams(params || {}).toString();
      return request('GET', '/api/summaries/' + (q ? '?' + q : ''));
    },
    getSummary: (id) => request('GET', '/api/summaries/' + id),
    updateSummary: (id, soap) => request('PUT', '/api/summaries/' + id, soap),
    submitToCoder: (id) => request('POST', '/api/summaries/' + id + '/submit'),
    submitNoteToCoder: (noteId) => request('POST', '/api/doctor/notes/' + noteId + '/submit-to-coder'),
    listRevisions: () => request('GET', '/api/summaries/revisions'),

    listAppointments: () => request('GET', '/api/appointments/'),
    listNotifications: () => request('GET', '/api/notifications/'),
    markNotificationRead: (id) => request('POST', '/api/notifications/' + id + '/read'),
    markAllNotificationsRead: () => request('POST', '/api/notifications/read-all'),

    patientHistory: (patientId) => request('GET', '/api/history/patient/' + patientId),

    getProfile: () => request('GET', '/api/profile/'),
    updateProfile: (data) => request('PUT', '/api/profile/', data),
    changePassword: (data) => request('POST', '/api/profile/password', data),
    uploadProfilePicture: (formData) => request('POST', '/api/profile/avatar', formData, true),
    removeProfilePicture: () => request('DELETE', '/api/profile/avatar'),
  };

  global.MNXApi = MNXApi;
})(window);
