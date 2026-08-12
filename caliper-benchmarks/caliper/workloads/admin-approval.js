'use strict';

const { WorkloadModuleBase } = require('@hyperledger/caliper-core');
const { required, loadFixtures, fixtureAt, request, timedSend } = require('./common');

class AdminApproval extends WorkloadModuleBase {
    async initializeWorkloadModule(workerIndex, totalWorkers, roundIndex, args, sutAdapter) {
        this.workerIndex = workerIndex; this.args = args; this.sutAdapter = sutAdapter; this.txIndex = 0;
        this.fixtures = loadFixtures(args.workspaceRoot, args.fixturesFile);
        required(args.adminIdentity, 'adminIdentity'); required(args.adminID, 'adminID'); required(args.adminClinicID, 'adminClinicID');
    }
    async submitTransaction() {
        const item = fixtureAt(this.fixtures.pendingAdminApprovals, this.workerIndex, this.txIndex++, 'pendingAdminApprovals');
        return timedSend(this.sutAdapter, request('ApproveRequest', this.args.adminIdentity, [
            this.args.adminID, item.requestID, this.args.adminClinicID
        ]), this.args, { request_id: item.requestID });
    }
}
module.exports.createWorkloadModule = () => new AdminApproval();
