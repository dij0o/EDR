'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const collectionPath = path.join(__dirname, 'BC_Dentistry_EDR_Web_Mobile.postman_collection.json');
const collection = JSON.parse(fs.readFileSync(collectionPath, 'utf8'));
const requests = [];

const visit = (items, folders = []) => {
  for (const item of items || []) {
    if (item.request) requests.push({ ...item, folders });
    if (item.item) visit(item.item, [...folders, item.name]);
  }
};
visit(collection.item);

const variables = new Map((collection.variable || []).map(({ key, value }) => [key, value]));
assert.equal(variables.has('blockchainApiBaseUrl'), false);
assert.equal(variables.get('databaseApiBaseUrl'), 'https://edr.bizcenter.tech/api/database');
assert.equal(variables.get('webOrigin'), 'https://edr.bizcenter.tech');

const boundary = requests.filter(({ request }) => request.url === '{{webOrigin}}/api/blockchain/health');
assert.equal(boundary.length, 1);
assert.ok(boundary[0].folders.includes('Security Boundary'));

for (const { name, request } of requests) {
  if (request.url === '{{webOrigin}}/api/blockchain/health') continue;
  assert.ok(
    request.url.startsWith('{{databaseApiBaseUrl}}/'),
    `${name} does not use the public application API: ${request.url}`,
  );
  assert.doesNotMatch(request.url, /localhost:8081|blockchainApiBaseUrl/);
}

for (const route of [
  '/doctors',
  '/patients',
  '/patients/{{patientId}}/assign',
  '/doctor/me/assigned-patients',
  '/getRequestsForAdmin/{{clinicId}}',
  '/getAllRequestsForPatient/{{patientId}}',
  '/notifications?status=ALL',
  '/patients/{{patientId}}/radiographic-files',
]) {
  assert.ok(requests.some(({ request }) => request.url === `{{databaseApiBaseUrl}}${route}`), `Missing ${route}`);
}

assert.ok(requests.length >= 60, `Expected at least 60 requests, found ${requests.length}`);
console.log(`POSTMAN_COLLECTION_OK requests=${requests.length} clientBlockchainRequests=0 boundaryChecks=1`);
