const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const api = fs.readFileSync(path.resolve(__dirname, '..', 'index.js'), 'utf8');
const chaincode = fs.readFileSync(path.resolve(__dirname, '..', '..', 'fabric-samples', 'dental-record-sharing', 'chaincode-javascript', 'lib', 'dentalRecordSharing.js'), 'utf8');
const webRequests = fs.readFileSync(path.resolve(__dirname, '..', '..', 'bc-dentistry-frontend', 'src', 'assets', 'Pages', 'DataRequests.jsx'), 'utf8');
const mobileRequests = fs.readFileSync(path.resolve(__dirname, '..', '..', 'BC-Dentistry-Mobile-App', 'app', '(tabs)', 'requests.jsx'), 'utf8');
const mobileApproved = fs.readFileSync(path.resolve(__dirname, '..', '..', 'BC-Dentistry-Mobile-App', 'app', 'proceedRequests.jsx'), 'utf8');
const doctorRequest = fs.readFileSync(path.resolve(__dirname, '..', '..', 'bc-dentistry-frontend', 'src', 'assets', 'components', 'Patients', 'RequestDataAccessDialog.jsx'), 'utf8');
const applicationApi = fs.readFileSync(path.resolve(__dirname, '..', '..', 'backend', 'server.js'), 'utf8');

test('access requests capture who, what, when, why, and notify admins', () => {
  assert.match(api, /requireFields\(req\.body, \['doctorID', 'patientID', 'dataOriginClinicID', 'dataType', 'purpose', 'expiresAt'\]\)/);
  assert.match(api, /'RequestDataAccess'[\s\S]*String\(req\.body\.dataType\)[\s\S]*String\(req\.body\.purpose\)[\s\S]*JSON\.stringify\(accessRequestDetails\(req\.body\)\)/);
  assert.match(chaincode, /async RequestDataAccess\(ctx, doctorID, patientID, dataOriginClinicID, dataType, purpose, detailsJson\)/);
  assert.match(chaincode, /dataType = dataType \|\| 'Dental and Medical Records'/);
  assert.match(chaincode, /purpose = purpose \|\| 'clinical consultation'/);
  assert.match(chaincode, /requestedAt/);
  assert.match(chaincode, /purpose: String\(purpose/);
  assert.match(chaincode, /ACCESS_REQUEST_PENDING_ADMIN/);
  assert.match(api, /accessRequestDetails\(req\.body\)/);
  assert.match(applicationApi, /app\.post\(\['\/requestDataAccess', '\/requestAccess'\]/);
  assert.match(applicationApi, /doctorID:req\.user\.blockchainID/);
  assert.match(applicationApi, /DATA_ORIGIN_CLINIC_MISMATCH/);
  assert.match(doctorRequest, /databaseUrl\('\/requestDataAccess'\)/);
  assert.match(doctorRequest, /Find patient by/);
  assert.match(doctorRequest, /Patient identifier/);
  assert.match(doctorRequest, /patientLookupType/);
  assert.match(doctorRequest, /patientLookupValue/);
  assert.doesNotMatch(doctorRequest, /Patient blockchain ID/);
  assert.doesNotMatch(doctorRequest, /Data-origin clinic ID/);
  assert.match(doctorRequest, /Clinical purpose/);
  assert.match(doctorRequest, /Referral access expires/);
});

test('admin and patient decisions create notifications and support revocation', () => {
  assert.match(chaincode, /ACCESS_REQUEST_PENDING_PATIENT/);
  assert.match(chaincode, /consentTxID/);
  assert.match(chaincode, /consentMSPID/);
  assert.match(chaincode, /request\.status = 'ACTIVE'/);
  assert.match(chaincode, /operationalOwnerChanged: false/);
  assert.match(chaincode, /async RevokeConsent\(ctx, patientID, requestID, revocationReason\)/);
  assert.match(chaincode, /revocationReason = revocationReason \|\| 'Patient revoked consent'/);
  assert.match(chaincode, /request\.status = 'REVOKED'/);
  assert.match(chaincode, /ACCESS_REQUEST_CONSENT_REVOKED/);
  assert.match(api, /app\.post\('\/patient\/revokeConsent'/);
  assert.match(api, /submitTransaction\(\s*'RevokeConsent'/);
  assert.match(mobileApproved, /revokeConsent/);
  assert.match(mobileApproved, /\/patient\/revokeConsent/);
});

test('referrals are scoped, expiring, and closable by the receiving doctor', () => {
  assert.match(chaincode, /workflowType: 'REFERRAL'/);
  assert.match(chaincode, /requestedRecordTypes/);
  assert.match(chaincode, /expiresAt/);
  assert.match(chaincode, /async CompleteReferral/);
  assert.match(chaincode, /request\.status = 'COMPLETED'/);
  assert.match(chaincode, /originClinicID:doctor\.clinicID/);
  assert.match(chaincode, /referralID:access\.requestID/);
  assert.match(api, /app\.post\('\/referrals\/:requestID\/complete'/);
  assert.match(applicationApi, /app\.post\('\/referrals\/:requestID\/complete'/);
});

test('notification and audit APIs are exposed to authenticated owners', () => {
  assert.match(chaincode, /async GetNotificationsForActor\(ctx, recipientRole, recipientID, statusFilter\)/);
  assert.match(chaincode, /statusFilter = statusFilter \|\| 'ALL'/);
  assert.match(chaincode, /async MarkNotificationRead/);
  assert.match(api, /app\.get\('\/notifications'/);
  assert.match(api, /app\.post\('\/notifications\/:notificationID\/read'/);
  assert.match(chaincode, /accessBasis/);
  assert.match(chaincode, /requestID/);
  assert.match(api, /\/audit\/clinical-access\/:patientID/);
  assert.match(webRequests, /Access Audit/);
  assert.match(webRequests, /audit\/clinical-access/);
});

test('patient-facing request details are sourced from request data', () => {
  assert.match(mobileRequests, /request\.purpose \|\| request\.reason \|\| request\.dataType/);
  assert.match(mobileRequests, /request\.requestedAt/);
  assert.match(webRequests, /Purpose:/);
  assert.doesNotMatch(webRequests, /DataRequestsData/);
  assert.match(chaincode, /status:'CONSENT_GRANTED', lifecycleStatus:'ACTIVE'/);
});
