'use strict';

const { WorkloadModuleBase } = require('@hyperledger/caliper-core');
const { required, loadFixtures, fixtureAt, deterministicHex, request, timedSend } = require('./common');

class MixedClinic extends WorkloadModuleBase {
    async initializeWorkloadModule(workerIndex, totalWorkers, roundIndex, args, sutAdapter) {
        this.workerIndex = workerIndex; this.roundIndex = roundIndex; this.args = args;
        this.sutAdapter = sutAdapter; this.txIndex = 0; this.fixtures = loadFixtures(args.workspaceRoot, args.fixturesFile);
        ['doctorIdentity', 'patientIdentity'].forEach((name) => required(args[name], name));
    }
    async submitTransaction() {
        const index = this.txIndex++;
        const slot = index % 10;
        if (slot < 7) {
            const item = fixtureAt(this.fixtures.recordRetrievalPatients, this.workerIndex, index, 'recordRetrievalPatients');
            return timedSend(this.sutAdapter, request('GetAllDentalChartData', this.args.doctorIdentity, [item.patientID], true), this.args, { mix_type: 'read' });
        }
        if (slot < 9) {
            const item = fixtureAt(this.fixtures.dentalRecordPatients, this.workerIndex, index, 'dentalRecordPatients');
            const digest = deterministicHex(this.args.runId || 'edr-benchmark', 'mixed', this.roundIndex, this.workerIndex, index);
            return timedSend(this.sutAdapter, request('AddDentalChartEntry', this.args.doctorIdentity, [
                `BENCH-MIX-${digest.slice(0, 20)}`, item.patientID, `benchmark://mixed/${digest.slice(0, 24)}`,
                digest, item.doctorID, new Date(0).toISOString()
            ]), this.args, { mix_type: 'write' });
        }
        const consent = fixtureAt(this.fixtures.pendingPatientConsents, this.workerIndex, Math.floor(index / 10), 'pendingPatientConsents');
        return timedSend(this.sutAdapter, request('ProvideConsent', this.args.patientIdentity, [consent.patientID, consent.requestID]), this.args, { mix_type: 'consent' });
    }
}
module.exports.createWorkloadModule = () => new MixedClinic();
