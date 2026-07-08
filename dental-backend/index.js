// index.js

const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const { Gateway, Wallets } = require('fabric-network');
const path = require('path');
const fs = require('fs');

require('dotenv').config();

const app = express();
app.use(bodyParser.json());

const parseCorsOrigin = (value) => {
    if (!value || value === '*') {
        return '*';
    }

    return value.split(',').map((origin) => origin.trim()).filter(Boolean);
};

app.use(cors({
    origin: parseCorsOrigin(process.env.CORS_ORIGIN),
    optionsSuccessStatus: 200
}));

const ccpPath = path.resolve(__dirname, process.env.FABRIC_CONNECTION_PROFILE || './connection/connection-org1.json');
const walletPath = path.resolve(__dirname, process.env.FABRIC_WALLET_PATH || './wallet');
const fabricIdentity = process.env.FABRIC_IDENTITY || 'appUser';
const fabricChannel = process.env.FABRIC_CHANNEL || 'mychannel';
const fabricChaincode = process.env.FABRIC_CHAINCODE || 'basic';
const discoveryEnabled = process.env.FABRIC_DISCOVERY_ENABLED !== 'false';
const discoveryAsLocalhost = process.env.FABRIC_DISCOVERY_AS_LOCALHOST !== 'false';

console.log('Connection profile path:', ccpPath);
console.log('Fabric wallet path:', walletPath);

let connectionProfile;

const getConnectionProfile = () => {
    if (connectionProfile) {
        return connectionProfile;
    }

    if (!fs.existsSync(ccpPath)) {
        const error = new Error(`Fabric connection profile not found at ${ccpPath}`);
        error.statusCode = 503;
        throw error;
    }

    connectionProfile = JSON.parse(fs.readFileSync(ccpPath, 'utf8'));
    return connectionProfile;
};

const sendFabricError = (res, error) => {
    const statusCode = error.statusCode || 500;
    res.status(statusCode).json({ error: error.message || String(error) });
};

const withContract = async (callback) => {
    const wallet = await Wallets.newFileSystemWallet(walletPath);
    const gateway = new Gateway();

    try {
        await gateway.connect(getConnectionProfile(), {
            wallet,
            identity: fabricIdentity,
            discovery: { enabled: discoveryEnabled, asLocalhost: discoveryAsLocalhost },
        });

        const network = await gateway.getNetwork(fabricChannel);
        const contract = network.getContract(fabricChaincode);
        return await callback(contract);
    } finally {
        gateway.disconnect();
    }
};

const parseBufferJson = (buffer) => {
    const text = buffer.toString();
    return text ? JSON.parse(text) : {};
};

const requireFields = (body, fields) => {
    const missing = fields.filter((field) => body[field] === undefined || body[field] === null || body[field] === '');

    if (missing.length > 0) {
        const error = new Error(`Missing required fields: ${missing.join(', ')}`);
        error.statusCode = 400;
        throw error;
    }
};

app.post('/addPatient', async (req, res) => {
    try {
        requireFields(req.body, [
            'patientID',
            'firstName',
            'lastName',
            'dateOfBirth',
            'gender',
            'emiratesID',
            'email',
            'contactNumber',
            'address',
            'clinicID'
        ]);

        const {
            patientID,
            firstName,
            lastName,
            dateOfBirth,
            gender,
            emiratesID,
            email,
            contactNumber,
            address,
            clinicID,
            doctors = [],
        } = req.body;
        const createdDate = req.body.createdDate || new Date().toISOString();

        const result = await withContract((contract) => contract.submitTransaction(
            'addPatient',
            String(patientID),
            String(firstName),
            String(lastName),
            String(dateOfBirth),
            String(gender),
            String(emiratesID),
            String(email),
            String(contactNumber),
            String(address),
            String(createdDate),
            String(clinicID),
            JSON.stringify(doctors)
        ));

        res.status(201).json(parseBufferJson(result));
    } catch (error) {
        console.error(`Failed to add patient: ${error}`);
        sendFabricError(res, error);
    }
});

app.post('/addDoctor', async (req, res) => {
    try {
        requireFields(req.body, [
            'doctorID',
            'firstName',
            'lastName',
            'emiratesID',
            'speciality',
            'worksAt',
            'clinicID',
            'email',
            'contactNumber'
        ]);

        const {
            doctorID,
            firstName,
            lastName,
            emiratesID,
            speciality,
            worksAt,
            clinicID,
            email,
            contactNumber,
            patients = [],
        } = req.body;
        const createdDate = req.body.createdDate || new Date().toISOString();

        const result = await withContract((contract) => contract.submitTransaction(
            'addDoctor',
            String(doctorID),
            String(firstName),
            String(lastName),
            String(emiratesID),
            String(speciality),
            String(worksAt),
            String(clinicID),
            String(email),
            String(contactNumber),
            String(createdDate),
            JSON.stringify(patients)
        ));

        res.status(201).json(parseBufferJson(result));
    } catch (error) {
        console.error(`Failed to add doctor: ${error}`);
        sendFabricError(res, error);
    }
});

app.post('/registerPatientInClinic', async (req, res) => {
    try {
        requireFields(req.body, ['patientID', 'clinicID']);
        const result = await withContract((contract) => contract.submitTransaction(
            'registerPatientInClinic',
            String(req.body.patientID),
            String(req.body.clinicID)
        ));

        res.json(parseBufferJson(result));
    } catch (error) {
        console.error(`Failed to register patient in clinic: ${error}`);
        sendFabricError(res, error);
    }
});

app.post('/assignPatientToDoctor', async (req, res) => {
    try {
        requireFields(req.body, ['patientID', 'doctorID']);
        const result = await withContract((contract) => contract.submitTransaction(
            'assignPatientToDoctor',
            String(req.body.patientID),
            String(req.body.doctorID)
        ));

        res.json(parseBufferJson(result));
    } catch (error) {
        console.error(`Failed to assign patient to doctor: ${error}`);
        sendFabricError(res, error);
    }
});

app.get('/getAllPatients', async (req, res) => {
    try {
        const wallet = await Wallets.newFileSystemWallet(walletPath);

        const gateway = new Gateway();
        await gateway.connect(getConnectionProfile(), {
            wallet,
            identity: fabricIdentity,
            discovery: { enabled: discoveryEnabled, asLocalhost: discoveryAsLocalhost },
        });

        const network = await gateway.getNetwork(fabricChannel);
        const contract = network.getContract(fabricChaincode);

        const result = await contract.evaluateTransaction('GetAllPatients');
        res.status(200).json(JSON.parse(result.toString()));
        await gateway.disconnect();
    } catch (error) {
        console.error(`Failed to evaluate transaction: ${error}`);
        sendFabricError(res, error);
    }
});

app.get('/readPatient/:patientID', async (req, res) => {
    try {
        const wallet = await Wallets.newFileSystemWallet(walletPath);

        const gateway = new Gateway();
        await gateway.connect(getConnectionProfile(), {
            wallet,
            identity: fabricIdentity,
            discovery: { enabled: discoveryEnabled, asLocalhost: discoveryAsLocalhost },
        });

        const network = await gateway.getNetwork(fabricChannel);
        const contract = network.getContract(fabricChaincode);

        const patientID = req.params.patientID;
        const result = await contract.evaluateTransaction('ReadPatient', patientID);

        res.status(200).json(JSON.parse(result.toString()));
        await gateway.disconnect();
    } catch (error) {
        console.error(`Failed to evaluate transaction: ${error}`);
        sendFabricError(res, error);
    }
});

app.get('/getPatientsAssignedToDoctor/:doctorID', async (req, res) => {
    try {
        const wallet = await Wallets.newFileSystemWallet(walletPath);

        const gateway = new Gateway();
        await gateway.connect(getConnectionProfile(), {
            wallet,
            identity: fabricIdentity,
            discovery: { enabled: discoveryEnabled, asLocalhost: discoveryAsLocalhost },
        });

        const network = await gateway.getNetwork(fabricChannel);
        const contract = network.getContract(fabricChaincode);

        const doctorID = req.params.doctorID;
        const result = await contract.evaluateTransaction('getPatientsAssignedToDoctor', doctorID);

        res.status(200).json(JSON.parse(result.toString()));
        await gateway.disconnect();
    } catch (error) {
        console.error(`Failed to evaluate transaction: ${error}`);
        sendFabricError(res, error);
    }
});

app.get('/getPatientsByClinic/:clinicID', async (req, res) => {
    try {
        const wallet = await Wallets.newFileSystemWallet(walletPath);

        const gateway = new Gateway();
        await gateway.connect(getConnectionProfile(), {
            wallet,
            identity: fabricIdentity,
            discovery: { enabled: discoveryEnabled, asLocalhost: discoveryAsLocalhost },
        });

        const network = await gateway.getNetwork(fabricChannel);
        const contract = network.getContract(fabricChaincode);

        const clinicID = req.params.clinicID;
        const result = await contract.evaluateTransaction('GetPatientsByClinic', clinicID);

        res.status(200).json(JSON.parse(result.toString()));
        await gateway.disconnect();
    } catch (error) {
        console.error(`Failed to evaluate transaction: ${error}`);
        sendFabricError(res, error);
    }
});


// Endpoint for doctor to request data access
app.post('/requestDataAccess', async (req, res) => {
    try {
        // console.log("Received API request:", req.body);

        const { doctorID, patientID, dataOriginClinicID } = req.body;
        
        if (!doctorID || !patientID || !dataOriginClinicID) {
            return res.status(400).json({ error: "Missing required parameters" });
        }

        const wallet = await Wallets.newFileSystemWallet(walletPath);

        const gateway = new Gateway();
        await gateway.connect(getConnectionProfile(), {
            wallet,
            identity: fabricIdentity,
            discovery: { enabled: discoveryEnabled, asLocalhost: discoveryAsLocalhost },
        });

        const network = await gateway.getNetwork(fabricChannel);
        const contract = network.getContract(fabricChaincode);

        // Convert clinic ID to string to match Fabric contract expectations
        const requestID = await contract.submitTransaction(
            'RequestDataAccess', 
            doctorID, 
            patientID, 
            String(dataOriginClinicID)
        );

        res.status(200).json({ requestID: requestID.toString() });
        await gateway.disconnect();
    } catch (error) {
        console.error(`Failed to submit transaction: ${error}`);
        sendFabricError(res, error);
    }
});

app.get('/getRequestsForAdmin/:clinicID', async (req, res) => {
    try {
        console.log("Received request to get admin clinic requests for:", req.params.clinicID);

        const { clinicID } = req.params;
        
        if (!clinicID) {
            return res.status(400).json({ error: "Missing required clinic ID parameter" });
        }

        const wallet = await Wallets.newFileSystemWallet(walletPath);

        const gateway = new Gateway();
        await gateway.connect(getConnectionProfile(), {
            wallet,
            identity: fabricIdentity,
            discovery: { enabled: discoveryEnabled, asLocalhost: discoveryAsLocalhost },
        });

        const network = await gateway.getNetwork(fabricChannel);
        const contract = network.getContract(fabricChaincode);

        // Call `GetRequestsForAdmin` chaincode function with the provided clinic ID
        const result = await contract.evaluateTransaction('GetRequestsForAdmin', clinicID);

        console.log("Fetched Requests for Clinic:", clinicID, "Response:", result.toString());

        res.status(200).json(JSON.parse(result.toString()));
        await gateway.disconnect();
    } catch (error) {
        console.error(`Failed to evaluate transaction: ${error}`);
        sendFabricError(res, error);
    }
});
//admin from org approves request
app.post('/approveRequest', async (req, res) => {
    try {
        console.log("Received request to approve request:", req.body);

        const { adminID, requestID, adminClinicID } = req.body;
        
        if (!adminID || !requestID || !adminClinicID) {
            return res.status(400).json({ error: "Missing required parameters" });
        }

        const wallet = await Wallets.newFileSystemWallet(walletPath);

        const gateway = new Gateway();
        await gateway.connect(getConnectionProfile(), {
            wallet,
            identity: fabricIdentity,
            discovery: { enabled: discoveryEnabled, asLocalhost: discoveryAsLocalhost },
        });

        const network = await gateway.getNetwork(fabricChannel);
        const contract = network.getContract(fabricChaincode);

        // Call `ApproveRequest` chaincode function with required parameters
        const result = await contract.submitTransaction(
            'ApproveRequest', 
            adminID, 
            requestID, 
            String(adminClinicID)
        );

        console.log("Approval Response:", result.toString());

        res.status(200).json(JSON.parse(result.toString()));
        await gateway.disconnect();
    } catch (error) {
        console.error(`Failed to approve request: ${error}`);
        sendFabricError(res, error);
    }
});

app.get('/getPendingRequestsForPatient/:patientID', async (req, res) => {
    try {
        const wallet = await Wallets.newFileSystemWallet(walletPath);

        const gateway = new Gateway();
        await gateway.connect(getConnectionProfile(), {
            wallet,
            identity: fabricIdentity,
            discovery: { enabled: discoveryEnabled, asLocalhost: discoveryAsLocalhost },
        });

        const network = await gateway.getNetwork(fabricChannel);
        const contract = network.getContract(fabricChaincode);

        const patientID = req.params.patientID;
        const result = await contract.evaluateTransaction('GetPendingRequestsForPatient', patientID);

        res.status(200).json(JSON.parse(result.toString()));
        await gateway.disconnect();
    } catch (error) {
        console.error(`Failed to evaluate transaction: ${error}`);
        sendFabricError(res, error);
    }
});

app.get('/getProcessedRequestsForPatient/:patientID', async (req, res) => {
    try {
        const wallet = await Wallets.newFileSystemWallet(walletPath);

        const gateway = new Gateway();
        await gateway.connect(getConnectionProfile(), {
            wallet,
            identity: fabricIdentity,
            discovery: { enabled: discoveryEnabled, asLocalhost: discoveryAsLocalhost },
        });

        const network = await gateway.getNetwork(fabricChannel);
        const contract = network.getContract(fabricChaincode);

        const patientID = req.params.patientID;
        const result = await contract.evaluateTransaction('GetProcessedRequestsForPatient', patientID);

        res.status(200).json(JSON.parse(result.toString()));
        await gateway.disconnect();
    } catch (error) {
        console.error(`Failed to evaluate transaction: ${error}`);
        sendFabricError(res, error);
    }
});

app.get('/getAllRequestsForPatient/:patientID', async (req, res) => {
    try {
        const wallet = await Wallets.newFileSystemWallet(walletPath);

        const gateway = new Gateway();
        await gateway.connect(getConnectionProfile(), {
            wallet,
            identity: fabricIdentity,
            discovery: { enabled: discoveryEnabled, asLocalhost: discoveryAsLocalhost },
        });

        const network = await gateway.getNetwork(fabricChannel);
        const contract = network.getContract(fabricChaincode);

        const patientID = req.params.patientID;
        const result = await contract.evaluateTransaction('GetAllRequestsForPatient', patientID);

        res.status(200).json(JSON.parse(result.toString()));
        await gateway.disconnect();
    } catch (error) {
        console.error(`Failed to evaluate transaction: ${error}`);
        sendFabricError(res, error);
    }
});


app.post('/provideConsent', async (req, res) => {
    try {
        const { patientID, requestID } = req.body;
        
        if (!patientID || !requestID) {
            return res.status(400).json({ error: "Missing required parameters" });
        }

        const wallet = await Wallets.newFileSystemWallet(walletPath);

        const gateway = new Gateway();
        await gateway.connect(getConnectionProfile(), {
            wallet,
            identity: fabricIdentity,
            discovery: { enabled: discoveryEnabled, asLocalhost: discoveryAsLocalhost },
        });

        const network = await gateway.getNetwork(fabricChannel);
        const contract = network.getContract(fabricChaincode);

        const result = await contract.submitTransaction('ProvideConsent', patientID, requestID);

        res.status(200).json(JSON.parse(result.toString()));
        await gateway.disconnect();
    } catch (error) {
        console.error(`Failed to submit transaction: ${error}`);
        sendFabricError(res, error);
    }
});

app.post('/rejectRequest', async (req, res) => {
    try {
        const { patientID, requestID, rejectionReason } = req.body;
        
        if (!patientID || !requestID || !rejectionReason) {
            return res.status(400).json({ error: "Missing required parameters" });
        }

        const wallet = await Wallets.newFileSystemWallet(walletPath);

        const gateway = new Gateway();
        await gateway.connect(getConnectionProfile(), {
            wallet,
            identity: fabricIdentity,
            discovery: { enabled: discoveryEnabled, asLocalhost: discoveryAsLocalhost },
        });

        const network = await gateway.getNetwork(fabricChannel);
        const contract = network.getContract(fabricChaincode);

        const result = await contract.submitTransaction('RejectRequest', patientID, requestID, rejectionReason);

        res.status(200).json(JSON.parse(result.toString()));
        await gateway.disconnect();
    } catch (error) {
        console.error(`Failed to submit transaction: ${error}`);
        sendFabricError(res, error);
    }
});

// const PORT = process.env.PORT || 8081;
// app.listen(PORT, () => {
//     console.log(`Server running on port ${PORT}`);
// });
const PORT = process.env.PORT || 8081;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
});
