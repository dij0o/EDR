'use strict';

const { WorkloadModuleBase } = require('@hyperledger/caliper-core');
const { required, loadFixtures, fixtureAt, request, timedSend } = require('./common');

class PatientDelete extends WorkloadModuleBase {
    async initializeWorkloadModule(workerIndex, totalWorkers, roundIndex, args, sutAdapter) {
        this.workerIndex = workerIndex; this.args = args; this.sutAdapter = sutAdapter; this.txIndex = 0;
        this.fixtures = loadFixtures(args.workspaceRoot, args.fixturesFile);
        required(args.adminIdentity, 'adminIdentity');
    }
    async submitTransaction() {
        const item = fixtureAt(this.fixtures.patientsForDeletion, this.workerIndex, this.txIndex++, 'patientsForDeletion');
        return timedSend(this.sutAdapter, request('DeletePatient', this.args.adminIdentity, [item.patientID]), this.args, { fixture_patient_id: item.patientID });
    }
}
module.exports.createWorkloadModule = () => new PatientDelete();
