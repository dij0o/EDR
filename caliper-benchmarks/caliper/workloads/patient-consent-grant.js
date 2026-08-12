'use strict';

const { WorkloadModuleBase } = require('@hyperledger/caliper-core');
const { required, loadFixtures, fixtureAt, request, timedSend } = require('./common');

class PatientConsentGrant extends WorkloadModuleBase {
    async initializeWorkloadModule(workerIndex, totalWorkers, roundIndex, args, sutAdapter) {
        this.workerIndex = workerIndex; this.args = args; this.sutAdapter = sutAdapter; this.txIndex = 0;
        this.fixtures = loadFixtures(args.workspaceRoot, args.fixturesFile);
        required(args.patientIdentity, 'patientIdentity');
    }
    async submitTransaction() {
        const item = fixtureAt(this.fixtures.pendingPatientConsents, this.workerIndex, this.txIndex++, 'pendingPatientConsents');
        const patientIdentity = item.patientIdentity || this.args.patientIdentity;
        return timedSend(this.sutAdapter, request('ProvideConsent', patientIdentity, [item.patientID, item.requestID]), this.args, { request_id: item.requestID, patient_identity: patientIdentity });
    }
}
module.exports.createWorkloadModule = () => new PatientConsentGrant();
