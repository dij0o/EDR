'use strict';

const { WorkloadModuleBase } = require('@hyperledger/caliper-core');
const { required, loadFixtures, fixtureAt, deterministicHex, request, timedSend } = require('./common');

class DentalRecordEntry extends WorkloadModuleBase {
    async initializeWorkloadModule(workerIndex, totalWorkers, roundIndex, args, sutAdapter) {
        this.workerIndex = workerIndex; this.roundIndex = roundIndex; this.args = args;
        this.sutAdapter = sutAdapter; this.txIndex = 0;
        this.fixtures = loadFixtures(args.workspaceRoot, args.fixturesFile);
        required(args.doctorIdentity, 'doctorIdentity');
    }
    async submitTransaction() {
        const index = this.txIndex++;
        const item = fixtureAt(this.fixtures.dentalRecordPatients, this.workerIndex, index, 'dentalRecordPatients');
        const digest = deterministicHex(this.args.runId || 'edr-benchmark', 'dental', this.roundIndex, this.workerIndex, index);
        return timedSend(this.sutAdapter, request('AddDentalChartEntry', this.args.doctorIdentity, [
            `BENCH-DENTAL-${digest.slice(0, 20)}`, item.patientID,
            `benchmark://dental/${digest.slice(0, 24)}`, digest, item.doctorID, new Date(0).toISOString()
        ]), this.args, { fixture_patient_id: item.patientID });
    }
}
module.exports.createWorkloadModule = () => new DentalRecordEntry();
