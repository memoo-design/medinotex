/**
 * ============================================================
 * MediNoteX — mockDatabase.js
 * ------------------------------------------------------------
 * Single source of truth for ALL frontend pages.
 *
 * Why this exists:
 *   The MediNoteX frontend is a set of separate static HTML pages
 *   (doctor.html, coder.html, patient.html, admin.html, reports.html...).
 *   Without a backend, each page previously declared its own
 *   hardcoded arrays (different patient names, different doctor
 *   names, different ICD/CPT data) which made the product look
 *   disconnected in a live demo.
 *
 *   This file is the ONE place all mock data lives. It persists to
 *   localStorage so state survives full-page navigation between
 *   the static HTML files in the same browser session, which lets
 *   you demo a real end-to-end flow:
 *
 *     Doctor uploads + submits a case
 *       -> Coder sees it appear in Pending Reviews
 *       -> Coder approves it
 *       -> Patient sees the report + notification appear
 *
 *   This is still 100% frontend simulation. No network calls.
 *   When a real backend exists later, every MockDB.* method below
 *   maps 1:1 to a future API call, so swapping it out is mechanical.
 *
 * Usage:
 *   <script src="/assets/js/mockDatabase.js"></script>
 *   <script>
 *     const cases = MockDB.getCasesByStatus('submitted_to_coder');
 *     MockDB.submitToCoder(caseId);
 *     MockDB.subscribe(() => renderSidebarBadges());
 *   </script>
 * ============================================================
 */
(function (global) {
  'use strict';

  const STORAGE_KEY = 'medinotex_mock_db_v1';
  const SCHEMA_VERSION = 2; // v2 (Phase 2): added case-1004 (Aisha Patel) + case-1005 (Robert Lee)
                            // so the Doctor Dashboard's "AI Summaries" sample cards are backed by
                            // real MockDB records instead of static-only text.

  // ----------------------------------------------------------
  // CASE STATUS STATE MACHINE (single canonical vocabulary)
  // ----------------------------------------------------------
  const CASE_STATUS = {
    DRAFT: 'draft',
    UPLOADED: 'uploaded',
    OCR_PROCESSING: 'ocr_processing',
    OCR_DONE: 'ocr_done',
    AI_PROCESSING: 'ai_processing',
    AI_DONE: 'ai_done',
    DOCTOR_REVIEW: 'doctor_review',
    SUBMITTED_TO_CODER: 'submitted_to_coder',
    CODER_REVIEW: 'coder_review',
    RETURNED_FOR_CORRECTION: 'returned_for_correction',
    APPROVED: 'approved',
    REPORT_GENERATED: 'report_generated',
    RELEASED_TO_PATIENT: 'released_to_patient',
  };

  const STATUS_LABELS = {
    draft: 'Draft',
    uploaded: 'Uploaded',
    ocr_processing: 'Extracting Text (OCR)',
    ocr_done: 'Text Extracted',
    ai_processing: 'AI Summarizing',
    ai_done: 'AI Summary Ready',
    doctor_review: 'Doctor Review',
    submitted_to_coder: 'Pending Coder Review',
    coder_review: 'Coder Reviewing',
    returned_for_correction: 'Returned for Correction',
    approved: 'Approved',
    report_generated: 'Report Generated',
    released_to_patient: 'Released to Patient',
  };

  const STATUS_BADGE_CLASS = {
    draft: 'bdg-draft',
    uploaded: 'bdg-pending',
    ocr_processing: 'bdg-processing',
    ocr_done: 'bdg-pending',
    ai_processing: 'bdg-processing',
    ai_done: 'bdg-pending',
    doctor_review: 'bdg-pending',
    submitted_to_coder: 'bdg-pending',
    coder_review: 'bdg-processing',
    returned_for_correction: 'bdg-rejected',
    approved: 'bdg-approved',
    report_generated: 'bdg-approved',
    released_to_patient: 'bdg-approved',
  };

  // ----------------------------------------------------------
  // SEED DATA — one canonical roster reused on every page
  // ----------------------------------------------------------
  function buildSeed() {
    const now = Date.now();
    const daysAgo = (n) => new Date(now - n * 86400000).toISOString();

    return {
      schemaVersion: SCHEMA_VERSION,

      // ---- USERS (all roles share one table; role-specific
      //      profile fields live alongside) ----
      users: [
        { id: 'u-doc-1', role: 'doctor', firstName: 'Sarah', lastName: 'Chen',
          email: 'sarah.chen@medinotex.io', avatarSeed: 'doctor', isActive: true,
          specialty: 'Cardiology', license: 'MD-2019-CARD-4821', department: 'Cardiovascular Medicine',
          facility: 'City Medical Center' },

        { id: 'u-coder-1', role: 'coder', firstName: 'Sarah', lastName: 'Mitchell',
          email: 'sarah.mitchell@medinotex.com', avatarSeed: 'coder', isActive: true,
          certificationId: 'CPC-2847291', specialtyFocus: 'Internal Medicine' },

        { id: 'u-admin-1', role: 'admin', firstName: 'Admin', lastName: 'User',
          email: 'admin@medinotex.ai', avatarSeed: 'admin', isActive: true },

        { id: 'u-superadmin-1', role: 'super_admin', firstName: 'Olivia', lastName: 'Reyes',
          email: 'olivia.reyes@medinotex.ai', avatarSeed: 'superadmin', isActive: true },

        // Patients — ONE canonical roster, reused everywhere
        { id: 'u-pat-1', role: 'patient', firstName: 'James', lastName: 'Wilson',
          email: 'james.wilson@example.com', avatarSeed: 'james', isActive: true,
          dob: '1972-03-12', gender: 'Male', bloodGroup: 'O+', mrn: 'MNX-98241',
          insuranceProvider: 'BlueCross BlueShield', insuranceId: 'BCB-88472-01',
          phone: '+1 (555) 234-5678', address: '742 Evergreen Terrace, Springfield, OR',
          primaryDoctorId: 'u-doc-1' },

        { id: 'u-pat-2', role: 'patient', firstName: 'Maria', lastName: 'Garcia',
          email: 'maria.garcia@example.com', avatarSeed: 'maria', isActive: true,
          dob: '1979-08-02', gender: 'Female', bloodGroup: 'A+', mrn: 'MNX-77310',
          insuranceProvider: 'Aetna Healthcare', insuranceId: 'AET-22918-07',
          phone: '+1 (555) 312-7741', address: '89 Maple Ave, Boston, MA',
          primaryDoctorId: 'u-doc-1' },

        { id: 'u-pat-3', role: 'patient', firstName: 'John', lastName: 'Kim',
          email: 'john.kim@example.com', avatarSeed: 'john', isActive: true,
          dob: '1964-11-20', gender: 'Male', bloodGroup: 'B+', mrn: 'MNX-55102',
          insuranceProvider: 'United Health', insuranceId: 'UHC-51920-13',
          phone: '+1 (555) 448-9922', address: '1021 Elm St, Seattle, WA',
          primaryDoctorId: 'u-doc-1' },

        { id: 'u-pat-4', role: 'patient', firstName: 'Aisha', lastName: 'Patel',
          email: 'aisha.patel@example.com', avatarSeed: 'aisha', isActive: true,
          dob: '1988-05-14', gender: 'Female', bloodGroup: 'AB+', mrn: 'MNX-30221',
          insuranceProvider: 'Cigna', insuranceId: 'CIG-10293-44',
          phone: '+1 (555) 901-2233', address: '14 Birchwood Rd, Austin, TX',
          primaryDoctorId: 'u-doc-1' },

        { id: 'u-pat-5', role: 'patient', firstName: 'Robert', lastName: 'Lee',
          email: 'robert.lee@example.com', avatarSeed: 'robert', isActive: true,
          dob: '1955-01-09', gender: 'Male', bloodGroup: 'O-', mrn: 'MNX-14887',
          insuranceProvider: 'Medicare', insuranceId: 'MCR-99201-02',
          phone: '+1 (555) 667-1190', address: '402 Lakeview Dr, Chicago, IL',
          primaryDoctorId: 'u-doc-1' },
      ],

      // ---- REFERENCE DATA: ICD-10 / CPT master lists ----
      icdCodes: [
        { code: 'I10', desc: 'Essential (primary) hypertension', category: 'Cardiology' },
        { code: 'R07.9', desc: 'Chest pain, unspecified', category: 'Cardiology' },
        { code: 'I21.19', desc: 'ST elevation myocardial infarction, inferior wall', category: 'Cardiology' },
        { code: 'I50.20', desc: 'Unspecified systolic (congestive) heart failure', category: 'Cardiology' },
        { code: 'E11.65', desc: 'Type 2 diabetes mellitus with hyperglycemia', category: 'Endocrinology' },
        { code: 'E78.5', desc: 'Hyperlipidemia, unspecified', category: 'Endocrinology' },
        { code: 'J18.9', desc: 'Pneumonia, unspecified organism', category: 'Pulmonology' },
        { code: 'J44.1', desc: 'COPD with acute exacerbation', category: 'Pulmonology' },
        { code: 'M54.5', desc: 'Low back pain', category: 'Orthopedics' },
        { code: 'F41.1', desc: 'Generalized anxiety disorder', category: 'Behavioral Health' },
      ],
      cptCodes: [
        { code: '99213', desc: 'Office/outpatient visit, established patient — moderate', category: 'E&M', rvu: 1.3 },
        { code: '99214', desc: 'Office/outpatient visit, established patient — high complexity', category: 'E&M', rvu: 1.92 },
        { code: '93000', desc: 'Electrocardiogram, with interpretation and report', category: 'Medicine', rvu: 0.61 },
        { code: '92928', desc: 'Percutaneous coronary intervention, stent placement', category: 'Surgery', rvu: 8.0 },
        { code: '71046', desc: 'Radiologic exam, chest, 2 views', category: 'Radiology', rvu: 0.22 },
        { code: '80061', desc: 'Lipid panel', category: 'Pathology', rvu: 0.0 },
        { code: '83036', desc: 'Hemoglobin A1c', category: 'Pathology', rvu: 0.0 },
      ],

      // ---- APPOINTMENTS ----
      appointments: [
        { id: 'apt-1', patientId: 'u-pat-3', doctorId: 'u-doc-1', scheduledAt: daysAgo(-0.1),
          visitType: 'Follow-up', status: 'confirmed', reason: 'Cardiology follow-up' },
        { id: 'apt-2', patientId: 'u-pat-2', doctorId: 'u-doc-1', scheduledAt: daysAgo(-0.05),
          visitType: 'Consultation', status: 'pending', reason: 'Echo results review' },
        { id: 'apt-3', patientId: 'u-pat-4', doctorId: 'u-doc-1', scheduledAt: daysAgo(-1),
          visitType: 'Follow-up', status: 'scheduled', reason: 'Migraine follow-up' },
      ],

      // ---- CLINICAL CASES (the core workflow entity) ----
      cases: [
        {
          id: 'case-1001',
          patientId: 'u-pat-1',
          doctorId: 'u-doc-1',
          coderId: 'u-coder-1',
          status: CASE_STATUS.RELEASED_TO_PATIENT,
          sourceType: 'typed',
          createdAt: daysAgo(7),
          updatedAt: daysAgo(6),
          soap: {
            subjective: 'James Wilson, 54-year-old male, presents with a 3-day history of exertional chest discomfort, pressure-like, 6/10 intensity, radiating to the left shoulder.',
            objective: 'BP 148/92 mmHg, HR 78 bpm. ECG: sinus rhythm, LVH by voltage criteria. Troponin I 0.02 ng/mL (negative).',
            assessment: 'Stable angina in a patient with hypertension, dyslipidemia, and LVH. ACS not currently supported.',
            plan: 'Refer to Cardiology for stress testing. Optimize antihypertensive therapy. Increase statin dose. Lifestyle counselling.',
          },
          aiConfidence: 92,
          codes: {
            icd: [
              { code: 'I10', confidence: 99, status: 'approved' },
              { code: 'R07.9', confidence: 94, status: 'approved' },
            ],
            cpt: [
              { code: '99214', confidence: 87, status: 'approved' },
              { code: '93000', confidence: 98, status: 'approved' },
            ],
          },
          history: [
            { at: daysAgo(7), event: 'Case created by doctor' },
            { at: daysAgo(7), event: 'AI summary generated (92% confidence)' },
            { at: daysAgo(6.8), event: 'Submitted to coder' },
            { at: daysAgo(6.5), event: 'Coder approved all codes' },
            { at: daysAgo(6), event: 'Report released to patient' },
          ],
        },
        {
          id: 'case-1002',
          patientId: 'u-pat-2',
          doctorId: 'u-doc-1',
          coderId: null,
          status: CASE_STATUS.SUBMITTED_TO_CODER,
          sourceType: 'upload',
          createdAt: daysAgo(0.4),
          updatedAt: daysAgo(0.3),
          soap: {
            subjective: '65-year-old female presenting with productive cough, fever 38.8°C.',
            objective: 'CXR shows bilateral infiltrates. SpO2 95% on room air.',
            assessment: 'Community-acquired pneumonia, bilateral.',
            plan: 'Start empiric antibiotics, follow-up CXR in 2 weeks, monitor oxygen saturation.',
          },
          aiConfidence: 88,
          codes: {
            icd: [{ code: 'J18.9', confidence: 88, status: 'pending' }],
            cpt: [{ code: '71046', confidence: 85, status: 'pending' }],
          },
          history: [
            { at: daysAgo(0.4), event: 'Case created by doctor (file upload)' },
            { at: daysAgo(0.38), event: 'OCR extraction completed' },
            { at: daysAgo(0.35), event: 'AI summary generated (88% confidence)' },
            { at: daysAgo(0.3), event: 'Submitted to coder' },
          ],
        },
        {
          id: 'case-1003',
          patientId: 'u-pat-3',
          doctorId: 'u-doc-1',
          coderId: null,
          status: CASE_STATUS.DOCTOR_REVIEW,
          sourceType: 'typed',
          createdAt: daysAgo(0.05),
          updatedAt: daysAgo(0.02),
          soap: {
            subjective: '62-year-old male, Type 2 diabetes follow-up. Reports good adherence to Metformin.',
            objective: 'HbA1c 7.8%, fasting glucose 162 mg/dL. Foot exam normal.',
            assessment: 'Type 2 diabetes mellitus with hyperglycemia, suboptimal control.',
            plan: 'Add Sitagliptin 100mg to current regimen. Recheck HbA1c in 3 months.',
          },
          aiConfidence: 96,
          codes: {
            icd: [{ code: 'E11.65', confidence: 96, status: 'pending' }],
            cpt: [{ code: '83036', confidence: 99, status: 'pending' }],
          },
          history: [
            { at: daysAgo(0.05), event: 'Case created by doctor' },
            { at: daysAgo(0.03), event: 'AI summary generated (96% confidence)' },
          ],
        },
        {
          // Added in Phase 2 (schema v2): preserves the original static
          // "Aisha Patel" sample card from doctor_dashboard.html's AI
          // Summaries page, now backed by a real MockDB record.
          id: 'case-1004',
          patientId: 'u-pat-4',
          doctorId: 'u-doc-1',
          coderId: 'u-coder-1',
          status: CASE_STATUS.RELEASED_TO_PATIENT,
          sourceType: 'typed',
          createdAt: daysAgo(2.2),
          updatedAt: daysAgo(2),
          soap: {
            subjective: 'Aisha Patel, 38-year-old female, chronic migraine with aura, frequency 8-10 episodes per month.',
            objective: 'Neurological exam non-focal. No papilledema. Triptan use >2x/week reported.',
            assessment: 'Chronic migraine with aura; medication-overuse pattern emerging.',
            plan: 'Sumatriptan prescribed for acute episodes. Preventive therapy with Topiramate 25mg initiated. Neurology referral for MRI brain to rule out secondary causes.',
          },
          aiConfidence: 91,
          codes: {
            icd: [{ code: 'F41.1', confidence: 78, status: 'approved' }],
            cpt: [{ code: '99214', confidence: 90, status: 'approved' }],
          },
          history: [
            { at: daysAgo(2.2), event: 'Case created by doctor' },
            { at: daysAgo(2.15), event: 'AI summary generated (91% confidence)' },
            { at: daysAgo(2.1), event: 'Submitted to coder' },
            { at: daysAgo(2.05), event: 'Coder approved all codes' },
            { at: daysAgo(2), event: 'Report released to patient' },
          ],
        },
        {
          // Added in Phase 2 (schema v2): preserves the original static
          // "Robert Lee" sample card, now a real MockDB record sitting
          // with the coder so it demonstrates the "In Review" status.
          id: 'case-1005',
          patientId: 'u-pat-5',
          doctorId: 'u-doc-1',
          coderId: null,
          status: CASE_STATUS.CODER_REVIEW,
          sourceType: 'upload',
          createdAt: daysAgo(1.1),
          updatedAt: daysAgo(0.9),
          soap: {
            subjective: 'Robert Lee, 71-year-old male, COPD exacerbation, moderate severity (GOLD 3).',
            objective: 'Chest X-ray shows hyperinflation without consolidation. SpO2 91% on room air.',
            assessment: 'Acute COPD exacerbation, moderate severity.',
            plan: 'Prednisolone course prescribed. Salbutamol and Ipratropium nebulization initiated.',
          },
          aiConfidence: 85,
          codes: {
            icd: [{ code: 'J44.1', confidence: 85, status: 'pending' }],
            cpt: [{ code: '71046', confidence: 80, status: 'pending' }],
          },
          history: [
            { at: daysAgo(1.1), event: 'Case created by doctor (file upload)' },
            { at: daysAgo(1.05), event: 'OCR extraction completed' },
            { at: daysAgo(1.0), event: 'AI summary generated (85% confidence)' },
            { at: daysAgo(0.9), event: 'Submitted to coder' },
          ],
        },
      ],

      // ---- REPORTS (generated once a case is approved) ----
      reports: [
        {
          id: 'RPT-1001',
          caseId: 'case-1001',
          patientId: 'u-pat-1',
          status: 'approved',
          generatedAt: daysAgo(6),
        },
        {
          id: 'RPT-1004',
          caseId: 'case-1004',
          patientId: 'u-pat-4',
          status: 'approved',
          generatedAt: daysAgo(2),
        },
      ],

      // ---- NOTIFICATIONS ----
      notifications: [
        { id: 'n-1', userId: 'u-pat-1', type: 'report_ready', title: 'Report Ready',
          body: 'Your Cardiology report has been reviewed and released.', isRead: false,
          createdAt: daysAgo(6), relatedId: 'RPT-1001' },
        { id: 'n-2', userId: 'u-coder-1', type: 'case_submitted', title: 'New Case for Review',
          body: 'Maria Garcia — Pneumonia case submitted by Dr. Chen.', isRead: false,
          createdAt: daysAgo(0.3), relatedId: 'case-1002' },
        { id: 'n-3', userId: 'u-pat-4', type: 'report_ready', title: 'Report Ready',
          body: 'Your Neurology report has been reviewed and released.', isRead: true,
          createdAt: daysAgo(2), relatedId: 'RPT-1004' },
        { id: 'n-4', userId: 'u-doc-1', type: 'case_submitted', title: 'Case Pending Coder Review',
          body: 'Robert Lee — COPD case is in the coder queue.', isRead: true,
          createdAt: daysAgo(0.9), relatedId: 'case-1005' },
      ],

      // ---- AUDIT LOG (simulated activity trail) ----
      auditLog: [
        { id: 'a-1', at: daysAgo(7), actorId: 'u-doc-1', action: 'case.created', entity: 'case-1001' },
        { id: 'a-2', at: daysAgo(6.5), actorId: 'u-coder-1', action: 'case.approved', entity: 'case-1001' },
        { id: 'a-3', at: daysAgo(0.3), actorId: 'u-doc-1', action: 'case.submitted_to_coder', entity: 'case-1002' },
      ],
    };
  }

  // ----------------------------------------------------------
  // PERSISTENCE LAYER
  // ----------------------------------------------------------
  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return buildSeed();
      const parsed = JSON.parse(raw);
      if (!parsed || parsed.schemaVersion !== SCHEMA_VERSION) return buildSeed();
      return parsed;
    } catch (e) {
      console.warn('MockDB: failed to load, reseeding.', e);
      return buildSeed();
    }
  }

  function save(db) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(db));
    // Notify subscribers in THIS tab (the native "storage" event only fires in OTHER tabs).
    listeners.forEach((fn) => {
      try { fn(db); } catch (e) { console.error(e); }
    });
  }

  let db = load();
  const listeners = [];

  function uid(prefix) {
    return prefix + '-' + Math.random().toString(36).slice(2, 9);
  }

  function logAction(actorId, action, entity) {
    db.auditLog.unshift({ id: uid('audit'), at: new Date().toISOString(), actorId, action, entity });
  }

  // ----------------------------------------------------------
  // PUBLIC API
  // ----------------------------------------------------------
  const MockDB = {
    STATUS: CASE_STATUS,
    STATUS_LABELS,
    STATUS_BADGE_CLASS,

    /** Subscribe to any change in the mock database (same tab or cross-tab). Returns an unsubscribe fn. */
    subscribe(fn) {
      listeners.push(fn);
      const storageHandler = (e) => {
        if (e.key === STORAGE_KEY) {
          db = load();
          fn(db);
        }
      };
      window.addEventListener('storage', storageHandler);
      return () => {
        const i = listeners.indexOf(fn);
        if (i > -1) listeners.splice(i, 1);
        window.removeEventListener('storage', storageHandler);
      };
    },

    /** Restore the original seed data — wire to a "Reset Demo" button before a live run-through. */
    resetDemo() {
      db = buildSeed();
      save(db);
      return db;
    },

    // ---- Users ----
    getUser(id) { return db.users.find((u) => u.id === id) || null; },
    getUsersByRole(role) { return db.users.filter((u) => u.role === role); },
    findUserByEmail(email) {
      return db.users.find((u) => u.email.toLowerCase() === String(email).toLowerCase()) || null;
    },
    setUserActive(id, isActive) {
      const u = MockDB.getUser(id);
      if (!u) return null;
      u.isActive = isActive;
      logAction('u-admin-1', isActive ? 'user.activated' : 'user.deactivated', id);
      save(db);
      return u;
    },

    // ---- Reference data ----
    getIcdCodes() { return db.icdCodes.slice(); },
    getCptCodes() { return db.cptCodes.slice(); },
    getIcdByCode(code) { return db.icdCodes.find((c) => c.code === code) || null; },
    getCptByCode(code) { return db.cptCodes.find((c) => c.code === code) || null; },

    // ---- Appointments ----
    getAppointments(filter) {
      return db.appointments.filter((a) =>
        !filter || (
          (!filter.patientId || a.patientId === filter.patientId) &&
          (!filter.doctorId || a.doctorId === filter.doctorId)
        )
      );
    },
    createAppointment(data) {
      const apt = Object.assign({ id: uid('apt'), status: 'pending' }, data);
      db.appointments.push(apt);
      save(db);
      return apt;
    },

    // ---- Cases (the core workflow) ----
    getCase(id) { return db.cases.find((c) => c.id === id) || null; },
    getCases(filter) {
      return db.cases.filter((c) =>
        !filter || (
          (!filter.patientId || c.patientId === filter.patientId) &&
          (!filter.doctorId || c.doctorId === filter.doctorId) &&
          (!filter.coderId || c.coderId === filter.coderId)
        )
      );
    },
    getCasesByStatus(status) { return db.cases.filter((c) => c.status === status); },

    createCase(opts) {
      opts = opts || {};
      const c = {
        id: uid('case'),
        patientId: opts.patientId,
        doctorId: opts.doctorId,
        coderId: null,
        status: CASE_STATUS.AI_DONE,
        sourceType: opts.sourceType || 'typed',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        soap: opts.soapDraft || { subjective: '', objective: '', assessment: '', plan: '' },
        aiConfidence: Math.floor(80 + Math.random() * 18),
        codes: { icd: [], cpt: [] },
        history: [{ at: new Date().toISOString(), event: 'Case created by doctor' }],
      };
      db.cases.push(c);
      logAction(opts.doctorId, 'case.created', c.id);
      save(db);
      return c;
    },

    updateCaseStatus(caseId, status, eventLabel) {
      const c = MockDB.getCase(caseId);
      if (!c) return null;
      c.status = status;
      c.updatedAt = new Date().toISOString();
      c.history.push({ at: c.updatedAt, event: eventLabel || ('Status changed to ' + (STATUS_LABELS[status] || status)) });
      save(db);
      return c;
    },

    updateSoap(caseId, soapPatch) {
      const c = MockDB.getCase(caseId);
      if (!c) return null;
      c.soap = Object.assign({}, c.soap, soapPatch);
      c.updatedAt = new Date().toISOString();
      save(db);
      return c;
    },

    /** Doctor action: hands a reviewed case to the coder queue. */
    submitToCoder(caseId) {
      const c = MockDB.getCase(caseId);
      if (!c) return null;
      c.status = CASE_STATUS.SUBMITTED_TO_CODER;
      c.updatedAt = new Date().toISOString();
      c.history.push({ at: c.updatedAt, event: 'Submitted to coder' });

      const coder = MockDB.getUsersByRole('coder')[0];
      if (coder) {
        const patient = MockDB.getUser(c.patientId);
        MockDB.addNotification({
          userId: coder.id,
          type: 'case_submitted',
          title: 'New Case for Review',
          body: (patient ? patient.firstName + ' ' + patient.lastName : 'A patient') + ' — case submitted for coding review.',
          relatedId: c.id,
        });
      }
      logAction(c.doctorId, 'case.submitted_to_coder', c.id);
      save(db);
      return c;
    },

    /** Coder action: approve all codes, generate report, notify patient. */
    approveCase(caseId, coderId) {
      const c = MockDB.getCase(caseId);
      if (!c) return null;
      c.coderId = coderId || c.coderId;
      c.codes.icd.forEach((x) => { x.status = 'approved'; });
      c.codes.cpt.forEach((x) => { x.status = 'approved'; });
      c.updatedAt = new Date().toISOString();
      c.history.push({ at: c.updatedAt, event: 'Coder approved all codes' });

      const report = {
        id: 'RPT-' + Math.floor(1000 + Math.random() * 9000),
        caseId: c.id,
        patientId: c.patientId,
        status: 'approved',
        generatedAt: c.updatedAt,
      };
      db.reports.push(report);

      c.status = CASE_STATUS.RELEASED_TO_PATIENT;
      c.history.push({ at: c.updatedAt, event: 'Report released to patient' });

      MockDB.addNotification({
        userId: c.patientId,
        type: 'report_ready',
        title: 'Report Ready',
        body: 'Your clinical report has been reviewed and released.',
        relatedId: report.id,
      });

      logAction(coderId, 'case.approved', c.id);
      save(db);
      return { case: c, report: report };
    },

    /** Coder action: send the case back to the doctor with a reason. */
    returnForCorrection(caseId, coderId, reason) {
      const c = MockDB.getCase(caseId);
      if (!c) return null;
      c.status = CASE_STATUS.RETURNED_FOR_CORRECTION;
      c.updatedAt = new Date().toISOString();
      c.history.push({ at: c.updatedAt, event: 'Returned for correction: ' + (reason || 'No reason provided') });

      MockDB.addNotification({
        userId: c.doctorId,
        type: 'case_returned',
        title: 'Case Returned for Correction',
        body: reason || 'A coder has requested changes to this case.',
        relatedId: c.id,
      });

      logAction(coderId, 'case.returned_for_correction', c.id);
      save(db);
      return c;
    },

    // ---- Reports ----
    getReports(filter) {
      return db.reports.filter((r) => !filter || !filter.patientId || r.patientId === filter.patientId);
    },
    getReport(id) { return db.reports.find((r) => r.id === id) || null; },

    // ---- Notifications ----
    getNotifications(filter) {
      filter = filter || {};
      return db.notifications
        .filter((n) => (!filter.userId || n.userId === filter.userId) && (!filter.unreadOnly || !n.isRead))
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    },
    addNotification(data) {
      const n = Object.assign({ id: uid('notif'), isRead: false, createdAt: new Date().toISOString() }, data);
      db.notifications.unshift(n);
      save(db);
      return n;
    },
    markNotificationRead(id) {
      const n = db.notifications.find((x) => x.id === id);
      if (n) { n.isRead = true; save(db); }
      return n;
    },
    markAllRead(userId) {
      db.notifications.filter((n) => n.userId === userId).forEach((n) => { n.isRead = true; });
      save(db);
    },

    // ---- Audit log ----
    getAuditLog() { return db.auditLog.slice().sort((a, b) => new Date(b.at) - new Date(a.at)); },

    // ---- Raw access (debugging only — prefer the methods above) ----
    _raw() { return db; },
  };

  global.MockDB = MockDB;
})(window);
