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
        createCompositeKey: sinon.stub().callsFake((type, attributes) => `${type}:${attributes.join(':')}`),
        getTxID: sinon.stub().returns('tx-1'),
        getTxTimestamp: sinon.stub().returns({ seconds: { toString: () => '1783872000' }, nanos: 0 }),
        getStateByRange: sinon.stub().resolves({ next: sinon.stub().resolves({ done: true }), close: sinon.stub().resolves() }),
        getStateByPartialCompositeKey: sinon.stub().resolves({ next: sinon.stub().resolves({ done: true }), close: sinon.stub().resolves() }),
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

    it('creates a cross-clinic access request without changing patient ownership', async () => {
        const ctx = context('doctor', 'Doctor1', 'Org1MSP', '1');
        const doctor = { doctorID: 'Doctor1', firstName: 'Alice', lastName: 'Wong', clinicID: 1, worksAt: 'Clinic 1' };
        const patient = { patientID: 'Patient1', clinicID: 2, clinicIDs: [2], doctors: ['Doctor2'], sharedWith: [] };
        ctx.stub.getState.callsFake(async (key) => {
            if (key === 'Doctor1') return Buffer.from(JSON.stringify(doctor));
            if (key === 'Patient1') return Buffer.from(JSON.stringify(patient));
            return Buffer.alloc(0);
        });
        const requestID = await contract.RequestDataAccess(ctx, 'Doctor1', 'Patient1', '2', 'Medical Records', 'Specialist review', '{}');
        expect(requestID).to.equal('tx-1');
        const requestWrite = ctx.stub.putState.getCalls().find((call) => call.args[0] === 'tx-1');
        const request = JSON.parse(requestWrite.args[1].toString());
        expect(request.status).to.equal('PENDING_ADMIN_APPROVAL');
        expect(request.workflowType).to.equal('REFERRAL');
        expect(request.dataOriginClinicID).to.equal(2);
        expect(request.requestingClinicID).to.equal(1);
        expect(patient.clinicID).to.equal(2);
    });

    it('reuses one active referral across record scopes for the same care relationship', async () => {
        const ctx = context('doctor', 'Doctor1', 'Org1MSP', '1');
        const doctor = { doctorID: 'Doctor1', firstName: 'Alice', lastName: 'Wong', clinicID: 1, worksAt: 'Clinic 1' };
        const patient = { patientID: 'Patient1', clinicID: 2, clinicIDs: [2], doctors: ['Doctor2'], sharedWith: [] };
        const existing = { requestID: 'request-existing', doctorID: 'Doctor1', patientID: 'Patient1', dataOriginClinicID: 2, dataType: 'Medical Records', status: 'PENDING_ADMIN_APPROVAL' };
        const indexValue = Buffer.from(existing.requestID);
        ctx.stub.getState.callsFake(async (key) => {
            if (key === 'Doctor1') return Buffer.from(JSON.stringify(doctor));
            if (key === 'Patient1') return Buffer.from(JSON.stringify(patient));
            if (key === 'request-existing') return Buffer.from(JSON.stringify(existing));
            if (key === 'ACTIVE_ACCESS_REQUEST:Doctor1:Patient1:2') return indexValue;
            return Buffer.alloc(0);
        });

        const requestID = await contract.RequestDataAccess(ctx, 'Doctor1', 'Patient1', '2', 'Dental Records', 'Specialist review', '{}');

        expect(requestID).to.equal('request-existing');
        expect(ctx.stub.putState.called).to.equal(false);
    });

    it('recognizes an active referral stored under the legacy scope-specific index', async () => {
        const ctx = context('doctor', 'Doctor1', 'Org1MSP', '1');
        const existing = { requestID: 'request-legacy', doctorID: 'Doctor1', patientID: 'Patient1', dataOriginClinicID: 2, dataType: 'Medical Records', status: 'PENDING_ADMIN_APPROVAL' };
        ctx.stub.getState.callsFake(async (key) => key === existing.requestID ? Buffer.from(JSON.stringify(existing)) : Buffer.alloc(0));
        ctx.stub.getStateByPartialCompositeKey.resolves({
            next: sinon.stub()
                .onFirstCall().resolves({ done: false, value: { value: Buffer.from(existing.requestID) } })
                .onSecondCall().resolves({ done: true }),
            close: sinon.stub().resolves(),
        });

        const result = JSON.parse(await contract.GetActiveDataAccessRequest(ctx, 'Doctor1', 'Patient1', '2', 'Dental Records'));

        expect(result.requestID).to.equal('request-legacy');
    });

    it('moves an authorized clinic request to the patient consent queue', async () => {
        const ctx = context('admin', 'Admin2', 'Org1MSP', '2');
        const request = { requestID: 'request-1', docType: 'accessRequest', workflowType: 'REFERRAL', doctorID: 'Doctor1', patientID: 'Patient1', dataOriginClinicID: '2', dataType: 'Medical Records', doctorName: 'Alice Wong', status: 'PENDING_ADMIN_APPROVAL' };
        ctx.stub.getState.callsFake(async (key) => key === request.requestID ? Buffer.from(JSON.stringify(request)) : Buffer.alloc(0));

        const result = await contract.ApproveRequest(ctx, 'Admin2', request.requestID, '2');

        expect(result.requestID).to.equal(request.requestID);
        expect(result.patientID).to.equal(request.patientID);
        expect(result.status).to.equal('PENDING_PATIENT_CONSENT');
        expect(result.adminApprovedAt).to.be.a('string');
        const requestWrite = ctx.stub.putState.getCalls().find((call) => call.args[0] === request.requestID);
        expect(JSON.parse(requestWrite.args[1].toString()).status).to.equal('PENDING_PATIENT_CONSENT');
        expect(result.notification.recipientActorID).to.equal(request.patientID);
        expect(result.notification.type).to.equal('ACCESS_REQUEST_PENDING_PATIENT');
    });

    it('grants scoped access without transferring the patient or replacing assigned doctors', async () => {
        const ctx = context('patient', 'Patient1', 'Org1MSP', '2');
        const request = { requestID: 'request-1', docType: 'accessRequest', workflowType: 'REFERRAL', doctorID: 'Doctor1', patientID: 'Patient1', dataType: 'Medical Records', status: 'PENDING_PATIENT_CONSENT' };
        const patient = { patientID: 'Patient1', clinicID: 2, clinicIDs: [2], doctors: ['Doctor2'], sharedWith: [] };
        ctx.stub.getState.callsFake(async (key) => Buffer.from(JSON.stringify(key === 'request-1' ? request : patient)));
        const result = await contract.ProvideConsent(ctx, 'Patient1', 'request-1');
        expect(result.status).to.equal('ACTIVE');
        expect(result.operationalOwnerChanged).to.equal(false);
        expect(patient.clinicID).to.equal(2);
        expect(patient.doctors).to.deep.equal(['Doctor2']);
        expect(ctx.stub.putState.getCalls().some((call) => call.args[0] === 'Patient1')).to.equal(false);
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
            contract.AddMedicalRecord(ctx, 'Record2', 'Patient2', 'mysql:Clinical_Record/Record2', 'a'.repeat(64), 'Doctor1', '2026-07-12T00:00:00Z'),
            'Doctor Doctor1 has no active referral for medical of patient Patient2'
        );
    });

    it('allows an assigned doctor to write a medical record', async () => {
        const ctx = context('doctor', 'Doctor1');
        ctx.stub.getState.callsFake(async key => key === 'Patient1' ? Buffer.from(JSON.stringify({
            patientID: 'Patient1', doctors: ['Doctor1'], sharedWith: [], medicalRecords: [],
        })) : Buffer.alloc(0));
        const result = JSON.parse(await contract.AddMedicalRecord(ctx, 'Record1', 'Patient1', 'mysql:Clinical_Record/Record1', 'a'.repeat(64), 'Doctor1', '2026-07-12T00:00:00Z'));
        expect(result.recordType).to.equal('medical');
        expect(result).not.to.have.property('payload');
        expect(ctx.stub.putState.calledWith('CLINICAL:Record1')).to.equal(true);
    });

    it('allows a patient certificate to read its own medical records', async () => {
        const ctx = context('patient', 'Patient1');
        const patient = { patientID: 'Patient1', clinicalRecordIDs: ['Record1'] };
        const metadata = { recordID: 'Record1', recordType: 'medical', patientID: 'Patient1', offChainRef: 'mysql:Clinical_Record/Record1', dataHash: 'a'.repeat(64) };
        ctx.stub.getState.callsFake(async key => Buffer.from(JSON.stringify(key === 'Patient1' ? patient : metadata)));
        const records = JSON.parse(await contract.GetMedicalRecords(ctx, 'Patient1'));
        expect(records).to.deep.equal([metadata]);
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

    it('stores only radiographic metadata and SHA-256 for an assigned doctor', async () => {
        const ctx = context('doctor', 'Doctor1');
        ctx.stub.getState.callsFake(async key => key === 'Patient1'
            ? Buffer.from(JSON.stringify({ patientID: 'Patient1', doctors: ['Doctor1'], sharedWith: [] }))
            : Buffer.alloc(0));
        const result = JSON.parse(await contract.AddDentalFileMetadata(
            ctx, 'file-1', 'Patient1', 'filesystem:file-1', 'scan.dcm', 'application/dicom', '12', 'a'.repeat(64), 'Doctor1', '2026-07-12T00:00:00Z'
        ));
        expect(result.sha256).to.equal('a'.repeat(64));
        expect(result).not.to.have.property('content');
        expect(ctx.stub.putState.calledWith('RADFILE:file-1')).to.equal(true);
    });

    it('rejects radiographic metadata upload by an unauthorized doctor', async () => {
        const ctx = context('doctor', 'Doctor2');
        ctx.stub.getState.resolves(Buffer.from(JSON.stringify({ patientID: 'Patient1', doctors: ['Doctor1'], sharedWith: [] })));
        await expectReject(contract.AddDentalFileMetadata(
            ctx, 'file-2', 'Patient1', 'filesystem:file-2', 'scan.dcm', 'application/dicom', '12', 'b'.repeat(64), 'Doctor2', '2026-07-12T00:00:00Z'
        ), 'Doctor Doctor2 has no active referral for dicom of patient Patient1');
    });

    it('closes an active referral and records the completion summary', async () => {
        const ctx = context('doctor', 'Doctor1');
        const request = { requestID:'request-1', docType:'accessRequest', workflowType:'REFERRAL', doctorID:'Doctor1', patientID:'Patient1', dataOriginClinicID:2, status:'ACTIVE' };
        ctx.stub.getState.callsFake(async key => key === 'request-1' ? Buffer.from(JSON.stringify(request)) : Buffer.alloc(0));
        const result = await contract.CompleteReferral(ctx, 'Doctor1', 'request-1', 'Specialist treatment completed; return to referring doctor.');
        expect(result.status).to.equal('COMPLETED');
        expect(result.accessClosed).to.equal(true);
        const write = ctx.stub.putState.getCalls().find(call => call.args[0] === 'request-1');
        expect(JSON.parse(write.args[1].toString()).completionSummary).to.include('Specialist treatment completed');
    });

    it('returns only the record categories approved by an active referral', async () => {
        const ctx = context('doctor', 'Doctor1');
        const patient = { patientID:'Patient1', doctors:['Doctor2'], medicalRecords:[{ id:'m1' }], dentalChart:[{ id:'d1' }] };
        const referral = { requestID:'request-1', docType:'accessRequest', workflowType:'REFERRAL', doctorID:'Doctor1', patientID:'Patient1', status:'ACTIVE', requestedRecordTypes:['Medical Records'], expiresAt:'2027-01-01T00:00:00.000Z' };
        ctx.stub.getState.callsFake(async key => key === 'Patient1' ? Buffer.from(JSON.stringify(patient)) : Buffer.alloc(0));
        let yielded = false;
        ctx.stub.getStateByRange.resolves({ next: sinon.stub().callsFake(async () => yielded ? { done:true } : (yielded = true, { done:false, value:{ value:Buffer.from(JSON.stringify(referral)) } })), close: sinon.stub().resolves() });
        const result = JSON.parse(await contract.GetPatientData(ctx, 'Doctor1', 'Patient1'));
        expect(result.medicalRecords).to.deep.equal([{ id:'m1' }]);
        expect(result).not.to.have.property('dentalChart');
        expect(result.referralID).to.equal('request-1');
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
