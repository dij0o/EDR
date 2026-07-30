'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { identityDefinition } = require('../fabricEnrollment');

const root = path.resolve(__dirname, '..', '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

test('generated doctor and patient accounts map to actor-bound Fabric identities', () => {
    const doctorID = 'Doctor-11111111-1111-4111-8111-111111111111';
    const patientID = 'Patient-22222222-2222-4222-8222-222222222222';
    assert.deepEqual(identityDefinition({ role: 'doctor', actorID: doctorID, clinicID: 7 }), {
        label: `doctor-${doctorID}`, role: 'doctor', actorID: doctorID, clinicID: '7',
    });
    assert.deepEqual(identityDefinition({ role: 'patient', actorID: patientID, clinicID: 7 }), {
        label: `patient-${patientID}`, role: 'patient', actorID: patientID, clinicID: '7',
    });
    assert.throws(() => identityDefinition({ role: 'doctor', actorID: patientID, clinicID: 7 }), /prefix/);
    assert.equal(identityDefinition({ role: 'doctor', actorID: 'Doctor1', clinicID: 7 }).label, 'doctor-Doctor1');
});

test('container startup reconciles identities for accounts created before this fix', () => {
    const dockerfile = read('dental-backend/Dockerfile');
    const reconcile = read('dental-backend/reconcileFabricIdentities.js');
    assert.match(dockerfile, /node reconcileFabricIdentities\.js/);
    assert.match(reconcile, /FROM Doctor WHERE Blockchain_ID IS NOT NULL/);
    assert.match(reconcile, /FROM Patient WHERE Blockchain_ID IS NOT NULL/);
    assert.match(reconcile, /enrollIdentity/);
    assert.match(reconcile, /contract\.submitTransaction\(\s*'assignPatientToDoctor'/);
    assert.match(reconcile, /doctorBlockchainIDByDatabaseID/);
    assert.match(reconcile, /skippedAssignments/);
    assert.match(reconcile, /unknown legacy relationship/);
    assert.match(reconcile, /failedAssignments/);
    assert.match(reconcile, /could not replay/);
});

test('account creation provisions Fabric identity before ledger actor creation', () => {
    const api = read('backend/server.js');
    const doctorRoute = api.match(/app\.post\('\/doctors'[\s\S]*?\n\}\);/)[0];
    const patientRoute = api.match(/app\.post\('\/patients'[\s\S]*?\n\}\);/)[0];
    assert.ok(doctorRoute.indexOf("provisionFabricIdentity(req, 'doctor'") < doctorRoute.indexOf("callBlockchain(req, '/addDoctor'"));
    assert.ok(patientRoute.indexOf("provisionFabricIdentity(req, 'patient'") < patientRoute.indexOf("callBlockchain(req, '/patient-metadata'"));
});

test('patient assignment validates clinic and updates both ledger relationship directions', () => {
    const api = read('backend/server.js');
    const chaincode = read('fabric-samples/dental-record-sharing/chaincode-javascript/lib/dentalRecordSharing.js');
    const assignment = api.match(/app\.post\('\/patients\/:id\/assign'[\s\S]*?\n\}\);/)[0];
    assert.match(assignment, /SELECT Blockchain_ID, Clinic_ID FROM Doctor/);
    assert.match(assignment, /Doctor and patient must belong to the same clinic/);
    assert.match(assignment, /callBlockchain\(req, '\/assignPatientToDoctor'/);
    assert.match(chaincode, /doctor\.patients\.push\(patientID\)/);
    assert.match(chaincode, /patient\.doctors\.push\(doctorID\)/);
    assert.match(chaincode, /patient\.dataHash = dataHash\.toLowerCase\(\)/);
    assert.match(assignment, /\/patient-metadata\/\$\{encodeURIComponent\(req\.params\.id\)\}/);
});
