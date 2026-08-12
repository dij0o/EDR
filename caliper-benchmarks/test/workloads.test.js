'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { deterministicHex, request, fixtureAt } = require('../caliper/workloads/common');

const root = path.resolve(__dirname, '..');

test('six canonical BDF workload modules are present', () => {
    const names = ['patient-registration', 'dental-record-entry', 'radiograph-upload', 'cross-clinic-request', 'patient-consent-grant', 'record-retrieval'];
    for (const name of names) assert.ok(fs.existsSync(path.join(root, 'caliper', 'workloads', `${name}.js`)), name);
});

test('request builder preserves Fabric read/write intent and stringifies arguments', () => {
    assert.deepEqual(request('ProvideConsent', 'BenchPatient', ['P1', 2]), {
        contractId: 'basic', contractFunction: 'ProvideConsent', invokerIdentity: 'BenchPatient', contractArguments: ['P1', '2'], readOnly: false
    });
    assert.equal(request('ReadPatient', 'BenchAdminOrigin', ['P1'], true).readOnly, true);
});

test('deterministic IDs are reproducible and fixture selection is bounded', () => {
    assert.equal(deterministicHex('a', 'b'), deterministicHex('a', 'b'));
    assert.equal(deterministicHex('a', 'b').length, 64);
    assert.equal(fixtureAt([{ id: 1 }, { id: 2 }], 1, 2, 'x').id, 2);
    assert.throws(() => fixtureAt([], 0, 0, 'empty'), /empty/);
});

test('benchmark matrix excludes superseded 1 to 200 legacy read add delete rounds', () => {
    const matrix = require('../caliper/benchmark-matrix.json');
    for (const scenario of matrix.extended) assert.deepEqual(scenario.loads, [300, 500]);
    assert.deepEqual(matrix.defaults, { tps: 10, rounds: 3, workers: 1 });
});

test('generated matrix contains every isolated run required by the plan', () => {
    const matrix = require('../caliper/benchmark-matrix.json');
    const count = (items, scale = false) => items.reduce((total, item) => total + item.loads.length * matrix.defaults.rounds * (scale ? item.orgCounts.length : 1), 0);
    assert.equal(count(matrix.extended), 18);
    assert.equal(count(matrix.consent), 30);
    assert.equal(count(matrix.scalability, true), 54);
});

test('synthetic actor IDs satisfy the enforced role prefixes', () => {
    const identities = fs.readFileSync(path.join(root, 'caliper', 'IDENTITY_REQUIREMENTS.md'), 'utf8');
    assert.match(identities, /actorID=Doctor-BENCH-001/);
    assert.match(identities, /actorID=Patient-BENCH-001/);
    assert.match(identities, /actorID=AdminClinic2/);
    assert.doesNotMatch(identities, /actorID=BENCH-(DOCTOR|PATIENT|ADMIN)/);
});
