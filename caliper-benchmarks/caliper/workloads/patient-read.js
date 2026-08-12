'use strict';

const { WorkloadModuleBase } = require('@hyperledger/caliper-core');
const { required, loadFixtures, fixtureAt, request, timedSend } = require('./common');

class PatientRead extends WorkloadModuleBase {
    async initializeWorkloadModule(workerIndex, totalWorkers, roundIndex, args, sutAdapter) {
        this.workerIndex = workerIndex; this.args = args; this.sutAdapter = sutAdapter; this.txIndex = 0;
        this.fixtures = loadFixtures(args.workspaceRoot, args.fixturesFile);
        required(args.invokerIdentity, 'invokerIdentity');
    }
    async submitTransaction() {
        const item = fixtureAt(this.fixtures.patientReads, this.workerIndex, this.txIndex++, 'patientReads');
        return timedSend(this.sutAdapter, request('ReadPatient', this.args.invokerIdentity, [item.patientID], true), this.args, { fixture_patient_id: item.patientID });
    }
}
module.exports.createWorkloadModule = () => new PatientRead();
