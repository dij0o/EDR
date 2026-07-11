// index.js

const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const { Gateway, Wallets } = require('fabric-network');
const path = require('path');
const fs = require('fs');
const jwt = require('jsonwebtoken');
const { fabricIdentityForUser } = require('./fabricIdentity');

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
const fabricChannel = process.env.FABRIC_CHANNEL || 'mychannel';
const fabricChaincode = process.env.FABRIC_CHAINCODE || 'basic';
const discoveryEnabled = process.env.FABRIC_DISCOVERY_ENABLED !== 'false';
const discoveryAsLocalhost = process.env.FABRIC_DISCOVERY_AS_LOCALHOST !== 'false';
const SECRET_KEY = process.env.JWT_SECRET;

const ROLE_ALIASES = {
    admin: 'admin',
    administrator: 'admin',
    doctor: 'doctor',
    patient: 'patient',
    system: 'system',
    sysadmin: 'system'
};

const normalizeRole = (role) => {
    const normalized = String(role || '').trim().toLowerCase().replace(/[\s_-]+/g, '');
    return ROLE_ALIASES[normalized] || normalized;
};

const isRole = (req, role) => normalizeRole(req.user?.role) === normalizeRole(role);

const authenticateToken = (req, res, next) => {
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        return res.status(401).json({ error: 'Access denied' });
    }

    if (!SECRET_KEY) {
        return res.status(500).json({ error: 'JWT secret is not configured' });
    }

    jwt.verify(token, SECRET_KEY, (err, user) => {
        if (err) {
            return res.status(403).json({ error: 'Invalid token' });
        }

        req.user = user;
        next();
    });
};

const requireRoles = (...allowedRoles) => {
    const allowed = allowedRoles.map(normalizeRole);

    return (req, res, next) => {
        const userRole = normalizeRole(req.user?.role);

        if (!userRole || !allowed.includes(userRole)) {
            return res.status(403).json({ error: 'Forbidden: insufficient role permissions' });
        }

        next();
    };
};

const requireAdminClinicParam = (paramName) => (req, res, next) => {
    if (!isRole(req, 'admin')) {
        return next();
    }

    const requestedClinicID = req.params[paramName];

    if (requestedClinicID === undefined || requestedClinicID === null || requestedClinicID === '') {
        return next();
    }

    if (!req.user.organizationId || String(req.user.organizationId) !== String(requestedClinicID)) {
        return res.status(403).json({ error: 'Forbidden: clinic access is limited to the authenticated admin organization' });
    }

    next();
};

const requireAdminClinicBody = (fieldName) => (req, res, next) => {
    if (!isRole(req, 'admin')) {
        return next();
    }

    const requestedClinicID = req.body[fieldName];

    if (requestedClinicID === undefined || requestedClinicID === null || requestedClinicID === '') {
        return next();
    }

    if (!req.user.organizationId || String(req.user.organizationId) !== String(requestedClinicID)) {
        return res.status(403).json({ error: 'Forbidden: clinic access is limited to the authenticated admin organization' });
    }

    next();
};

const requireDoctorSelfParam = (paramName) => (req, res, next) => {
    if (!isRole(req, 'doctor')) {
        return next();
    }

    const requestedDoctorID = req.params[paramName];

    if (requestedDoctorID === undefined || requestedDoctorID === null || requestedDoctorID === '') {
        return next();
    }

    if (!req.user.blockchainID || String(req.user.blockchainID) !== String(requestedDoctorID)) {
        return res.status(403).json({ error: 'Forbidden: doctor access is limited to the authenticated doctor identity' });
    }

    next();
};

const requireDoctorSelfBody = (fieldName) => (req, res, next) => {
    if (!isRole(req, 'doctor')) {
        return next();
    }

    const requestedDoctorID = req.body[fieldName];

    if (requestedDoctorID === undefined || requestedDoctorID === null || requestedDoctorID === '') {
        return next();
    }

    if (!req.user.blockchainID || String(req.user.blockchainID) !== String(requestedDoctorID)) {
        return res.status(403).json({ error: 'Forbidden: doctor access is limited to the authenticated doctor identity' });
    }

    next();
};

const requirePatientSelfParam = (paramName) => (req, res, next) => {
    if (!isRole(req, 'patient')) {
        return next();
    }

    const requestedPatientID = req.params[paramName];

    if (requestedPatientID === undefined || requestedPatientID === null || requestedPatientID === '') {
        return next();
    }

    if (!req.user.blockchainID || String(req.user.blockchainID) !== String(requestedPatientID)) {
        return res.status(403).json({ error: 'Forbidden: patient access is limited to the authenticated patient identity' });
    }

    next();
};

const requirePatientSelfBody = (fieldName) => (req, res, next) => {
    if (!isRole(req, 'patient')) {
        return next();
    }

    const requestedPatientID = req.body[fieldName];

    if (requestedPatientID === undefined || requestedPatientID === null || requestedPatientID === '') {
        return next();
    }

    if (!req.user.blockchainID || String(req.user.blockchainID) !== String(requestedPatientID)) {
        return res.status(403).json({ error: 'Forbidden: patient access is limited to the authenticated patient identity' });
    }

    next();
};

console.log('Connection profile path:', ccpPath);
console.log('Fabric wallet path:', walletPath);

if (!SECRET_KEY) {
    console.warn('JWT_SECRET is not configured. Protected blockchain endpoints will return a configuration error.');
}

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

const fabricIdentityForRequest = (req) => {
    return fabricIdentityForUser(req.user);
};

const withContract = async (req, callback) => {
    const wallet = await Wallets.newFileSystemWallet(walletPath);
    const gateway = new Gateway();
    const identity = fabricIdentityForRequest(req);

    if (!await wallet.get(identity)) {
        const error = new Error(`Fabric identity ${identity} is not enrolled in the configured wallet.`);
        error.statusCode = 503;
        throw error;
    }

    try {
        await gateway.connect(getConnectionProfile(), {
            wallet,
            identity,
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

app.post('/addPatient', authenticateToken, requireRoles('admin'), requireAdminClinicBody('clinicID'), async (req, res) => {
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

        const result = await withContract(req, (contract) => contract.submitTransaction(
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

app.post('/addDoctor', authenticateToken, requireRoles('admin'), requireAdminClinicBody('clinicID'), async (req, res) => {
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

        const result = await withContract(req, (contract) => contract.submitTransaction(
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

app.post('/registerPatientInClinic', authenticateToken, requireRoles('admin'), requireAdminClinicBody('clinicID'), async (req, res) => {
    try {
        requireFields(req.body, ['patientID', 'clinicID']);
        const result = await withContract(req, (contract) => contract.submitTransaction(
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

app.post('/assignPatientToDoctor', authenticateToken, requireRoles('admin'), async (req, res) => {
    try {
        requireFields(req.body, ['patientID', 'doctorID']);
        const result = await withContract(req, (contract) => contract.submitTransaction(
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

app.get('/getAllPatients', authenticateToken, requireRoles('admin', 'system'), async (req, res) => {
    try {
        const wallet = await Wallets.newFileSystemWallet(walletPath);

        const gateway = new Gateway();
        await gateway.connect(getConnectionProfile(), {
            wallet,
            identity: fabricIdentityForRequest(req),
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

app.get('/readPatient/:patientID', authenticateToken, requireRoles('admin', 'doctor'), async (req, res) => {
    try {
        const wallet = await Wallets.newFileSystemWallet(walletPath);

        const gateway = new Gateway();
        await gateway.connect(getConnectionProfile(), {
            wallet,
            identity: fabricIdentityForRequest(req),
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

app.get('/getPatientsAssignedToDoctor/:doctorID', authenticateToken, requireRoles('admin', 'doctor'), requireDoctorSelfParam('doctorID'), async (req, res) => {
    try {
        const wallet = await Wallets.newFileSystemWallet(walletPath);

        const gateway = new Gateway();
        await gateway.connect(getConnectionProfile(), {
            wallet,
            identity: fabricIdentityForRequest(req),
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

app.get('/getPatientsByClinic/:clinicID', authenticateToken, requireRoles('admin'), requireAdminClinicParam('clinicID'), async (req, res) => {
    try {
        const wallet = await Wallets.newFileSystemWallet(walletPath);

        const gateway = new Gateway();
        await gateway.connect(getConnectionProfile(), {
            wallet,
            identity: fabricIdentityForRequest(req),
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
app.post('/requestDataAccess', authenticateToken, requireRoles('doctor'), requireDoctorSelfBody('doctorID'), async (req, res) => {
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
            identity: fabricIdentityForRequest(req),
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

app.get('/getRequestsForAdmin/:clinicID', authenticateToken, requireRoles('admin'), requireAdminClinicParam('clinicID'), async (req, res) => {
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
            identity: fabricIdentityForRequest(req),
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
app.post('/approveRequest', authenticateToken, requireRoles('admin'), requireAdminClinicBody('adminClinicID'), async (req, res) => {
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
            identity: fabricIdentityForRequest(req),
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

app.get('/getPendingRequestsForPatient/:patientID', authenticateToken, requireRoles('patient'), requirePatientSelfParam('patientID'), async (req, res) => {
    try {
        const wallet = await Wallets.newFileSystemWallet(walletPath);

        const gateway = new Gateway();
        await gateway.connect(getConnectionProfile(), {
            wallet,
            identity: fabricIdentityForRequest(req),
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

app.get('/getProcessedRequestsForPatient/:patientID', authenticateToken, requireRoles('patient'), requirePatientSelfParam('patientID'), async (req, res) => {
    try {
        const wallet = await Wallets.newFileSystemWallet(walletPath);

        const gateway = new Gateway();
        await gateway.connect(getConnectionProfile(), {
            wallet,
            identity: fabricIdentityForRequest(req),
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

app.get('/getAllRequestsForPatient/:patientID', authenticateToken, requireRoles('patient'), requirePatientSelfParam('patientID'), async (req, res) => {
    try {
        const wallet = await Wallets.newFileSystemWallet(walletPath);

        const gateway = new Gateway();
        await gateway.connect(getConnectionProfile(), {
            wallet,
            identity: fabricIdentityForRequest(req),
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


app.post('/provideConsent', authenticateToken, requireRoles('patient'), requirePatientSelfBody('patientID'), async (req, res) => {
    try {
        const { patientID, requestID } = req.body;
        
        if (!patientID || !requestID) {
            return res.status(400).json({ error: "Missing required parameters" });
        }

        const wallet = await Wallets.newFileSystemWallet(walletPath);

        const gateway = new Gateway();
        await gateway.connect(getConnectionProfile(), {
            wallet,
            identity: fabricIdentityForRequest(req),
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

app.post('/rejectRequest', authenticateToken, requireRoles('patient'), requirePatientSelfBody('patientID'), async (req, res) => {
    try {
        const { patientID, requestID, rejectionReason } = req.body;
        
        if (!patientID || !requestID || !rejectionReason) {
            return res.status(400).json({ error: "Missing required parameters" });
        }

        const wallet = await Wallets.newFileSystemWallet(walletPath);

        const gateway = new Gateway();
        await gateway.connect(getConnectionProfile(), {
            wallet,
            identity: fabricIdentityForRequest(req),
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
