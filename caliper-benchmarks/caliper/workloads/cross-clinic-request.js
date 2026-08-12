'use strict';

const { WorkloadModuleBase } = require('@hyperledger/caliper-core');
const { required, loadFixtures, fixtureAt, request, timedSend } = require('./common');

class CrossClinicRequest extends WorkloadModuleBase {
    async initializeWorkloadModule(workerIndex, totalWorkers, roundIndex, args, sutAdapter) {
        this.workerIndex = workerIndex; this.args = args; this.sutAdapter = sutAdapter; this.txIndex = 0;
        this.fixtures = loadFixtures(args.workspaceRoot, args.fixturesFile);
        required(args.doctorIdentity, 'doctorIdentity');
    }
    async submitTransaction() {
        const item = fixtureAt(this.fixtures.crossClinicRequests, this.workerIndex, this.txIndex++, 'crossClinicRequests');
        return timedSend(this.sutAdapter, request('RequestDataAccess', this.args.doctorIdentity, [
            item.doctorID, item.patientID, item.dataOriginClinicID,
            item.dataType || 'Dental and Medical Records', item.purpose || 'benchmark evaluation',
            JSON.stringify({ benchmark: true, requestedRecordTypes: item.requestedRecordTypes || ['dental', 'medical'] })
        ]), this.args, { fixture_patient_id: item.patientID });
    }
}
module.exports.createWorkloadModule = () => new CrossClinicRequest();
