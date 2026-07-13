const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const databaseApi = fs.readFileSync(path.resolve(__dirname, '..', '..', 'backend', 'server.js'), 'utf8');

const route = (pattern) => {
  const match = databaseApi.match(pattern);
  assert.ok(match, `Expected route source to match ${pattern}`);
  return match[0];
};

test('legacy appointment compatibility route scopes every role from JWT claims', () => {
  const source = route(/app\.get\('\/Appointment'[\s\S]*?\n\}\);/);
  assert.match(source, /Patient\.Clinic_ID = \?/);
  assert.match(source, /Doctor\.Blockchain_ID = \?/);
  assert.match(source, /Patient\.Blockchain_ID = \?/);
  assert.doesNotMatch(source, /SELECT \* FROM Appointment/);
});

test('legacy doctor compatibility route is clinic scoped or doctor self scoped', () => {
  const source = route(/app\.get\('\/Doctor'[\s\S]*?\n\}\);/);
  assert.match(source, /Doctor\.Clinic_ID=\?/);
  assert.match(source, /Doctor\.Blockchain_ID=\?/);
  assert.doesNotMatch(source, /SELECT \* FROM Doctor/);
});

test('doctor patient detail and list require assignment plus Fabric actor validation', () => {
  assert.match(databaseApi, /PATIENT_ASSIGNMENT_REQUIRED/);
  const selfList = route(/app\.get\('\/doctor\/me\/assigned-patients'[\s\S]*?\n\}\);/);
  assert.match(selfList, /req\.user\.blockchainID/);
  assert.match(selfList, /callBlockchain\(req, '\/doctor\/me\/assigned-patients', 'GET'\)/);
  assert.match(selfList, /JSON_CONTAINS\(Patient\.Doctors/);
});

test('sample lab results are disabled in production API', () => {
  const source = route(/app\.get\('\/Lab_Results'[\s\S]*?\n\}\);/);
  assert.match(source, /501/);
  assert.match(source, /LAB_RESULTS_NOT_IMPLEMENTED/);
});
