const fs = require('fs');
const path = require('path');

const json = (value) => ({
  mode: 'raw',
  raw: JSON.stringify(value, null, 2),
  options: { raw: { language: 'json' } },
});

const request = (name, method, base, route, description, options = {}) => {
  const headers = [];
  if (options.auth !== false) {
    headers.push({ key: 'Authorization', value: 'Bearer {{accessToken}}', type: 'text' });
    headers.push({ key: 'Origin', value: '{{webOrigin}}', type: 'text' });
  }
  if (options.contentType) {
    headers.push({ key: 'Content-Type', value: options.contentType, type: 'text' });
  } else if (options.body) {
    headers.push({ key: 'Content-Type', value: 'application/json', type: 'text' });
  }
  for (const [key, value] of Object.entries(options.headers || {})) {
    headers.push({ key, value, type: 'text' });
  }

  const result = {
    name,
    request: {
      method,
      header: headers,
      description,
      url: `${base}${route}`,
    },
    response: [],
  };
  if (options.body) result.request.body = json(options.body);
  if (options.rawBody) {
    result.request.body = {
      mode: 'file',
      file: { src: options.rawBody },
    };
  }
  if (options.tests) {
    result.event = [{
      listen: 'test',
      script: { type: 'text/javascript', exec: options.tests.split('\n') },
    }];
  }
  return result;
};

const db = '{{databaseApiBaseUrl}}';

const loginTests = [
  'pm.test("Login succeeded", () => pm.response.to.have.status(200));',
  'const payload = pm.response.json();',
  'if (payload.token) pm.collectionVariables.set("accessToken", payload.token);',
  'if (payload.refreshToken) pm.collectionVariables.set("refreshToken", payload.refreshToken);',
  'if (payload.csrfToken) pm.collectionVariables.set("csrfToken", payload.csrfToken);',
  'if (payload.user) {',
  '  pm.collectionVariables.set("userId", String(payload.user.id || ""));',
  '  pm.collectionVariables.set("patientId", String(payload.user.blockchainID || ""));',
  '  pm.collectionVariables.set("doctorId", String(payload.user.blockchainID || ""));',
  '  pm.collectionVariables.set("clinicId", String(payload.user.organizationId || ""));',
  '}',
].join('\n');

const web = [
  {
    name: 'Authentication & Account',
    item: [
      request('Login', 'POST', db, '/login',
        'Authenticates a web user and returns a short-lived JWT plus the user profile. The test script stores the JWT and identity values as collection variables.',
        { auth: false, body: { email: '{{userEmail}}', password: '{{userPassword}}', clientType: 'web', deviceLabel: 'Postman web session' }, tests: loginTests }),
      request('Refresh Web Session', 'POST', db, '/auth/refresh',
        'Rotates the HttpOnly refresh cookie and issues a new short-lived web access cookie. In a browser the X-CSRF-Token header must match the readable CSRF cookie.',
        { auth: false, headers: { 'X-CSRF-Token': '{{csrfToken}}', Origin: '{{webOrigin}}' } }),
      request('Logout Current Session', 'POST', db, '/auth/logout', 'Revokes the current server session and clears web authentication cookies.'),
      request('Get Current User', 'GET', db, '/auth/me', 'Returns the authoritative profile for the current active session.'),
      request('List Active Sessions', 'GET', db, '/auth/sessions', 'Lists active devices and marks the current session.'),
      request('Revoke Selected Session', 'DELETE', db, '/auth/sessions/{{sessionId}}', 'Revokes one session owned by the current user.'),
      request('Logout All Sessions', 'POST', db, '/auth/logout-all',
        'Requires the current password and revokes every active session for the user.',
        { body: { currentPassword: '{{userPassword}}' } }),
      request('Change Password', 'POST', db, '/change-password',
        'Changes the authenticated user password. Required for accounts flagged mustChangePassword; returns a replacement JWT.',
        { body: { currentPassword: '{{userPassword}}', newPassword: '{{newPassword}}' } }),
      request('Register Clinic Admin', 'POST', db, '/register',
        'System-admin-only route used by the web signup/admin provisioning flow to create a clinic admin for an existing clinic.',
        { body: { firstName: 'Ayesha', lastName: 'Admin', username: 'ayesha.admin@example.com', contactNumber: '+971500000001', organizationId: '{{clinicId}}', password: '{{temporaryPassword}}' } }),
    ],
  },
  {
    name: 'Clinic Management',
    item: [
      request('List Clinics', 'GET', db, '/clinics', 'System-admin-only list of application-level clinics and their admin counts.'),
      request('Create Clinic and Primary Admin', 'POST', db, '/clinics',
        'System-admin-only atomic creation of a clinic and its required first clinic admin.',
        { body: { name: 'Example Dental Clinic', address: 'Dubai, UAE', description: 'Postman example clinic', coordinates: '25.2048,55.2708', type: 'Dental Clinic', admin: { firstName: 'Primary', lastName: 'Admin', email: 'primary.admin@example.com', contactNumber: '+971500000002', password: '{{temporaryPassword}}' } } }),
      request('Update Clinic Status or Details', 'PATCH', db, '/clinics/{{clinicId}}',
        'System-admin-only update of clinic details and active status.',
        { body: { name: 'Example Dental Clinic', address: 'Dubai, UAE', description: 'Updated through Postman', coordinates: '25.2048,55.2708', type: 'Dental Clinic', isActive: true } }),
    ],
  },
  {
    name: 'Doctor Management',
    item: [
      request('List Doctors', 'GET', db, '/doctors', 'Lists doctors in the authenticated clinic admin’s clinic.'),
      request('Create Doctor', 'POST', db, '/doctors',
        'Creates a doctor through the public application API. The backend commits MySQL/Fabric records and synchronously enrolls the actor-bound Fabric identity; clients never contact the private Blockchain API.',
        { body: { firstName: 'Omar', lastName: 'Dentist', email: 'omar.dentist@example.com', contactNumber: '+971500000003', password: '{{temporaryPassword}}', worksAt: 'Example Dental Clinic', speciality: 'General Dentistry', licenseNumber: 'LIC-POSTMAN-001', emiratesID: '784-0000-0000000-1' } }),
      request('Update Doctor', 'PUT', db, '/doctors/{{doctorId}}',
        'Updates a doctor in MySQL and Fabric. doctorId is the doctor blockchain ID.',
        { body: { firstName: 'Omar', lastName: 'Dentist', email: 'omar.dentist@example.com', contactNumber: '+971500000003', worksAt: 'Example Dental Clinic', speciality: 'Orthodontics', licenseNumber: 'LIC-POSTMAN-001', emiratesID: '784-0000-0000000-1' } }),
      request('Delete Doctor', 'DELETE', db, '/doctors/{{doctorId}}',
        'Deletes a doctor record from MySQL and Fabric. Operational Fabric identity revocation remains a deployment task.'),
    ],
  },
  {
    name: 'Patient Management',
    item: [
      request('List Clinic Patients', 'GET', db, '/patients', 'Clinic-admin list of patients belonging to the authenticated clinic.'),
      request('List My Assigned Patients', 'GET', db, '/doctor/me/assigned-patients', 'Doctor-only list of patients assigned to the authenticated doctor.'),
      request('Get Patient', 'GET', db, '/patients/{{patientId}}', 'Loads one authorized patient record for admin, assigned doctor, or the patient themself.'),
      request('Create Patient', 'POST', db, '/patients',
        'Creates a patient through the public application API, stores PII in MySQL, anchors metadata/hash on Fabric, enrolls the patient identity, and applies doctor assignments.',
        { body: { firstName: 'Fatima', lastName: 'Patient', dateOfBirth: '1995-05-15', gender: 'Female', contactNumber: '+971500000004', email: 'fatima.patient@example.com', password: '{{temporaryPassword}}', emiratesID: '784-1995-0000000-2', nationality: 'Emirati', address: 'Dubai, UAE', bloodType: 'O+', medicalHistory: ['Replace with medical history'], allergies: ['Replace with allergies or use an empty array'], medications: ['Replace with medications or use an empty array'], insuranceDetails: { provider: 'Example Insurance', policyNumber: 'POL-001', coverageType: 'Dental' }, clinicID: '{{clinicId}}', doctors: ['{{doctorId}}'] } }),
      request('Update Patient', 'PUT', db, '/patients/{{patientId}}',
        'Clinic-admin update of a patient record in MySQL and Fabric.',
        { body: { firstName: 'Fatima', lastName: 'Patient', dateOfBirth: '1995-05-15', gender: 'Female', contactNumber: '+971500000004', email: 'fatima.patient@example.com', emiratesID: '784-1995-0000000-2', nationality: 'Emirati', address: 'Dubai, UAE', bloodType: 'O+', medicalHistory: ['Updated medical history'], allergies: [], medications: [], insuranceDetails: { provider: 'Example Insurance', policyNumber: 'POL-001', coverageType: 'Dental' }, clinicID: '{{clinicId}}', doctors: ['{{doctorId}}'] } }),
      request('Assign Patient to Doctor', 'POST', db, '/patients/{{patientId}}/assign',
        'Assigns a patient through the public application API. The backend validates clinic scope, refreshes patient metadata/hash, and updates both ledger relationship directions.',
        { body: { doctorID: '{{doctorId}}' } }),
      request('Delete Patient', 'DELETE', db, '/patients/{{patientId}}', 'Clinic-admin deletion of a patient from MySQL and Fabric.'),
    ],
  },
  {
    name: 'Clinical Records',
    item: [
      request('Get Medical Records', 'GET', db, '/patients/{{patientId}}/clinical-records/medical?purpose=patient%20record%20view',
        'Loads medical records for an authorized doctor or the patient and records the stated access purpose.'),
      request('Get Dental Records', 'GET', db, '/patients/{{patientId}}/clinical-records/dental?purpose=patient%20record%20view',
        'Loads dental chart records for an authorized doctor or the patient and records the stated access purpose.'),
      request('Create Clinical Record', 'POST', db, '/clinical-records',
        'Doctor-only creation of a medical or dental record; persists the record and anchors its metadata on Fabric.',
        { body: { patientID: '{{patientId}}', recordType: 'medical', payload: { diagnosis: 'Example diagnosis', treatment: 'Example treatment', notes: 'Replace with clinical data' } } }),
    ],
  },
  {
    name: 'Appointments & Lab Results',
    item: [
      request('List Appointments', 'GET', db, '/appointments', 'Role-scoped appointment list used by web dashboards and appointment pages.'),
      request('List Appointment Doctors', 'GET', db, '/appointment-options/doctors', 'Clinic-admin list of doctors available for appointment creation and patient assignment.'),
      request('Create Appointment', 'POST', db, '/appointments',
        'Clinic-admin creation of an appointment for a patient and doctor.',
        { body: { patientID: '{{patientId}}', doctorID: '{{doctorId}}', appointmentDateTime: '2026-08-15T10:00:00.000Z', specialty: 'General Dentistry', meetingFor: 'Dental check-up', notes: 'Postman example appointment' } }),
      request('Update Appointment', 'PUT', db, '/appointments/{{appointmentId}}',
        'Clinic-admin update of appointment date, specialty, reason, or notes. The backend resets the status to scheduled.',
        { body: { appointmentDateTime: '2026-08-15T11:00:00.000Z', specialty: 'General Dentistry', meetingFor: 'Dental check-up', notes: 'Rescheduled through Postman' } }),
      request('Cancel Appointment', 'PATCH', db, '/appointments/{{appointmentId}}/cancel',
        'Clinic-admin cancellation with a required cancellation reason.',
        { body: { reason: 'Patient requested cancellation' } }),
      request('List Lab Results', 'GET', db, '/Lab_Results', 'Loads lab results for authenticated clinic admins and doctors.'),
    ],
  },
  {
    name: 'Data Access & Consent',
    item: [
      request('List Requests for Clinic Admin', 'GET', db, '/getRequestsForAdmin/{{clinicId}}', 'Lists cross-clinic data-access requests through the public application API for the authenticated clinic admin.'),
      request('Approve Request as Admin', 'POST', db, '/approveRequest',
        'Clinic admin approves the request’s administrative stage; patient consent is still required.',
        { body: { adminID: '{{userId}}', requestID: '{{requestId}}', adminClinicID: '{{clinicId}}' } }),
      request('Reject Request as Admin', 'POST', db, '/admin/rejectRequest',
        'Clinic admin rejects a cross-clinic access request and records the reason on the workflow.',
        { body: { adminID: '{{userId}}', requestID: '{{requestId}}', adminClinicID: '{{clinicId}}', rejectionReason: 'Request does not meet clinic policy' } }),
      request('Request Patient Data Access', 'POST', db, '/requestAccess',
        'Doctor initiates a purpose-bound request to access a patient record held by another clinic.',
        { body: { doctorID: '{{doctorId}}', patientID: '{{patientId}}', dataOriginClinicID: '{{clinicId}}', dataType: 'Medical and Dental Records', purpose: 'Continuity of care', reason: 'Continuity of care', notes: 'Postman example request' } }),
      request('Get Clinical Access Audit', 'GET', db, '/audit/clinical-access/{{patientId}}',
        'Loads the clinical-access audit trail for a patient. Authorization is role and identity scoped.'),
    ],
  },
  {
    name: 'Radiographic & DICOM Files',
    item: [
      request('List Patient Radiographic Files', 'GET', db, '/patients/{{patientId}}/radiographic-files', 'Lists Fabric-anchored radiographic/DICOM metadata through the public application API.'),
      request('Upload Radiographic File', 'POST', db, '/radiographic-files',
        'Doctor uploads raw file bytes to private storage and anchors SHA-256 metadata on Fabric. Select a local .dcm or image file in Postman.',
        { contentType: 'application/octet-stream', rawBody: '', headers: { 'x-patient-id': '{{patientId}}', 'x-file-name': 'example.dcm', 'x-file-media-type': 'application/dicom' } }),
      request('Verify Radiographic File Integrity', 'GET', db, '/radiographic-files/{{fileId}}/verify-integrity', 'Recomputes the stored file hash and compares it with Fabric metadata through the public application API.'),
      request('Download/View Radiographic File', 'GET', db, '/radiographic-files/{{fileId}}/content?purpose=radiographic%20image%20view', 'Streams a file through the public application API only after integrity verification and logs the access purpose.'),
    ],
  },
  {
    name: 'Notifications & Push Devices',
    item: [
      request('List Notifications', 'GET', db, '/notifications?status=ALL', 'Lists ledger-backed notifications through the public application API. status may be ALL, READ, or UNREAD.'),
      request('Mark Notification Read', 'POST', db, '/notifications/{{notificationId}}/read', 'Marks one notification as read through the public application API.'),
      request('Get Push Configuration', 'GET', db, '/push/config', 'Returns server push readiness and token staleness configuration through the public application API.'),
      request('List Push Subscriptions', 'GET', db, '/push/subscriptions', 'Lists notification device registrations owned by the authenticated actor.'),
      request('Register Web Push Token', 'POST', db, '/push/subscriptions',
        'Registers a browser Firebase token for the authenticated actor.',
        { body: { platform: 'web', token: '{{pushToken}}', deviceLabel: 'Chrome on team workstation' } }),
      request('Unregister Current Push Token', 'DELETE', db, '/push/subscriptions',
        'Unregisters a push token, normally during logout.',
        { body: { token: '{{pushToken}}' } }),
      request('Remove Push Subscription by ID', 'DELETE', db, '/push/subscriptions/{{subscriptionId}}', 'Removes a selected notification device belonging to the authenticated actor.'),
    ],
  },
];

const mobile = [
  {
    name: 'Authentication',
    description: 'Authentication calls used or required by the patient mobile app.',
    item: [
      request('Patient Login', 'POST', db, '/login',
        '**Purpose:** Authenticate a patient and obtain the short-lived access token and rotating refresh token required by protected mobile APIs.\n\n**Current behavior:** Native login returns `{ token, refreshToken, user }`. The app rejects non-patient users and stores refresh credentials in OS-backed SecureStore. The test script stores session and patient identity values as collection variables.',
        { auth: false, body: { email: '{{patientEmail}}', password: '{{patientPassword}}', clientType: 'android', deviceLabel: 'Postman mobile session' }, tests: loginTests }),
    ],
  },
  {
    name: 'Appointments',
    description: 'Read-only appointment data shown on the patient home screen.',
    item: [
      request('List Patient Appointments', 'GET', db, '/appointments?period={{appointmentPeriod}}',
        '**Purpose:** Show the signed-in patient’s upcoming or past appointments.\n\n**How it is scoped:** The backend derives the patient from the verified JWT; the mobile app supplies only the `period` filter.\n\n**Query:** Set `appointmentPeriod` to the UI period value, typically `upcoming` or `past`.\n\n**Authorization:** Patient bearer token required.'),
    ],
  },
  {
    name: 'Data Requests & Consent',
    description: 'Patient-facing review and control of cross-clinic record-access requests.',
    item: [
      request('List All Patient Data Requests', 'GET', db, '/getAllRequestsForPatient/{{patientId}}',
        '**Purpose:** Populate Pending, Approved, Rejected, and Documents views with all data-access requests for the signed-in patient.\n\n**Identity rule:** `patientId` must match the blockchain ID in the verified JWT; another patient ID is rejected.\n\n**Authorization:** Patient bearer token required.'),
      request('Grant Consent', 'POST', db, '/grantConsent',
        '**Purpose:** Let the patient approve a clinic-admin-approved request so the requesting doctor can access the specified data for the recorded purpose.\n\n**Effect:** Changes the request to `CONSENT_GRANTED`, writes the decision to Fabric, and can trigger a notification.\n\n**Identity rule:** `patientID` must match the patient blockchain ID in the JWT.',
        { body: { patientID: '{{patientId}}', requestID: '{{requestId}}' } }),
      request('Reject Data Request', 'POST', db, '/patient/rejectRequest',
        '**Purpose:** Let the patient deny a pending data-access request and record the reason.\n\n**Effect:** Changes the workflow status to rejected on Fabric and can notify the requester.\n\n**Identity rule:** `patientID` must match the patient blockchain ID in the JWT.',
        { body: { patientID: '{{patientId}}', requestID: '{{requestId}}', rejectionReason: 'Not authorized' } }),
      request('Revoke Previously Granted Consent', 'POST', db, '/patient/revokeConsent',
        '**Purpose:** Let the patient withdraw previously granted access.\n\n**Effect:** Revokes consent for the selected request on Fabric and notifies relevant actors. This does not delete the underlying health record.\n\n**Identity rule:** `patientID` must match the patient blockchain ID in the JWT.',
        { body: { patientID: '{{patientId}}', requestID: '{{requestId}}', revocationReason: 'Revoked from patient mobile app' } }),
    ],
  },
  {
    name: 'Secure Session Lifecycle',
    description: 'Implemented native session lifecycle. Mobile stores the rotating refresh token in OS-backed SecureStore and keeps the short-lived access token in memory.',
    item: [
      request('Refresh Access Token', 'POST', db, '/auth/refresh',
        '**Purpose:** Rotate the one-time-use refresh token and obtain a new short-lived access token without asking the patient to sign in again.\n\n**Security behavior:** The submitted refresh token becomes unusable. Reusing it revokes the complete session family. The test script stores the replacement credentials.',
        { auth: false, body: { refreshToken: '{{refreshToken}}' }, tests: loginTests }),
      request('Logout / Revoke Current Session', 'POST', db, '/auth/logout',
        '**Purpose:** Immediately revoke the current mobile session on the server before SecureStore and in-memory state are cleared.\n\n**Effect:** Previously issued access and refresh credentials for this session are rejected by both APIs.'),
      request('Get Current Patient Session', 'GET', db, '/auth/me',
        '**Purpose:** Restore and confirm the authoritative patient identity after startup refresh.\n\n**Authorization:** A current mobile access token is required.'),
      request('List Patient Devices', 'GET', db, '/auth/sessions',
        '**Purpose:** Show active web and mobile sessions so the patient can identify and revoke devices.'),
      request('Revoke Selected Device', 'DELETE', db, '/auth/sessions/{{sessionId}}',
        '**Purpose:** Immediately revoke one session/device owned by the signed-in patient.'),
    ],
  },
];

const collection = {
  info: {
    _postman_id: '02fa1974-8b0c-4da5-9947-ed2202607290',
    name: 'BC Dentistry EDR - Web and Mobile APIs',
    description: [
      'Source-derived Postman collection for the clean release branch.',
      '',
      'The Web and Mobile trees intentionally duplicate overlapping routes so each team can export or use its own folder independently.',
      '',
      'Mobile request descriptions explain purpose, authorization/identity constraints, and side effects, including the implemented rotating refresh-token lifecycle.',
      '',
      'All web and mobile requests use one public application API. The private Blockchain API has no collection variable or client request and requires internal service authentication.',
      '',
      'Use non-production test accounts and never commit real passwords, JWTs, refresh tokens, patient data, or push tokens into this collection.',
    ].join('\n'),
    schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json',
  },
  auth: {
    type: 'bearer',
    bearer: [{ key: 'token', value: '{{accessToken}}', type: 'string' }],
  },
  item: [
    { name: 'Web', description: 'APIs invoked by the React web frontend.', item: web },
    { name: 'Mobile', description: 'APIs invoked by the Expo patient mobile app through the public application API only.', item: mobile },
    {
      name: 'Security Boundary',
      description: 'Negative validation proving the private Blockchain API is not exposed to clients.',
      item: [
        request('Public Blockchain Route Is Not Exposed', 'GET', '{{webOrigin}}', '/api/blockchain/health',
          'Must return HTTP 404. Web, mobile, and Postman use databaseApiBaseUrl; only the application API can reach the Blockchain API over the private service network.',
          { auth: false, tests: 'pm.test("Private blockchain route is not public", () => pm.response.to.have.status(404));' }),
      ],
    },
  ],
  variable: [
    { key: 'databaseApiBaseUrl', value: 'https://edr.bizcenter.tech/api/database', type: 'string' },
    { key: 'webOrigin', value: 'https://edr.bizcenter.tech', type: 'string' },
    { key: 'accessToken', value: '', type: 'string' },
    { key: 'refreshToken', value: '', type: 'string' },
    { key: 'userEmail', value: '', type: 'string' },
    { key: 'userPassword', value: '', type: 'string' },
    { key: 'patientEmail', value: '', type: 'string' },
    { key: 'patientPassword', value: '', type: 'string' },
    { key: 'newPassword', value: 'ReplaceMe2!Strong', type: 'string' },
    { key: 'temporaryPassword', value: 'ReplaceMe1!Strong', type: 'string' },
    { key: 'userId', value: '', type: 'string' },
    { key: 'clinicId', value: '', type: 'string' },
    { key: 'doctorId', value: '', type: 'string' },
    { key: 'patientId', value: '', type: 'string' },
    { key: 'appointmentId', value: '', type: 'string' },
    { key: 'appointmentPeriod', value: 'upcoming', type: 'string' },
    { key: 'requestId', value: '', type: 'string' },
    { key: 'fileId', value: '', type: 'string' },
    { key: 'notificationId', value: '', type: 'string' },
    { key: 'subscriptionId', value: '', type: 'string' },
    { key: 'sessionId', value: '', type: 'string' },
    { key: 'csrfToken', value: '', type: 'string' },
    { key: 'pushToken', value: '', type: 'string' },
  ],
};

const output = path.join(__dirname, 'BC_Dentistry_EDR_Web_Mobile.postman_collection.json');
fs.writeFileSync(output, `${JSON.stringify(collection, null, 2)}\n`, 'utf8');
console.log(`Wrote ${output}`);
