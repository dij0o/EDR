'use strict';

require('dotenv').config();
const mysql = require('mysql2/promise');
const { Gateway, Wallets } = require('fabric-network');
const path = require('path');
const { enrollIdentity } = require('./fabricEnrollment');

const main = async () => {
    const connection = await mysql.createConnection({
        host: process.env.DB_HOST || '127.0.0.1',
        port: Number(process.env.DB_PORT || 3306),
        user: process.env.DB_USER || 'root',
        password: process.env.DB_PASSWORD || '',
        database: process.env.DB_NAME || 'mydatabase',
    });
    const ccpPath = path.resolve(__dirname, process.env.FABRIC_CONNECTION_PROFILE || './connection/connection-org1.json');
    const walletPath = path.resolve(__dirname, process.env.FABRIC_WALLET_PATH || './wallet');
    try {
        const [doctors] = await connection.execute(
            'SELECT ID AS databaseID, Blockchain_ID AS actorID, Clinic_ID AS clinicID FROM Doctor WHERE Blockchain_ID IS NOT NULL',
        );
        const [patients] = await connection.execute(
            'SELECT Blockchain_ID AS actorID, Clinic_ID AS clinicID, Doctors AS doctors FROM Patient WHERE Blockchain_ID IS NOT NULL',
        );
        const unscoped = [
            ...doctors.filter((row) => row.clinicID === null || row.clinicID === undefined),
            ...patients.filter((row) => row.clinicID === null || row.clinicID === undefined),
        ];
        if (unscoped.length) {
            throw new Error(`Refusing Fabric reconciliation for ${unscoped.length} actor(s) without a clinic assignment`);
        }
        let created = 0;
        for (const identity of [
            ...doctors.map((row) => ({ ...row, role: 'doctor' })),
            ...patients.map((row) => ({ ...row, role: 'patient' })),
        ]) {
            const result = await enrollIdentity({ ccpPath, walletPath, ...identity });
            if (result.created) created += 1;
        }
        console.log(`Fabric identity reconciliation complete: ${created} created, ${doctors.length + patients.length - created} already present`);

        const wallet = await Wallets.newFileSystemWallet(walletPath);
        const ccp = require(ccpPath);
        const doctorBlockchainIDByDatabaseID = new Map(
            doctors.map((doctor) => [String(doctor.databaseID), String(doctor.actorID)]),
        );
        const knownDoctorBlockchainIDs = new Set(doctors.map((doctor) => String(doctor.actorID)));
        const assignmentsByClinic = new Map();
        const desiredDoctorsByPatient = new Map();
        const desiredPatientsByDoctor = new Map(doctors.map((doctor) => [String(doctor.actorID), []]));
        const skippedAssignments = [];
        for (const patient of patients) {
            const assignedDoctors = typeof patient.doctors === 'string'
                ? JSON.parse(patient.doctors || '[]')
                : (patient.doctors || []);
            if (!assignmentsByClinic.has(String(patient.clinicID))) assignmentsByClinic.set(String(patient.clinicID), []);
            for (const doctorID of assignedDoctors) {
                const normalizedDoctorID = knownDoctorBlockchainIDs.has(String(doctorID))
                    ? String(doctorID)
                    : doctorBlockchainIDByDatabaseID.get(String(doctorID));
                if (!normalizedDoctorID) {
                    skippedAssignments.push({ patientID: String(patient.actorID), doctorID: String(doctorID) });
                    continue;
                }
                assignmentsByClinic.get(String(patient.clinicID)).push({
                    patientID: patient.actorID,
                    doctorID: normalizedDoctorID,
                });
                if (!desiredDoctorsByPatient.has(String(patient.actorID))) {
                    desiredDoctorsByPatient.set(String(patient.actorID), []);
                }
                desiredDoctorsByPatient.get(String(patient.actorID)).push(normalizedDoctorID);
                desiredPatientsByDoctor.get(normalizedDoctorID).push(String(patient.actorID));
            }
            if (!desiredDoctorsByPatient.has(String(patient.actorID))) {
                desiredDoctorsByPatient.set(String(patient.actorID), []);
            }
        }

        let assignments = 0;
        const failedAssignments = [];
        for (const [clinicID, clinicAssignments] of assignmentsByClinic) {
            if (!clinicAssignments.length) continue;
            const gateway = new Gateway();
            try {
                await gateway.connect(ccp, {
                    wallet,
                    identity: `admin-${clinicID}`,
                    discovery: {
                        enabled: process.env.FABRIC_DISCOVERY_ENABLED !== 'false',
                        asLocalhost: process.env.FABRIC_DISCOVERY_AS_LOCALHOST !== 'false',
                    },
                });
                const network = await gateway.getNetwork(process.env.FABRIC_CHANNEL || 'mychannel');
                const contract = network.getContract(process.env.FABRIC_CHAINCODE || 'basic');
                for (const assignment of clinicAssignments) {
                    try {
                        await contract.submitTransaction(
                            'assignPatientToDoctor',
                            String(assignment.patientID),
                            String(assignment.doctorID),
                            '',
                            '',
                        );
                        assignments += 1;
                    } catch (error) {
                        failedAssignments.push({
                            ...assignment,
                            reason: String(error.message || error).split('\n')[0],
                        });
                    }
                }
                for (const patient of patients.filter((row) => String(row.clinicID) === String(clinicID))) {
                    try {
                        const current = JSON.parse((await contract.evaluateTransaction('ReadPatient', String(patient.actorID))).toString());
                        await contract.submitTransaction(
                            'UpdatePatientMetadata',
                            String(patient.actorID),
                            String(clinicID),
                            String(current.offChainRef || `mysql:Patient/${patient.actorID}`),
                            String(current.dataHash),
                            JSON.stringify(desiredDoctorsByPatient.get(String(patient.actorID)) || []),
                            new Date().toISOString(),
                        );
                    } catch (error) {
                        failedAssignments.push({
                            patientID: String(patient.actorID),
                            doctorID: 'metadata-sync',
                            reason: String(error.message || error).split('\n')[0],
                        });
                    }
                }
                for (const doctor of doctors.filter((row) => String(row.clinicID) === String(clinicID))) {
                    try {
                        const current = JSON.parse((await contract.evaluateTransaction('ReadDoctor', String(doctor.actorID))).toString());
                        await contract.submitTransaction(
                            'UpdateDoctorInfo',
                            String(doctor.actorID),
                            String(current.firstName || ''),
                            String(current.lastName || ''),
                            String(current.emiratesID || ''),
                            String(current.speciality || ''),
                            String(current.worksAt || ''),
                            String(clinicID),
                            String(current.email || ''),
                            String(current.contactNumber || ''),
                            String(current.licenseNumber || ''),
                            String(current.createdDate || new Date().toISOString()),
                            JSON.stringify(desiredPatientsByDoctor.get(String(doctor.actorID)) || []),
                        );
                    } catch (error) {
                        failedAssignments.push({
                            patientID: 'doctor-metadata-sync',
                            doctorID: String(doctor.actorID),
                            reason: String(error.message || error).split('\n')[0],
                        });
                    }
                }
            } finally {
                gateway.disconnect();
            }
        }
        if (skippedAssignments.length) {
            throw new Error(`Fabric assignment reconciliation skipped ${skippedAssignments.length} unknown legacy relationship(s): ${
                skippedAssignments.map(({ patientID, doctorID }) => `${patientID}->${doctorID}`).join(', ')
            }`);
        }
        if (failedAssignments.length) {
            throw new Error(`Fabric assignment reconciliation could not replay ${failedAssignments.length} legacy relationship(s): ${
                failedAssignments.map(({ patientID, doctorID, reason }) => `${patientID}->${doctorID} (${reason})`).join(', ')
            }`);
        }
        console.log(`Fabric assignment reconciliation complete: ${assignments} relationship(s) verified`);
    } finally {
        await connection.end();
    }
};

main().catch((error) => {
    console.error(`Fabric identity reconciliation failed: ${error.message}`);
    process.exit(1);
});
