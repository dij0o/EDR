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
                        );
                        assignments += 1;
                    } catch (error) {
                        failedAssignments.push({
                            ...assignment,
                            reason: String(error.message || error).split('\n')[0],
                        });
                    }
                }
            } finally {
                gateway.disconnect();
            }
        }
        if (skippedAssignments.length) {
            console.warn(`Fabric assignment reconciliation skipped ${skippedAssignments.length} unknown legacy relationship(s): ${
                skippedAssignments.map(({ patientID, doctorID }) => `${patientID}->${doctorID}`).join(', ')
            }`);
        }
        if (failedAssignments.length) {
            console.warn(`Fabric assignment reconciliation could not replay ${failedAssignments.length} legacy relationship(s): ${
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
