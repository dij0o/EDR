const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..', '..');
const db = fs.readFileSync(path.join(root, 'backend', 'server.js'), 'utf8');
const chaincode = fs.readFileSync(path.join(root, 'fabric-samples', 'dental-record-sharing', 'chaincode-javascript', 'lib', 'dentalRecordSharing.js'), 'utf8');
const blockchainApi = fs.readFileSync(path.join(root, 'dental-backend', 'index.js'), 'utf8');
const migration = fs.readFileSync(path.join(root, 'database', 'migrations', '2026-08-05-patient-clinic-transfer.sql'), 'utf8');
const card = fs.readFileSync(path.join(root, 'bc-dentistry-frontend', 'src', 'assets', 'components', 'Patients', 'PatientCard.jsx'), 'utf8');
const appointment = fs.readFileSync(path.join(root, 'bc-dentistry-frontend', 'src', 'assets', 'components', 'Appointments', 'NewAppointmentDialog.jsx'), 'utf8');

test('patient clinic association preserves historical directory membership', () => {
  assert.match(migration, /CREATE TABLE IF NOT EXISTS Patient_Clinic_Association/);
  assert.match(migration, /ENUM\('current','transferred'\)/);
  assert.match(db, /JOIN Patient_Clinic_Association PCA/);
  assert.match(db, /associationStatus/);
  assert.match(card, /Historical directory entry/);
  assert.match(card, /isAdmin && isOperational/);
});

test('transfer completion changes one operational owner and preserves history', () => {
  assert.match(db, /PATIENT_TRANSFER/);
  assert.match(db, /Association_Status='transferred'/);
  assert.match(db, /Association_Status='current'/);
  assert.match(db, /Automatically cancelled because patient ownership transferred/);
  assert.match(db, /UPDATE Patient SET Clinic_ID=\?,Doctors=\?/);
  assert.match(db, /transferRequests\/\$\{encodeURIComponent\(req\.body\.requestID\)\}/);
  assert.match(db, /TRANSFER_RESULT_MISMATCH/);
  assert.match(db, /patient clinic ownership transferred/);
  assert.match(chaincode, /request\.status = 'TRANSFER_COMPLETED'/);
  assert.match(chaincode, /patient\.clinicID = currentClinicID/);
  assert.match(chaincode, /patient\.doctors = \[request\.doctorID\]/);
  assert.match(chaincode, /priorDoctor\.patients/);
  assert.match(chaincode, /async ReadTransferRequest/);
  assert.match(chaincode, /\['TRANSFER_COMPLETED', 'REJECTED', 'REVOKED'\]/);
  assert.match(blockchainApi, /app\.get\('\/transferRequests\/:requestID'/);
});

test('former clinic cannot schedule or mutate a transferred patient', () => {
  assert.match(appointment, /patients\?operationalOnly=true/);
  assert.match(db, /APPOINTMENT_CLINIC_MISMATCH/);
  assert.match(db, /Patient and doctor must belong to the same current clinic/);
  assert.match(db, /requireAdminClinic\(req, current\.clinicID\)/);
});

test('new transfers must be requested from the current owner clinic', () => {
  assert.match(chaincode, /transfer must be requested from the current owner/);
  assert.match(chaincode, /already belongs to the requesting clinic/);
});
