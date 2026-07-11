const express = require('express');
const mysql = require('mysql2');
const cors = require('cors');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');

require('dotenv').config();

const app = express();
const SECRET_KEY = process.env.JWT_SECRET;
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '2h';
const ADMIN_BOOTSTRAP_TOKEN = process.env.ADMIN_BOOTSTRAP_TOKEN;
const BLOCKCHAIN_API_URL = process.env.BLOCKCHAIN_API_URL?.replace(/\/+$/, '');
const PATIENT_ROLE_ID = 4;

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

const sendApiError = (res, status, code, message) => res.status(status).json({ success: false, error: { code, message } });

const query = (sql, params = []) => new Promise((resolve, reject) => {
    db.query(sql, params, (err, result) => err ? reject(err) : resolve(result));
});

const normalizePatient = (row) => ({
    patientID: row.Blockchain_ID,
    firstName: row.First_Name,
    lastName: row.Last_Name,
    dateOfBirth: row.Date_of_Birth,
    gender: row.Gender,
    contactNumber: row.Contact_Number,
    email: row.Email,
    emiratesID: row.Emirates_ID,
    nationality: row.Nationality,
    address: row.Address,
    bloodType: row.Blood_Type,
    medicalHistory: row.Medical_History,
    allergies: row.Allergies,
    medications: row.Medications,
    insuranceDetails: row.Insurance_Details,
    clinicID: row.Clinic_ID,
    doctors: row.Doctors ? (typeof row.Doctors === 'string' ? JSON.parse(row.Doctors) : row.Doctors) : [],
    createdDate: row.Created_Date,
    modifiedDate: row.Modified_Date
});

const patientHash = (patient) => crypto.createHash('sha256').update(JSON.stringify({
    patientID: patient.patientID,
    firstName: patient.firstName,
    lastName: patient.lastName,
    dateOfBirth: patient.dateOfBirth,
    gender: patient.gender,
    contactNumber: patient.contactNumber,
    email: patient.email,
    emiratesID: patient.emiratesID,
    nationality: patient.nationality,
    address: patient.address,
    bloodType: patient.bloodType,
    medicalHistory: patient.medicalHistory,
    allergies: patient.allergies,
    medications: patient.medications,
    insuranceDetails: patient.insuranceDetails,
    clinicID: Number(patient.clinicID),
    doctors: patient.doctors || []
})).digest('hex');

const callBlockchain = async (req, path, method, body) => {
    if (!BLOCKCHAIN_API_URL) {
        const error = new Error('Blockchain API URL is not configured');
        error.statusCode = 503;
        throw error;
    }
    const response = await fetch(`${BLOCKCHAIN_API_URL}${path}`, {
        method,
        headers: { 'Content-Type': 'application/json', Authorization: req.headers.authorization },
        body: body === undefined ? undefined : JSON.stringify(body)
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
        const error = new Error(payload?.error?.message || payload?.error || 'Blockchain operation failed');
        error.statusCode = response.status;
        throw error;
    }
    return payload.data ?? payload;
};

const requireAdminClinic = (req, clinicID) => {
    if (Number(req.user.organizationId) !== Number(clinicID)) {
        const error = new Error('Forbidden: patient clinic must match the authenticated admin organization');
        error.statusCode = 403;
        throw error;
    }
};

const parseCorsOrigin = (value) => {
    if (!value || value === '*') {
        return '*';
    }

    return value.split(',').map((origin) => origin.trim()).filter(Boolean);
};

const corsOptions = {
    origin: parseCorsOrigin(process.env.CORS_ORIGIN),
    optionsSuccessStatus: 200
};

if (!SECRET_KEY) {
    console.warn('JWT_SECRET is not configured. Login and protected endpoints will return a configuration error.');
}

if (!BLOCKCHAIN_API_URL) {
    console.warn('BLOCKCHAIN_API_URL is not configured. /syncOnChainPatients will return a configuration error.');
}

if (!ADMIN_BOOTSTRAP_TOKEN) {
    console.warn('ADMIN_BOOTSTRAP_TOKEN is not configured. /register requires an Admin/System JWT.');
}

app.use(cors(corsOptions));
app.use(express.json());

// Connection pool — handles reconnects automatically, reads config from .env
const db = mysql.createPool({
    host:     process.env.DB_HOST     || 'localhost',
    port:     process.env.DB_PORT     || 3306,
    user:     process.env.DB_USER     || 'root',
    password: process.env.DB_PASSWORD || 'CHANGE_ME',
    database: process.env.DB_NAME     || 'mydatabase',
    waitForConnections: true,
    connectionLimit: 10,
});

db.getConnection((err, connection) => {
    if (err) {
        console.error('Error connecting to the database:', err);
        return;
    }
    console.log('Connected to the MySQL database');
    connection.release();
});


app.use((req, res, next) => {
    console.log('Received request:', req.method, req.url);  // Logs every incoming request
    next();
});


// Home route for testing
app.get('/', (req, res) => {
    return res.json("from backend side");
});



app.post('/login', async (req, res) => {
    const { email, password } = req.body;

    // Input check
    if (!email || !password) {
        return res.status(400).json({ error: "Email and password are required" });
    }

    console.log('🔐 Login attempt:', email);

    const sql = `
        SELECT 
            User.ID, User.First_Name, User.Last_Name, User.Email, User.Password, 
            UserRole.Name AS Role_Name,
            COALESCE(Admin.Organization_ID, NULL) AS Organization_ID,
            COALESCE(Doctor.Works_At, NULL) AS WorksAt,
            COALESCE(Doctor.Specialty, NULL) AS Specialty,
            COALESCE(Doctor.Blockchain_ID, Patient.Blockchain_ID, NULL) AS BlockchainID
        FROM User 
        INNER JOIN UserRole ON User.Role_ID = UserRole.Role_ID
        LEFT JOIN Admin ON User.ID = Admin.User_ID
        LEFT JOIN Doctor ON User.ID = Doctor.ID
        LEFT JOIN Patient ON User.ID = Patient.ID
        WHERE User.Email = ?
    `;

    db.query(sql, [email], async (err, results) => {
        if (err) {
            console.error('❌ DB error:', err);
            return res.status(500).json({ error: 'Database error during login' });
        }

        if (results.length === 0) {
            console.log('❌ User not found:', email);
            return res.status(401).json({ error: 'Invalid email or password' });
        }

        const user = results[0];
        const match = await bcrypt.compare(password, user.Password);

        if (!match) {
            console.log('❌ Password mismatch for:', email);
            return res.status(401).json({ error: 'Invalid email or password' });
        }

        // Update last login
        db.query("UPDATE User SET Last_Login_Date = NOW() WHERE ID = ?", [user.ID], (updateErr) => {
            if (updateErr) console.warn('⚠️ Failed to update last login date:', updateErr);
        });

        // JWT payload
        const tokenPayload = {
            id: user.ID,
            role: user.Role_Name,
            organizationId: user.Organization_ID || null,
            worksAt: user.WorksAt || null,
            specialty: user.Specialty || null,
            blockchainID: user.BlockchainID || null
        };

        if (!SECRET_KEY) {
            return res.status(500).json({ error: 'JWT secret is not configured' });
        }

        const token = jwt.sign(tokenPayload, SECRET_KEY, { expiresIn: JWT_EXPIRES_IN });

        // User data to return
        const userData = {
            id: user.ID,
            name: `${user.First_Name} ${user.Last_Name}`,
            email: user.Email,
            role: user.Role_Name,
            organizationId: user.Organization_ID || null,
            worksAt: user.WorksAt || null,
            specialty: user.Specialty || null,
            blockchainID: user.BlockchainID || null
        };

        res.status(200).json({ token, user: userData });
    });
});


// Login
// app.post('/login', (req, res) => {
//     const { username, password } = req.body;

//     console.log('Login attempt:', username);

//     // Fetch user details along with role and organization ID (for admins only)
//     const sql = `
//         SELECT User.ID, User.First_Name, User.Last_Name, User.Email, User.Password, 
//                UserRole.Name AS Role_Name, 
//                COALESCE(Admin.Organization_ID, NULL) AS Organization_ID
//         FROM User 
//         INNER JOIN UserRole ON User.Role_ID = UserRole.Role_ID
//         LEFT JOIN Admin ON User.ID = Admin.User_ID  -- Join Admin table to get Organization_ID
//         WHERE User.Email = ?
//     `;

//     db.query(sql, [username], async (err, results) => {
//         if (err) {
//             console.error('Database error:', err);
//             return res.status(500).json({ error: 'Database error during login' });
//         }

//         if (results.length === 0) {
//             console.log('User not found:', username);
//             return res.status(401).json({ error: 'Invalid username or password' });
//         }

//         const user = results[0];

//         const passwordMatch = await bcrypt.compare(password, user.Password);

//         if (!passwordMatch) {
//             return res.status(401).json({ error: 'Invalid username or password' });
//         }

//         // Update Last_Login_Date
//         const updateLoginDateSQL = "UPDATE User SET Last_Login_Date = NOW() WHERE ID = ?";
//         db.query(updateLoginDateSQL, [user.ID], (updateErr) => {
//             if (updateErr) {
//                 console.error('Error updating Last_Login_Date:', updateErr);
//                 return res.status(500).json({ error: 'Error updating Last Login Date' });
//             }
//         });

//         const token = jwt.sign({ id: user.ID, role: user.Role_Name }, SECRET_KEY, { expiresIn: '1h' });

//         // Send user details including organization ID for admins
//         res.json({ 
//             token, 
//             user: { 
//                 id: user.ID, 
//                 name: `${user.First_Name} ${user.Last_Name}`, 
//                 role: user.Role_Name,
//                 organizationId: user.Organization_ID || null // Include organization ID only for admins
//             } 
//         });
//     });
// });


// app.post('/login', async (req, res) => {
//     const { email, password } = req.body;

//     console.log('Login attempt:', req.body);

//     const sql = `
//         SELECT User.ID, User.First_Name, User.Last_Name, User.Email, User.Password, 
//                UserRole.Name AS Role_Name, 
//                COALESCE(Admin.Organization_ID, NULL) AS Organization_ID,
//                COALESCE(Doctor.Works_At, NULL) AS WorksAt,
//                COALESCE(Doctor.Specialty, NULL) AS Specialty,
//                COALESCE(Doctor.Blockchain_ID, NULL) AS BlockchainID
//         FROM User 
//         INNER JOIN UserRole ON User.Role_ID = UserRole.Role_ID
//         LEFT JOIN Admin ON User.ID = Admin.User_ID  
//         LEFT JOIN Doctor ON User.ID = Doctor.ID  
//         WHERE User.Email = ?
//     `;

//     db.query(sql, [email], async (err, results) => {
//         if (err) {
//             console.error('Database error:', err);
//             return res.status(500).json({ error: 'Database error during login' });
//         }

//         if (results.length === 0) {
//             console.log('User not found:', email);
//             return res.status(401).json({ error: 'Invalid email' });
//         }

//         const user = results[0];

//         const passwordMatch = await bcrypt.compare(password, user.Password);
//         console.log('✅ Retrieved user:', user.Email);
//         console.log('🔐 Stored hash:', user.Password);
//         console.log('🔑 Input password:', password);
//         console.log('🔑 Password Match:', passwordMatch);

//         if (!passwordMatch) {
//             return res.status(401).json({ error: 'Invalid password' });
//         }

//         // Update Last_Login_Date
//         const updateLoginDateSQL = "UPDATE User SET Last_Login_Date = NOW() WHERE ID = ?";
//         db.query(updateLoginDateSQL, [user.ID], (updateErr) => {
//             if (updateErr) {
//                 console.error('Error updating Last_Login_Date:', updateErr);
//                 return res.status(500).json({ error: 'Error updating Last Login Date' });
//             }
//         });

//         // Construct user object based on role
//         const userData = {
//             id: user.ID,
//             name: `${user.First_Name} ${user.Last_Name}`,
//             role: user.Role_Name,
//             organizationId: user.Organization_ID || null, // Only for Admins
//             worksAt: user.WorksAt || null, // Only for Doctors
//             specialty: user.Specialty || null, // Only for Doctors
//             blockchainID: user.BlockchainID || null // Only for Doctors
//         };

//         // Create JWT token including blockchainID (for doctors)
//         const tokenPayload = { 
//             id: user.ID, 
//             role: user.Role_Name, 
//             blockchainID: user.BlockchainID || null 
//         };
//         const token = jwt.sign(tokenPayload, SECRET_KEY, { expiresIn: '1h' });

//         // Return token + user details
//         res.json({ token, user: userData });
//     });
// });




// Middleware to authenticate token



const getBearerToken = (req) => {
    const authHeader = req.headers['authorization'];
    if (!authHeader) return null;

    const [scheme, token] = authHeader.split(' ');
    return /^Bearer$/i.test(scheme) ? token : null;
};

const safeTokenEquals = (receivedToken, expectedToken) => {
    const received = Buffer.from(String(receivedToken || ''), 'utf8');
    const expected = Buffer.from(String(expectedToken || ''), 'utf8');

    if (received.length !== expected.length) {
        return false;
    }

    return crypto.timingSafeEqual(received, expected);
};

const authenticateToken = (req, res, next) => {
    const token = getBearerToken(req);

    if (!token) return sendApiError(res, 401, 'AUTH_REQUIRED', 'Access denied');

    if (!SECRET_KEY) {
        return sendApiError(res, 500, 'AUTH_CONFIGURATION_ERROR', 'JWT secret is not configured');
    }

    jwt.verify(token, SECRET_KEY, (err, user) => {
        if (err) return sendApiError(res, 403, 'INVALID_TOKEN', 'Invalid token');
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

const authorizeAdminRegistration = (req, res, next) => {
    const bootstrapToken = req.headers['x-bootstrap-token'];

    if (bootstrapToken) {
        if (!ADMIN_BOOTSTRAP_TOKEN || !safeTokenEquals(bootstrapToken, ADMIN_BOOTSTRAP_TOKEN)) {
            return res.status(403).json({ error: 'Invalid admin bootstrap token' });
        }

        req.user = { role: 'system', bootstrap: true };
        return next();
    }

    const token = getBearerToken(req);

    if (!token) {
        return res.status(401).json({ error: 'Admin registration requires an Admin/System token or configured bootstrap token' });
    }

    if (!SECRET_KEY) {
        return res.status(500).json({ error: 'JWT secret is not configured' });
    }

    try {
        const user = jwt.verify(token, SECRET_KEY);
        const userRole = normalizeRole(user?.role);

        if (!['admin', 'system'].includes(userRole)) {
            return res.status(403).json({ error: 'Forbidden: admin registration requires Admin/System permissions' });
        }

        req.user = user;
        return next();
    } catch (err) {
        return res.status(403).json({ error: 'Invalid token' });
    }
};

// Protected route example
app.get('/protected', authenticateToken, (req, res) => {
    res.json({ message: 'Access granted', user: req.user });
});


// Sync On-Chain Patients to Off-Chain MySQL
// Route to sync on-chain patients into MySQL Patient and User tables
app.post('/syncOnChainPatients', authenticateToken, requireRoles('admin', 'system'), async (req, res) => {
    if (!BLOCKCHAIN_API_URL) {
        return res.status(500).json({ error: 'Blockchain API URL is not configured' });
    }

    try {
        const response = await fetch(`${BLOCKCHAIN_API_URL}/getAllPatients`, {
            headers: { Authorization: req.headers.authorization }
        });
        const onChainPatients = await response.json();

        const insertPatient = (patient) => {
            return new Promise((resolve, reject) => {
                const blockchainPatientID = patient.patientID || patient.PatientID || patient.id || null;
                const selectSQL = 'SELECT * FROM Patient WHERE Emirates_ID = ? OR Blockchain_ID = ?';
                db.query(selectSQL, [patient.emiratesID, blockchainPatientID], async (err, results) => {
                    if (err) return reject(err);

                    if (results.length > 0) {
                        const existingPatient = results[0];

                        if (blockchainPatientID && existingPatient.Blockchain_ID && existingPatient.Blockchain_ID !== blockchainPatientID) {
                            return resolve(`Patient already exists with blockchain ID ${existingPatient.Blockchain_ID}`);
                        }

                        if (blockchainPatientID && !existingPatient.Blockchain_ID) {
                            const updatePatientSQL = 'UPDATE Patient SET Blockchain_ID = ? WHERE ID = ?';
                            db.query(updatePatientSQL, [blockchainPatientID, existingPatient.ID], (err) => {
                                if (err) return reject(err);
                                resolve(`Linked existing patient ${existingPatient.ID} to ${blockchainPatientID}`);
                            });
                            return;
                        }

                        return resolve('Patient already exists');
                    }

                    const insertUserSQL = `INSERT INTO User (First_Name, Last_Name, Email, Contact_Number, Password, Role_ID, Created_Date, IsActive) VALUES (?, ?, ?, ?, ?, ?, NOW(), 1)`;
                    const hashedPassword = await bcrypt.hash('DefaultPassword123!', 10); // Default password

                    db.query(insertUserSQL, [
                        patient.firstName,
                        patient.lastName,
                        patient.email,
                        patient.contactNumber,
                        hashedPassword,
                        4  // Role_ID for Patient
                    ], (err, userResult) => {
                        if (err) return reject(err);
                        const userId = userResult.insertId;

                        const insertPatientSQL = `INSERT INTO Patient (ID, Date_of_Birth, Gender, Emirates_ID, Blockchain_ID) VALUES (?, ?, ?, ?, ?)`;
                        db.query(insertPatientSQL, [
                            userId,
                            patient.dateOfBirth,
                            patient.gender,
                            patient.emiratesID,
                            blockchainPatientID
                        ], (err) => {
                            if (err) return reject(err);
                            resolve(`Inserted patient ${patient.firstName} ${patient.lastName}`);
                        });
                    });
                });
            });
        };

        const insertResults = [];
        for (const patient of onChainPatients) {
            try {
                const result = await insertPatient(patient);
                insertResults.push(result);
            } catch (err) {
                insertResults.push(`Error inserting ${patient.patientID}: ${err.message}`);
            }
        }

        res.json({ message: 'Sync complete', details: insertResults });
    } catch (error) {
        console.error('Error syncing patients:', error);
        res.status(500).json({ error: 'Failed to sync patients' });
    }
});


// Authentication APIs
// Register a new organization admin through an Admin/System JWT or deployment bootstrap token.
app.post('/register', authorizeAdminRegistration, async (req, res) => {
    const { firstName, lastName, username, contactNumber, password, organizationId } = req.body;
    const roleId = 2; // Hardcoded for Admin role (Only Admins can register)

    // Validate required fields
    if (!firstName || !lastName || !username || !contactNumber || !password || !organizationId) {
        return res.status(400).json({ error: 'Missing required fields' });
    }

    db.getConnection(async (connectionErr, connection) => {
        if (connectionErr) {
            console.error(connectionErr);
            return res.status(500).json({ error: 'Database connection error during registration' });
        }

        const query = (sql, params = []) => new Promise((resolve, reject) => {
            connection.query(sql, params, (err, result) => {
                if (err) reject(err);
                else resolve(result);
            });
        });
        const beginTransaction = () => new Promise((resolve, reject) => {
            connection.beginTransaction((err) => err ? reject(err) : resolve());
        });
        const commit = () => new Promise((resolve, reject) => {
            connection.commit((err) => err ? reject(err) : resolve());
        });
        const rollback = () => new Promise((resolve) => connection.rollback(() => resolve()));

        try {
            await beginTransaction();

            const existingUsers = await query("SELECT ID FROM User WHERE Email = ? LIMIT 1", [username]);
            if (existingUsers.length > 0) {
                await rollback();
                return res.status(400).json({ error: 'User already exists' });
            }

            const existingAdmins = await query(
                "SELECT User_ID FROM Admin WHERE Organization_ID = ? LIMIT 1",
                [organizationId]
            );
            if (existingAdmins.length > 0) {
                await rollback();
                return res.status(400).json({ error: 'An admin is already registered for this organization' });
            }

            const hashedPassword = await bcrypt.hash(password, 10);
            const insertUserSQL = `
                INSERT INTO User 
                (First_Name, Last_Name, Email, Contact_Number, Password, Role_ID, Created_Date, IsActive) 
                VALUES (?, ?, ?, ?, ?, ?, NOW(), 1)
            `;
            const userResult = await query(insertUserSQL, [
                firstName,
                lastName,
                username,
                contactNumber,
                hashedPassword,
                roleId
            ]);

            await query(
                `INSERT INTO Admin (User_ID, Organization_ID) VALUES (?, ?)`,
                [userResult.insertId, organizationId]
            );

            await commit();
            return res.json({ message: 'Admin registered successfully' });
        } catch (err) {
            await rollback();
            console.error(err);

            if (err.code === 'ER_DUP_ENTRY') {
                return res.status(400).json({ error: 'User or organization admin already exists' });
            }

            return res.status(500).json({ error: 'Error processing registration' });
        } finally {
            connection.release();
        }
    });
});

app.post('/registerDoctor', authenticateToken, requireRoles('admin'), async (req, res) => {
    const { firstName, lastName, username, contactNumber, password, worksAt, speciality, doctorID } = req.body;
    const roleId = 3; // Role ID for Doctor

    // Validate required fields
    if (!firstName || !lastName || !username || !contactNumber || !password || !worksAt || !speciality) {
        return res.status(400).json({ error: 'Missing required fields' });
    }

    try {
        // Check if the doctor already exists in the User table
        const checkUserSQL = "SELECT * FROM User WHERE Email = ?";
        db.query(checkUserSQL, [username], async (err, results) => {
            if (err) {
                console.error(err);
                return res.status(500).json({ error: 'Database error during user check' });
            }
            if (results.length > 0) {
                return res.status(400).json({ error: 'Doctor already exists' });
            }

            // Hash the password
            const hashedPassword = await bcrypt.hash(password, 10);

            // Insert into User table
            const insertUserSQL = `
                INSERT INTO User 
                (First_Name, Last_Name, Email, Contact_Number, Password, Role_ID, Created_Date, IsActive) 
                VALUES (?, ?, ?, ?, ?, ?, NOW(), 1)
            `;
            db.query(insertUserSQL, [firstName, lastName, username, contactNumber, hashedPassword, roleId], (err, result) => {
                if (err) {
                    console.error(err);
                    return res.status(500).json({ error: 'Database error during user registration' });
                }

                const userId = result.insertId; // Get the new doctor’s MySQL ID

                // If `doctorID` is provided, use it; otherwise, generate it as `Doctor<ID>`
                const blockchainDoctorID = doctorID || `Doctor${userId}`;

                // Insert into Doctor table with Blockchain ID
                const insertDoctorSQL = `INSERT INTO Doctor (ID, Works_At, Specialty, Blockchain_ID) VALUES (?, ?, ?, ?)`;
                db.query(insertDoctorSQL, [userId, worksAt, speciality, blockchainDoctorID], async (err) => {
                    if (err) {
                        console.error(err);
                        return res.status(500).json({ error: 'Database error during doctor registration' });
                    }

                    return res.json({ 
                        message: 'Doctor registered successfully in MySQL', 
                        doctorID: blockchainDoctorID 
                    });
                });
            });
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Error processing doctor registration' });
    }
});

const PATIENT_SELECT = `
    SELECT Patient.*, User.First_Name, User.Last_Name, User.Email, User.Contact_Number, User.Created_Date
    FROM Patient INNER JOIN User ON Patient.ID = User.ID`;

const validatePatientPayload = (body, isCreate = false) => {
    const required = ['firstName', 'lastName', 'dateOfBirth', 'gender', 'contactNumber', 'email', 'emiratesID',
        'nationality', 'address', 'bloodType', 'medicalHistory', 'allergies', 'medications', 'insuranceDetails', 'clinicID'];
    if (isCreate) required.push('password');
    const missing = required.filter((field) => body[field] === undefined || body[field] === null || body[field] === '');
    if (missing.length) {
        const error = new Error(`Missing required fields: ${missing.join(', ')}`);
        error.statusCode = 400;
        throw error;
    }
    if (!/^\S+@\S+\.\S+$/.test(body.email)) {
        const error = new Error('Invalid email address'); error.statusCode = 400; throw error;
    }
    if (!/^(A|B|AB|O)[+-]$/.test(body.bloodType)) {
        const error = new Error('Invalid blood type'); error.statusCode = 400; throw error;
    }
    const dob = new Date(body.dateOfBirth);
    if (Number.isNaN(dob.getTime()) || dob >= new Date()) {
        const error = new Error('Date of birth must be a valid past date'); error.statusCode = 400; throw error;
    }
    if (!Array.isArray(body.doctors || [])) {
        const error = new Error('doctors must be an array'); error.statusCode = 400; throw error;
    }
};

// Coordinated hybrid patient creation: MySQL is authoritative for PII; Fabric stores reference/hash only.
app.post('/patients', authenticateToken, requireRoles('admin'), async (req, res) => {
    let connection;
    try {
        validatePatientPayload(req.body, true);
        requireAdminClinic(req, req.body.clinicID);
        connection = await db.promise().getConnection();
        await connection.beginTransaction();
        const [duplicates] = await connection.query(
            'SELECT Patient.ID FROM Patient INNER JOIN User ON Patient.ID = User.ID WHERE Patient.Emirates_ID = ? OR User.Email = ? LIMIT 1',
            [req.body.emiratesID, req.body.email]
        );
        if (duplicates.length) { const error = new Error('Patient email or Emirates ID already exists'); error.statusCode = 409; throw error; }

        const passwordHash = await bcrypt.hash(req.body.password, 10);
        const [userResult] = await connection.query(
            'INSERT INTO User (First_Name, Last_Name, Password, Email, Contact_Number, Role_ID, Created_Date, IsActive) VALUES (?, ?, ?, ?, ?, ?, NOW(), 1)',
            [req.body.firstName, req.body.lastName, passwordHash, req.body.email, req.body.contactNumber, PATIENT_ROLE_ID]
        );
        const patientID = `Patient-${crypto.randomUUID()}`;
        await connection.query(`INSERT INTO Patient
            (ID, Date_of_Birth, Gender, Emirates_ID, Blockchain_ID, Nationality, Address, Blood_Type, Medical_History, Allergies, Medications, Insurance_Details, Clinic_ID, Doctors, Modified_Date)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`, [
            userResult.insertId, req.body.dateOfBirth, req.body.gender, req.body.emiratesID, patientID, req.body.nationality,
            req.body.address, req.body.bloodType, JSON.stringify(req.body.medicalHistory), JSON.stringify(req.body.allergies),
            JSON.stringify(req.body.medications), JSON.stringify(req.body.insuranceDetails), Number(req.body.clinicID),
            JSON.stringify(req.body.doctors || [])
        ]);
        const patient = { ...req.body, patientID, password: undefined };
        const dataHash = patientHash(patient);
        await callBlockchain(req, '/patient-metadata', 'POST', {
            patientID, clinicID: Number(req.body.clinicID), doctors: req.body.doctors || [],
            offChainRef: `mysql:Patient/${userResult.insertId}`, dataHash
        });
        await connection.commit();
        return res.status(201).json({ success: true, data: { ...patient, dataHash }, message: 'Patient created in MySQL and referenced on-chain' });
    } catch (error) {
        if (connection) await connection.rollback().catch(() => {});
        const status = error.statusCode || (error.code === 'ER_DUP_ENTRY' ? 409 : 500);
        return sendApiError(res, status, 'PATIENT_CREATE_FAILED', error.message);
    } finally { if (connection) connection.release(); }
});

app.get('/patients', authenticateToken, requireRoles('admin'), async (req, res) => {
    try {
        const rows = await query(`${PATIENT_SELECT} WHERE Patient.Clinic_ID = ? ORDER BY User.Last_Name, User.First_Name`, [req.user.organizationId]);
        return res.json({ success: true, data: rows.map(normalizePatient) });
    } catch (error) { return sendApiError(res, 500, 'PATIENT_LIST_FAILED', 'Unable to retrieve patients'); }
});

app.get('/patients/:id', authenticateToken, requireRoles('admin', 'patient'), async (req, res) => {
    try {
        const rows = await query(`${PATIENT_SELECT} WHERE Patient.Blockchain_ID = ? LIMIT 1`, [req.params.id]);
        if (!rows.length) return sendApiError(res, 404, 'PATIENT_NOT_FOUND', 'Patient not found');
        const patient = normalizePatient(rows[0]);
        if (normalizeRole(req.user.role) === 'patient' && req.user.blockchainID !== req.params.id) {
            return sendApiError(res, 403, 'PATIENT_OWNER_MISMATCH', 'Patients may retrieve only their own profile');
        }
        if (normalizeRole(req.user.role) === 'admin') requireAdminClinic(req, patient.clinicID);
        return res.json({ success: true, data: patient });
    } catch (error) { return sendApiError(res, error.statusCode || 500, 'PATIENT_READ_FAILED', error.message); }
});

app.put('/patients/:id', authenticateToken, requireRoles('admin'), async (req, res) => {
    let connection;
    try {
        validatePatientPayload(req.body);
        requireAdminClinic(req, req.body.clinicID);
        connection = await db.promise().getConnection(); await connection.beginTransaction();
        const [rows] = await connection.query(`${PATIENT_SELECT} WHERE Patient.Blockchain_ID = ? FOR UPDATE`, [req.params.id]);
        if (!rows.length) { const error = new Error('Patient not found'); error.statusCode = 404; throw error; }
        requireAdminClinic(req, rows[0].Clinic_ID);
        await connection.query('UPDATE User SET First_Name=?, Last_Name=?, Email=?, Contact_Number=? WHERE ID=?',
            [req.body.firstName, req.body.lastName, req.body.email, req.body.contactNumber, rows[0].ID]);
        await connection.query(`UPDATE Patient SET Date_of_Birth=?, Gender=?, Emirates_ID=?, Nationality=?, Address=?, Blood_Type=?,
            Medical_History=?, Allergies=?, Medications=?, Insurance_Details=?, Clinic_ID=?, Doctors=?, Modified_Date=NOW() WHERE ID=?`, [
            req.body.dateOfBirth, req.body.gender, req.body.emiratesID, req.body.nationality, req.body.address, req.body.bloodType,
            JSON.stringify(req.body.medicalHistory), JSON.stringify(req.body.allergies), JSON.stringify(req.body.medications),
            JSON.stringify(req.body.insuranceDetails), Number(req.body.clinicID), JSON.stringify(req.body.doctors || []), rows[0].ID
        ]);
        const patient = { ...req.body, patientID: req.params.id };
        const dataHash = patientHash(patient);
        await callBlockchain(req, `/patient-metadata/${encodeURIComponent(req.params.id)}`, 'PUT', {
            clinicID: Number(req.body.clinicID), doctors: req.body.doctors || [], offChainRef: `mysql:Patient/${rows[0].ID}`, dataHash
        });
        await connection.commit();
        return res.json({ success: true, data: { ...patient, dataHash }, message: 'Patient updated consistently' });
    } catch (error) {
        if (connection) await connection.rollback().catch(() => {});
        return sendApiError(res, error.statusCode || (error.code === 'ER_DUP_ENTRY' ? 409 : 500), 'PATIENT_UPDATE_FAILED', error.message);
    } finally { if (connection) connection.release(); }
});

app.post('/patients/:id/assign', authenticateToken, requireRoles('admin'), async (req, res) => {
    let connection;
    try {
        if (!req.body.doctorID) return sendApiError(res, 400, 'VALIDATION_ERROR', 'doctorID is required');
        connection = await db.promise().getConnection(); await connection.beginTransaction();
        const [rows] = await connection.query(`${PATIENT_SELECT} WHERE Patient.Blockchain_ID = ? FOR UPDATE`, [req.params.id]);
        if (!rows.length) { const error = new Error('Patient not found'); error.statusCode = 404; throw error; }
        const current = normalizePatient(rows[0]); requireAdminClinic(req, current.clinicID);
        const doctors = [...new Set([...(current.doctors || []), String(req.body.doctorID)])];
        await connection.query('UPDATE Patient SET Doctors=?, Modified_Date=NOW() WHERE ID=?', [JSON.stringify(doctors), rows[0].ID]);
        const updated = { ...current, doctors };
        await callBlockchain(req, `/patient-metadata/${encodeURIComponent(req.params.id)}`, 'PUT', {
            clinicID: Number(current.clinicID), doctors, offChainRef: `mysql:Patient/${rows[0].ID}`, dataHash: patientHash(updated)
        });
        await connection.commit();
        return res.json({ success: true, data: { patientID: req.params.id, doctors }, message: 'Patient assigned to doctor' });
    } catch (error) {
        if (connection) await connection.rollback().catch(() => {});
        return sendApiError(res, error.statusCode || 500, 'PATIENT_ASSIGN_FAILED', error.message);
    } finally { if (connection) connection.release(); }
});

app.delete('/patients/:id', authenticateToken, requireRoles('admin'), async (req, res) => {
    let connection;
    try {
        connection = await db.promise().getConnection(); await connection.beginTransaction();
        const [rows] = await connection.query(`${PATIENT_SELECT} WHERE Patient.Blockchain_ID = ? FOR UPDATE`, [req.params.id]);
        if (!rows.length) { const error = new Error('Patient not found'); error.statusCode = 404; throw error; }
        requireAdminClinic(req, rows[0].Clinic_ID);
        await callBlockchain(req, `/patient-metadata/${encodeURIComponent(req.params.id)}`, 'DELETE');
        await connection.query('DELETE FROM Patient WHERE ID=?', [rows[0].ID]);
        await connection.query('DELETE FROM User WHERE ID=?', [rows[0].ID]);
        await connection.commit();
        return res.json({ success: true, data: { patientID: req.params.id, deleted: true }, message: 'Patient deleted from Fabric and MySQL' });
    } catch (error) {
        if (connection) await connection.rollback().catch(() => {});
        return sendApiError(res, error.statusCode || 500, 'PATIENT_DELETE_FAILED', `${error.message}; no MySQL deletion was committed`);
    } finally { if (connection) connection.release(); }
});

// Legacy list retained for existing clients, now clinic-scoped and PII sourced only from MySQL.
app.get('/Patient', authenticateToken, requireRoles('admin'), async (req, res) => {
    try {
        const rows = await query(`${PATIENT_SELECT} WHERE Patient.Clinic_ID = ?`, [req.user.organizationId]);
        return res.json(rows.map(normalizePatient));
    } catch (error) { return sendApiError(res, 500, 'PATIENT_LIST_FAILED', 'Unable to retrieve patients'); }
});

// Route to fetch Appointments
app.get('/Appointment', authenticateToken, requireRoles('admin', 'doctor', 'patient'), (req, res) => {
    const sql = "SELECT * FROM Appointment";
    db.query(sql, (err, data) => {
        if (err) {
            console.error('Error executing query:', err);
            return res.status(500).json({ error: 'Database query failed' });
        }
        return res.json(data);
    });
});

// Route to fetch Doctors
app.get('/Doctor', authenticateToken, requireRoles('admin', 'doctor'), (req, res) => {
    const sql = "SELECT * FROM Doctor";
    db.query(sql, (err, data) => {
        if (err) {
            console.error('Error executing query:', err);
            return res.status(500).json({ error: 'Database query failed' });
        }
        return res.json(data);
    });
});

// Route to fetch Lab Results
app.get('/Lab_Results', authenticateToken, requireRoles('admin', 'doctor'), (req, res) => {
    // Sample test data
    const testData = [
        {
            ID: 1,
            T_Name: 'Hemoglobin Test',
            Order_ID: 1001,
            Case_ID: 501,
            Site_ID: 101,
            Discipline: 'Hematology',
            Status: 'Completed',
            Created_Date: '2024-08-01'
        },
        {
            ID: 2,
            T_Name: 'Lipid Panel',
            Order_ID: 1002,
            Case_ID: 502,
            Site_ID: 102,
            Discipline: 'Cardiology',
            Status: 'In Progress',
            Created_Date: '2024-09-15'
        },
        {
            ID: 3,
            T_Name: 'Complete Blood Count',
            Order_ID: 1003,
            Case_ID: 503,
            Site_ID: 103,
            Discipline: 'Hematology',
            Status: 'Completed',
            Created_Date: '2024-07-25'
        },
        {
            ID: 4,
            T_Name: 'Kidney Function Test',
            Order_ID: 1004,
            Case_ID: 504,
            Site_ID: 104,
            Discipline: 'Nephrology',
            Status: 'Pending',
            Created_Date: '2024-10-01'
        },
        {
            ID: 5,
            T_Name: 'Liver Function Test',
            Order_ID: 1005,
            Case_ID: 505,
            Site_ID: 105,
            Discipline: 'Gastroenterology',
            Status: 'Completed',
            Created_Date: '2024-06-10'
        },
        {
            ID: 6,
            T_Name: 'Thyroid Function Test',
            Order_ID: 1006,
            Case_ID: 506,
            Site_ID: 106,
            Discipline: 'Endocrinology',
            Status: 'Pending',
            Created_Date: '2024-07-22'
        }
    ];

    // Log the test data
    console.log('Lab Results fetched (test data):', testData);
    
    // Send the test data as a response
    res.json(testData);
});

// Route to fetch all users
app.get('/users', authenticateToken, requireRoles('admin'), (req, res) => {
    const sql = `
        SELECT 
            ID, First_Name, Last_Name, Email, Contact_Number, Role_ID, Created_Date, IsActive, Last_Login_Date 
        FROM User
    `;
    db.query(sql, (err, results) => {
        if (err) {
            console.error('Error fetching users:', err);
            return res.status(500).json({ error: 'Database query failed' });
        }
        return res.json(results);
    });
});

// Start the server
// app.listen(8080, () => {
//     console.log("listening on port 8080");
// }); 
const PORT = process.env.PORT || 8080;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`listening on port ${PORT}`);
});
