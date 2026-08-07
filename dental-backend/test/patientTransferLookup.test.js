const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..', '..');
const api = fs.readFileSync(path.join(root, 'backend', 'server.js'), 'utf8');
const patientsPage = fs.readFileSync(path.join(root, 'bc-dentistry-frontend', 'src', 'assets', 'Pages', 'Patients.jsx'), 'utf8');
const patientCards = fs.readFileSync(path.join(root, 'bc-dentistry-frontend', 'src', 'assets', 'Sections', 'Patients', 'PatientsCards.jsx'), 'utf8');

test('doctor directory is sourced only from the assigned-patients self route', () => {
  assert.match(patientsPage, /role === 'doctor'.*\/doctor\/me\/assigned-patients/);
  assert.doesNotMatch(patientCards, /patients\/search|patients\/lookup/);
  assert.match(patientsPage, /RequestDataAccessDialog/);
});

test('application API does not expose cross-clinic patient discovery', () => {
  assert.doesNotMatch(api, /app\.get\('\/patients\/(?:search|lookup)/);
});

test('canonical request API derives current clinic and prevents client tenant override', () => {
  const start = api.indexOf("app.post(['/requestDataAccess', '/requestAccess']");
  const source = api.slice(start, api.indexOf("app.get('/getAllRequestsForPatient", start));
  assert.match(source, /dataOriginClinicID:Number\(rows\[0\]\.Clinic_ID\)/);
  assert.match(source, /doctorID:req\.user\.blockchainID/);
  assert.match(source, /DATA_ACCESS_NOT_REQUIRED/);
  assert.match(source, /DATA_ORIGIN_CLINIC_MISMATCH/);
  assert.match(source, /REQUEST_PURPOSE_TOO_LONG/);
});
