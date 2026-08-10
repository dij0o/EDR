const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const serverSource = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
const uiSource = fs.readFileSync(path.join(__dirname, '..', '..', 'bc-dentistry-frontend', 'src', 'assets', 'components', 'Patient', 'ClinicalRecords.jsx'), 'utf8');

test('FTC-REC-010 recomputes the off-chain payload hash and compares database and ledger hashes', () => {
    assert.match(serverSource, /app\.get\('\/clinical-records\/:recordID\/verify-integrity'/);
    assert.match(serverSource, /const currentHash = clinicalHash\(payload\);/);
    assert.match(serverSource, /currentHash === storedHash && currentHash === onChainHash/);
    assert.match(serverSource, /status: matches \? 'verified' : 'mismatch'/);
});

test('FTC-REC-010 keeps the record visible and reports verification failures in the UI', () => {
    assert.match(serverSource, /the record remains visible for investigation/);
    assert.match(uiSource, /Verify integrity/);
    assert.match(uiSource, /The record remains visible\./);
    assert.match(uiSource, /role="status"/);
});
