'use strict';

const { WorkloadModuleBase } = require('@hyperledger/caliper-core');
const { required, loadFixtures, fixtureAt, request, timedSend } = require('./common');

class RecordRetrieval extends WorkloadModuleBase {
    async initializeWorkloadModule(workerIndex, totalWorkers, roundIndex, args, sutAdapter) {
        this.workerIndex = workerIndex; this.args = args; this.sutAdapter = sutAdapter; this.txIndex = 0;
        this.fixtures = loadFixtures(args.workspaceRoot, args.fixturesFile);
        required(args.doctorIdentity, 'doctorIdentity');
    }
    async submitTransaction() {
        const item = fixtureAt(this.fixtures.recordRetrievalPatients, this.workerIndex, this.txIndex++, 'recordRetrievalPatients');
        return timedSend(this.sutAdapter, request('GetAllDentalChartData', this.args.doctorIdentity, [item.patientID], true), this.args, { fixture_patient_id: item.patientID });
    }
}
module.exports.createWorkloadModule = () => new RecordRetrieval();
