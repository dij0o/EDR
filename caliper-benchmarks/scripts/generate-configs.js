'use strict';

const fs = require('node:fs');
const path = require('node:path');
const matrix = require('../caliper/benchmark-matrix.json');

const root = path.resolve(__dirname, '..');
const outDir = path.join(root, 'caliper', 'config', 'generated');
fs.mkdirSync(outDir, { recursive: true });

function argumentsFor(runId) {
    return [
        '          workspaceRoot: .',
        '          fixturesFile: caliper/fixtures/benchmark-fixtures.json',
        `          runId: ${runId}`,
        '          rawLatencyFile: benchmark-output/current/raw-latency.jsonl',
        '          adminIdentity: BenchAdminOrigin',
        '          adminID: BENCH-ADMIN-ORIGIN',
        '          adminClinicID: "2"',
        '          clinicID: "2"',
        '          doctorIdentity: BenchDoctor',
        '          patientIdentity: BenchPatient',
        '          invokerIdentity: BenchAdminOrigin',
        '          doctorIDs: [BENCH-DOCTOR-ASSIGNED]'
    ].join('\n');
}

function writeConfig(group, item, load, round, orgCount) {
    const suffix = orgCount ? `-org${orgCount}` : '';
    const runId = `${item.scenarioID.toLowerCase()}-${load}-r${round}${suffix}`;
    const filename = `${runId}.yaml`;
    const yaml = `# Generated from caliper/benchmark-matrix.json. Do not edit by hand.\n` +
`test:\n  name: ${runId}\n  description: ${item.operation}, ${load} transactions, round ${round}${orgCount ? `, ${orgCount} organizations` : ''}\n` +
`  workers:\n    type: local\n    number: ${matrix.defaults.workers}\n  rounds:\n    - label: ${runId}\n      txNumber: ${load}\n` +
`      rateControl:\n        type: fixed-rate\n        opts:\n          tps: ${matrix.defaults.tps}\n      workload:\n` +
`        module: caliper/workloads/${item.module}\n        arguments:\n${argumentsFor(runId)}\n` +
`monitors:\n  resource:\n    - module: docker\n      options:\n        interval: 1\n        containers: [all]\n`;
    fs.writeFileSync(path.join(outDir, filename), yaml);
    return { group, scenarioID: item.scenarioID, operation: item.operation, txLoad: load, round, orgCount: orgCount || null, config: `caliper/config/generated/${filename}` };
}

const manifest = [];
for (const group of ['extended', 'consent']) {
    for (const item of matrix[group]) for (const load of item.loads) for (let round = 1; round <= matrix.defaults.rounds; round++) manifest.push(writeConfig(group, item, load, round));
}
for (const item of matrix.scalability) for (const orgCount of item.orgCounts) for (const load of item.loads) for (let round = 1; round <= matrix.defaults.rounds; round++) manifest.push(writeConfig('scalability', item, load, round, orgCount));
fs.writeFileSync(path.join(outDir, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
console.log(`Generated ${manifest.length} isolated benchmark configurations in ${path.relative(root, outDir)}`);
