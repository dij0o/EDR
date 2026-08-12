'use strict';

const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const failures = [];
for (const relative of ['caliper/benchmark-matrix.json', 'caliper/fixtures/benchmark-fixtures.json', 'networks/fabric/test-network.yaml']) {
    if (!fs.existsSync(path.join(root, relative))) failures.push(`Missing ${relative}`);
}
let fixtures;
try { fixtures = JSON.parse(fs.readFileSync(path.join(root, 'caliper/fixtures/benchmark-fixtures.json'), 'utf8')); }
catch (error) { failures.push(`Fixture manifest is not readable JSON: ${error.message}`); }
if (fixtures) {
    const placeholder = /REPLACE-WITH|BENCH-(READ|DELETE|CROSS)-001/;
    for (const [pool, items] of Object.entries(fixtures)) {
        if (pool === 'metadata') continue;
        if (!Array.isArray(items) || items.length === 0) failures.push(`Fixture pool ${pool} is empty`);
        if (JSON.stringify(items).match(placeholder)) failures.push(`Fixture pool ${pool} still contains example placeholders`);
    }
    for (const [pool, count] of Object.entries({ patientsForDeletion: 500, crossClinicRequests: 200, pendingAdminApprovals: 200, pendingPatientConsents: 200 })) {
        if (Array.isArray(fixtures[pool]) && fixtures[pool].length < count) failures.push(`${pool} needs at least ${count} entries for the largest isolated run`);
    }
}
const networkPath = path.join(root, 'networks/fabric/test-network.yaml');
if (fs.existsSync(networkPath)) {
    const network = fs.readFileSync(networkPath, 'utf8');
    for (const identity of ['BenchAdminOrigin', 'BenchDoctor', 'BenchPatient']) if (!network.includes(`name: ${identity}`)) failures.push(`Network profile does not expose identity ${identity}`);
    if (/GENERATED_PRIVATE_KEY/.test(network)) failures.push('Network profile still contains GENERATED_PRIVATE_KEY');
}
if (failures.length) {
    console.error('BENCHMARK_PREFLIGHT_FAILED'); failures.forEach((failure) => console.error(`- ${failure}`)); process.exit(1);
}
console.log('BENCHMARK_PREFLIGHT_OK');
