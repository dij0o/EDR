'use strict';

const { WorkloadModuleBase } = require('@hyperledger/caliper-core');
const { required, deterministicHex, request, timedSend } = require('./common');

class PatientRegistration extends WorkloadModuleBase {
    async initializeWorkloadModule(workerIndex, totalWorkers, roundIndex, args, sutAdapter) {
        this.workerIndex = workerIndex;
        this.roundIndex = roundIndex;
        this.args = args;
        this.sutAdapter = sutAdapter;
        this.txIndex = 0;
        required(args.adminIdentity, 'adminIdentity');
        required(args.clinicID, 'clinicID');
    }

    async submitTransaction() {
        const sequence = `${this.roundIndex}-${this.workerIndex}-${this.txIndex++}`;
        const digest = deterministicHex(this.args.runId || 'edr-benchmark', sequence);
        const patientID = `BENCH-PAT-${digest.slice(0, 20)}`;
        return timedSend(this.sutAdapter, request('addPatient', this.args.adminIdentity, [
            patientID, 'Benchmark', `Patient-${digest.slice(0, 8)}`, '1990-01-01', 'Other',
            `BENCH-${digest.slice(0, 15)}`, `${digest.slice(0, 12)}@example.invalid`,
            `050${parseInt(digest.slice(0, 8), 16).toString().slice(0, 7).padStart(7, '0')}`,
            'Synthetic benchmark address', new Date(0).toISOString(), this.args.clinicID,
            JSON.stringify(this.args.doctorIDs || [])
        ]), this.args, { sequence });
    }
}

module.exports.createWorkloadModule = () => new PatientRegistration();
