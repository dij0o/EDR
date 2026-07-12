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
const sendApiError = (res, status, code, message) => res.status(status).json({ success: false, error: { code, message } });

const authenticateToken = (req, res, next) => {
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        return sendApiError(res, 401, 'AUTH_REQUIRED', 'Access denied');
    }

    if (!SECRET_KEY) {
        return sendApiError(res, 500, 'AUTH_CONFIGURATION_ERROR', 'JWT secret is not configured');
    }

    jwt.verify(token, SECRET_KEY, (err, user) => {
        if (err) {
            return sendApiError(res, 403, 'INVALID_TOKEN', 'Invalid token');
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
            return sendApiError(res, 403, 'FORBIDDEN', 'Forbidden: insufficient role permissions');
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
    const message = error.message || String(error);
    const statusCode = error.statusCode
        || (/access denied|not authorized|forbidden|requires .* role|does not match/i.test(message) ? 403 : null)
        || (/does not exist|not found/i.test(message) ? 404 : null)
        || (/missing required|cannot be rejected at this stage/i.test(message) ? 400 : null)
        || 500;
    res.status(statusCode).json({
        success: false,
        error: {
            code: statusCode === 400 ? 'VALIDATION_ERROR' : statusCode === 403 ? 'FORBIDDEN' : 'BLOCKCHAIN_ERROR',
            message
        }
    });
};

const sendSuccess = (res, data, statusCode = 200, aliases = []) => res.status(statusCode).json({
    success: true,
    data,
    ...(aliases.length ? { compatibleAliases: aliases } : {})
});

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

const readPatientHandler = async (req, res) => {
    try {
        const patientID = req.params.id || req.params.patientID;
        const result = await withContract(req, (contract) => contract.evaluateTransaction('ReadPatient', String(patientID)));
        return sendSuccess(res, parseBufferJson(result), 200, ['/readPatient/:patientID']);
    } catch (error) {
        return sendFabricError(res, error);
    }
};

const requestAccessHandler = async (req, res) => {
    try {
        requireFields(req.body, ['doctorID', 'patientID', 'dataOriginClinicID']);
        const result = await withContract(req, (contract) => contract.submitTransaction(
            'RequestDataAccess', String(req.body.doctorID), String(req.body.patientID), String(req.body.dataOriginClinicID)
        ));
        return sendSuccess(res, { requestID: result.toString() }, 201, ['/requestDataAccess']);
    } catch (error) {
        return sendFabricError(res, error);
    }
};

const grantConsentHandler = async (req, res) => {
    try {
        requireFields(req.body, ['patientID', 'requestID']);
        const result = await withContract(req, (contract) => contract.submitTransaction(
            'ProvideConsent', String(req.body.patientID), String(req.body.requestID)
        ));
        return sendSuccess(res, parseBufferJson(result), 200, ['/provideConsent']);
    } catch (error) {
        return sendFabricError(res, error);
    }
};

app.get('/getPatientByID/:id', authenticateToken, requireRoles('admin', 'doctor', 'patient', 'system'), requirePatientSelfParam('id'), readPatientHandler);

app.post('/patient-metadata', authenticateToken, requireRoles('admin'), requireAdminClinicBody('clinicID'), async (req, res) => {
    try {
        requireFields(req.body, ['patientID', 'clinicID', 'offChainRef', 'dataHash']);
        const result = await withContract(req, (contract) => contract.submitTransaction(
            'AddPatientMetadata', String(req.body.patientID), String(req.body.clinicID), String(req.body.offChainRef),
            String(req.body.dataHash), JSON.stringify(req.body.doctors || []), new Date().toISOString()
        ));
        return sendSuccess(res, parseBufferJson(result), 201);
    } catch (error) { return sendFabricError(res, error); }
});

app.put('/patient-metadata/:id', authenticateToken, requireRoles('admin'), requireAdminClinicBody('clinicID'), async (req, res) => {
    try {
        requireFields(req.body, ['clinicID', 'offChainRef', 'dataHash']);
        const result = await withContract(req, (contract) => contract.submitTransaction(
            'UpdatePatientMetadata', String(req.params.id), String(req.body.clinicID), String(req.body.offChainRef),
            String(req.body.dataHash), JSON.stringify(req.body.doctors || []), new Date().toISOString()
        ));
        return sendSuccess(res, parseBufferJson(result));
    } catch (error) { return sendFabricError(res, error); }
});

app.delete('/patient-metadata/:id', authenticateToken, requireRoles('admin'), async (req, res) => {
    try {
        await withContract(req, (contract) => contract.submitTransaction('DeletePatient', String(req.params.id)));
        return sendSuccess(res, { patientID: req.params.id, deleted: true });
    } catch (error) { return sendFabricError(res, error); }
});

app.post('/addMedicalRecord', authenticateToken, requireRoles('doctor'), requireDoctorSelfBody('doctorID'), async (req, res) => {
    try {
        requireFields(req.body, ['doctorID', 'patientID', 'medicalRecord']);
        const record = typeof req.body.medicalRecord === 'string' ? req.body.medicalRecord : JSON.stringify(req.body.medicalRecord);
        const result = await withContract(req, (contract) => contract.submitTransaction('AddMedicalRecord', String(req.body.patientID), record));
        return sendSuccess(res, parseBufferJson(result), 201);
    } catch (error) {
        return sendFabricError(res, error);
    }
});

app.get('/getDentalChartData/:id', authenticateToken, requireRoles('admin', 'doctor', 'patient', 'system'), requirePatientSelfParam('id'), async (req, res) => {
    try {
        const result = await withContract(req, (contract) => contract.evaluateTransaction('getAllDentalChartData', String(req.params.id)));
        return sendSuccess(res, parseBufferJson(result));
    } catch (error) {
        return sendFabricError(res, error);
    }
});

app.post('/requestAccess', authenticateToken, requireRoles('doctor'), requireDoctorSelfBody('doctorID'), requestAccessHandler);
app.post('/grantConsent', authenticateToken, requireRoles('patient'), requirePatientSelfBody('patientID'), grantConsentHandler);

app.get('/getPendingRequests', authenticateToken, requireRoles('patient'), async (req, res) => {
    try {
        if (!req.user.blockchainID) {
            const error = new Error('Authenticated patient is missing a blockchain identity');
            error.statusCode = 403;
            throw error;
        }
        const result = await withContract(req, (contract) => contract.evaluateTransaction('GetPendingRequestsForPatient', String(req.user.blockchainID)));
        return sendSuccess(res, parseBufferJson(result), 200, ['/getPendingRequestsForPatient/:patientID']);
    } catch (error) {
        return sendFabricError(res, error);
    }
});

app.get('/doctor/:id', authenticateToken, requireRoles('admin', 'doctor', 'system'), requireDoctorSelfParam('id'), async (req, res) => {
    try {
        const result = await withContract(req, (contract) => contract.evaluateTransaction('ReadDoctor', String(req.params.id)));
        return sendSuccess(res, parseBufferJson(result));
    } catch (error) {
        return sendFabricError(res, error);
    }
});

app.put('/patient/:id', authenticateToken, requireRoles('admin'), requireAdminClinicBody('clinicID'), async (req, res) => {
    try {
        requireFields(req.body, ['firstName', 'lastName', 'dateOfBirth', 'gender', 'emiratesID', 'email', 'contactNumber', 'address', 'clinicID']);
        const result = await withContract(req, (contract) => contract.submitTransaction(
            'UpdatePatientInfo', String(req.params.id), String(req.body.firstName), String(req.body.lastName), String(req.body.dateOfBirth),
            String(req.body.gender), String(req.body.emiratesID), String(req.body.email), String(req.body.contactNumber), String(req.body.address),
            String(req.body.createdDate || new Date().toISOString()), JSON.stringify(req.body.doctors || []), String(req.body.clinicID), JSON.stringify(req.body.dentalChart || [])
        ));
        return sendSuccess(res, parseBufferJson(result));
    } catch (error) { return sendFabricError(res, error); }
});

app.delete('/patient/:id', authenticateToken, requireRoles('admin'), async (req, res) => {
    try {
        await withContract(req, (contract) => contract.submitTransaction('DeletePatient', String(req.params.id)));
        return sendSuccess(res, { id: req.params.id, deleted: true });
    } catch (error) { return sendFabricError(res, error); }
});

app.put('/doctor/:id', authenticateToken, requireRoles('admin'), requireAdminClinicBody('clinicID'), async (req, res) => {
    try {
        requireFields(req.body, ['firstName', 'lastName', 'emiratesID', 'speciality', 'worksAt', 'clinicID', 'email', 'contactNumber', 'licenseNumber']);
        const result = await withContract(req, (contract) => contract.submitTransaction(
            'UpdateDoctorInfo', String(req.params.id), String(req.body.firstName), String(req.body.lastName), String(req.body.emiratesID), String(req.body.speciality),
            String(req.body.worksAt), String(req.body.clinicID), String(req.body.email), String(req.body.contactNumber),
            String(req.body.licenseNumber), String(req.body.createdDate || new Date().toISOString()), JSON.stringify(req.body.patients || [])
        ));
        return sendSuccess(res, parseBufferJson(result));
    } catch (error) { return sendFabricError(res, error); }
});

app.delete('/doctor/:id', authenticateToken, requireRoles('admin'), async (req, res) => {
    try {
        await withContract(req, (contract) => contract.submitTransaction('DeleteDoctor', String(req.params.id)));
        return sendSuccess(res, { id: req.params.id, deleted: true });
    } catch (error) { return sendFabricError(res, error); }
});

app.post('/admin/rejectRequest', authenticateToken, requireRoles('admin'), requireAdminClinicBody('adminClinicID'), async (req, res) => {
    try {
        requireFields(req.body, ['adminID', 'adminClinicID', 'requestID', 'rejectionReason']);
        const result = await withContract(req, (contract) => contract.submitTransaction('RejectRequest', String(req.body.adminID), String(req.body.requestID), String(req.body.rejectionReason)));
        return sendSuccess(res, parseBufferJson(result));
    } catch (error) { return sendFabricError(res, error); }
});

app.post('/patient/rejectRequest', authenticateToken, requireRoles('patient'), requirePatientSelfBody('patientID'), async (req, res) => {
    try {
        requireFields(req.body, ['patientID', 'requestID', 'rejectionReason']);
        const result = await withContract(req, (contract) => contract.submitTransaction('RejectRequest', String(req.body.patientID), String(req.body.requestID), String(req.body.rejectionReason)));
        return sendSuccess(res, parseBufferJson(result), 200, ['/rejectRequest']);
    } catch (error) { return sendFabricError(res, error); }
});

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
            ,'licenseNumber'
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
            licenseNumber,
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
            String(licenseNumber),
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

app.get('/doctor/me/assigned-patients', authenticateToken, requireRoles('doctor'), async (req, res) => {
    try {
        if (!req.user.blockchainID) return sendError(res, 403, 'DOCTOR_IDENTITY_MISSING', 'Authenticated doctor has no blockchain identity');
        const result = await withContract(req, (contract) => contract.evaluateTransaction('getPatientsAssignedToDoctor', String(req.user.blockchainID)));
        return sendSuccess(res, parseBufferJson(result));
    } catch (error) { return sendFabricError(res, error); }
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
