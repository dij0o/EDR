'use strict';

const { expect } = require('chai');
const sinon = require('sinon');
const DentalRecordSharing = require('../lib/dentalRecordSharing');

const identity = (role, actorID = `${role}1`, mspID = 'Org1MSP', clinicID = null) => ({
    getMSPID: sinon.stub().returns(mspID),
    getAttributeValue: sinon.stub().callsFake((name) => ({ role, actorID, clinicID }[name])),
});

const context = (role, actorID, mspID = 'Org1MSP', clinicID = null) => ({
    clientIdentity: identity(role, actorID, mspID, clinicID),
    stub: {
        getState: sinon.stub().resolves(Buffer.alloc(0)),
        putState: sinon.stub().resolves(),
        deleteState: sinon.stub().resolves(),
        getTxID: sinon.stub().returns('tx-1'),
    },
});

const expectReject = async (promise, message) => {
    try {
        await promise;
        expect.fail('Expected transaction to be rejected');
    } catch (error) {
        expect(error.message).to.include(message);
    }
};

describe('Phase 2 chaincode identity enforcement', () => {
    let contract;

    beforeEach(() => {
        contract = new DentalRecordSharing();
    });

    it('allows an admin certificate to add a doctor', async () => {
        const ctx = context('admin', 'Admin1', 'Org1MSP', '1');
        const result = await contract.addDoctor(
            ctx, 'Doctor9', 'Ada', 'Lovelace', 'EID9', 'Dentist', 'Clinic A', '1',
            'ada@example.com', '0500000000', '2026-07-10', '[]'
        );
        expect(JSON.parse(result).doctorID).to.equal('Doctor9');
    });

    it('rejects a doctor certificate on an admin patient-management path', async () => {
        const ctx = context('doctor', 'Doctor1');
        await expectReject(contract.addPatient(
            ctx, 'Patient9', 'Pat', 'Nine', '1990-01-01', 'Other', 'EID-P9',
            'pat9@example.com', '0500000001', 'Dubai', '2026-07-10', '1', '[]'
        ), 'Access denied: requires admin role.');
    });

    it('rejects an admin certificate for another clinic', async () => {
        const ctx = context('admin', 'Admin1', 'Org1MSP', '1');
        await expectReject(contract.addDoctor(
            ctx, 'Doctor9', 'Ada', 'Lovelace', 'EID9', 'Dentist', 'Clinic B', '2',
            'ada@example.com', '0500000000', '2026-07-11', '[]'
        ), 'admin certificate is not authorized for clinic 2');
    });

    it('rejects an admin reading another clinic request queue', async () => {
        const ctx = context('admin', 'Admin1', 'Org1MSP', '1');
        await expectReject(
            contract.GetRequestsForAdmin(ctx, '2'),
            'admin certificate is not authorized for clinic 2'
        );
    });

    it('rejects a doctor enumerating all patients', async () => {
        const ctx = context('doctor', 'Doctor1');
        await expectReject(
            contract.GetAllPatients(ctx),
            'Access denied: requires admin or system role'
        );
    });

    it('rejects non-system ledger initialization', async () => {
        const ctx = context('admin', 'Admin1', 'Org1MSP', '1');
        await expectReject(contract.InitLedger(ctx), 'requires system role');
    });

    it('rejects a doctor calling the public actor-existence helper', async () => {
        const ctx = context('doctor', 'Doctor1');
        await expectReject(contract.actorExists(ctx, 'Patient1'), 'requires admin or system role');
    });

    it('rejects a doctor certificate that requests data as another doctor', async () => {
        const ctx = context('doctor', 'Doctor1');
        await expectReject(
            contract.RequestDataAccess(ctx, 'Doctor2', 'Patient1', '1'),
            'certificate actorID does not match Doctor2'
        );
    });

    it('rejects a patient certificate that reads another patient request queue', async () => {
        const ctx = context('patient', 'Patient1');
        await expectReject(
            contract.GetAllRequestsForPatient(ctx, 'Patient2'),
            'certificate actorID does not match Patient2'
        );
    });

    it('rejects a patient certificate on a system audit-log path', async () => {
        const ctx = context('patient', 'Patient1');
        await expectReject(
            contract.LogAccess(ctx, 'Doctor1', 'Patient1'),
            'Access denied: requires system role.'
        );
    });

    it('rejects a doctor writing records for an unassigned patient', async () => {
        const ctx = context('doctor', 'Doctor1');
        ctx.stub.getState.resolves(Buffer.from(JSON.stringify({
            patientID: 'Patient2', doctors: ['Doctor2'], sharedWith: [], medicalRecords: [],
        })));
        await expectReject(
            contract.AddMedicalRecord(ctx, 'Patient2', '{"diagnosis":"test"}'),
            'Doctor Doctor1 is not assigned or consented for patient Patient2'
        );
    });

    it('allows an assigned doctor to write a medical record', async () => {
        const ctx = context('doctor', 'Doctor1');
        ctx.stub.getState.resolves(Buffer.from(JSON.stringify({
            patientID: 'Patient1', doctors: ['Doctor1'], sharedWith: [], medicalRecords: [],
        })));
        const result = await contract.AddMedicalRecord(ctx, 'Patient1', '{"diagnosis":"test"}');
        expect(JSON.parse(result).medicalRecords).to.deep.equal(['{"diagnosis":"test"}']);
        expect(ctx.stub.putState.calledOnce).to.equal(true);
    });

    it('allows a patient certificate to read its own medical records', async () => {
        const ctx = context('patient', 'Patient1');
        ctx.stub.getState.resolves(Buffer.from(JSON.stringify({
            patientID: 'Patient1', medicalRecords: [{ diagnosis: 'test' }],
        })));
        const records = await contract.GetMedicalRecords(ctx, 'Patient1');
        expect(records).to.deep.equal([{ diagnosis: 'test' }]);
    });

    it('rejects a patient certificate reading another patient medical records', async () => {
        const ctx = context('patient', 'Patient1');
        ctx.stub.getState.resolves(Buffer.from(JSON.stringify({
            patientID: 'Patient2', medicalRecords: [],
        })));
        await expectReject(
            contract.GetMedicalRecords(ctx, 'Patient2'),
            'patient certificate does not own Patient2'
        );
    });

    it('rejects an identity that is not associated with an MSP', async () => {
        const ctx = context('admin', 'Admin1');
        ctx.clientIdentity.getMSPID.returns('');
        await expectReject(contract.DeletePatient(ctx, 'Patient1'), 'not associated with an MSP');
    });

    it('rejects a certificate from an untrusted MSP', async () => {
        const ctx = context('admin', 'Admin1', 'UnknownMSP');
        await expectReject(contract.DeletePatient(ctx, 'Patient1'), 'MSP UnknownMSP is not authorized');
    });
});
