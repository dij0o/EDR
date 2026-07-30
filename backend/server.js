const express = require('express');
const mysql = require('mysql2');
const cors = require('cors');
const bcrypt = require('bcrypt');
const crypto = require('crypto');
require('dotenv').config();
const {
    ACCESS_COOKIE, REFRESH_COOKIE, CSRF_COOKIE, hash: hashSessionSecret,
    sqlDate, sessionTtls, signAccessToken, verifyAccessToken, createSession,
    setWebSessionCookies, clearWebSessionCookies, parseCookies, base64UrlSecret,
} = require('./sessionService');

const app = express();
const BLOCKCHAIN_API_URL = process.env.BLOCKCHAIN_API_URL?.replace(/\/+$/, '');
const BLOCKCHAIN_INTERNAL_TOKEN = process.env.BLOCKCHAIN_INTERNAL_TOKEN;
const PATIENT_ROLE_ID = 4;
const DOCTOR_ROLE_ID = 3;
const ADMIN_ROLE_ID = 2;

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

const clinicalHash = (payload) => crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex');
const validateClinicalPayload = (recordType, payload) => {
    if (!['medical', 'dental'].includes(recordType)) { const error = new Error('recordType must be medical or dental'); error.statusCode = 400; throw error; }
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) { const error = new Error('payload must be an object'); error.statusCode = 400; throw error; }
    const required = recordType === 'medical' ? ['medicalHistory', 'allergies', 'labResults', 'medications']
        : ['treatmentPhase', 'procedureCode', 'tooth', 'ceramicType', 'prescriptions', 'diagnostics'];
    const missing = required.filter((field) => payload[field] === undefined || payload[field] === null || payload[field] === '');
    if (missing.length) { const error = new Error(`Missing required clinical fields: ${missing.join(', ')}`); error.statusCode = 400; throw error; }
};

const blockchainHeaders = (req, contentType = 'application/json', extraHeaders = {}) => ({
    ...(contentType ? { 'Content-Type': contentType } : {}),
    Authorization: `Bearer ${req.accessToken || getBearerToken(req) || ''}`,
    'X-EDR-Internal-Token': BLOCKCHAIN_INTERNAL_TOKEN || '',
    'X-Correlation-ID': req.get('x-correlation-id') || crypto.randomUUID(),
    ...extraHeaders,
});

const callBlockchainResponse = async (req, path, method = 'GET', body, contentType = 'application/json', extraHeaders = {}) => {
    if (!BLOCKCHAIN_API_URL) {
        const error = new Error('Blockchain API URL is not configured');
        error.statusCode = 503;
        throw error;
    }
    return fetch(`${BLOCKCHAIN_API_URL}${path}`, {
        method,
        headers: blockchainHeaders(req, contentType, extraHeaders),
        body: body === undefined ? undefined : (Buffer.isBuffer(body) ? body : JSON.stringify(body)),
    });
};

const callBlockchain = async (req, path, method, body) => {
    const response = await callBlockchainResponse(req, path, method, body);
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
        const error = new Error(payload?.error?.message || payload?.error || 'Blockchain operation failed');
        error.statusCode = response.status;
        throw error;
    }
    return payload.data ?? payload;
};

const provisionFabricIdentity = (req, role, actorID, clinicID) => callBlockchain(
    req,
    '/internal/identities',
    'POST',
    { role, actorID, clinicID },
);

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
    credentials: true,
    optionsSuccessStatus: 200
};
const allowedWebOrigins = Array.isArray(corsOptions.origin) ? corsOptions.origin : [corsOptions.origin].filter(Boolean);
const hasAllowedWebOrigin = (req) => allowedWebOrigins.includes(req.get('origin'));

if (process.env.NODE_ENV === 'production' && (!process.env.CORS_ORIGIN || process.env.CORS_ORIGIN === '*')) {
    throw new Error('Production CORS_ORIGIN must be an explicit allow-list');
}

if (!BLOCKCHAIN_API_URL) {
    console.warn('BLOCKCHAIN_API_URL is not configured. /syncOnChainPatients will return a configuration error.');
}
if (process.env.NODE_ENV === 'production' && !BLOCKCHAIN_INTERNAL_TOKEN) {
    throw new Error('BLOCKCHAIN_INTERNAL_TOKEN is required in production');
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

const sessionRetentionDays = Math.max(1, Number(process.env.SESSION_RETENTION_DAYS || 90));
setInterval(async () => {
    try {
        await query(`DELETE FROM Auth_Session_Event
            WHERE Occurred_At < DATE_SUB(NOW(3), INTERVAL ? DAY)`, [sessionRetentionDays]);
        await query(`DELETE FROM Auth_Refresh_Token
            WHERE Expires_At < DATE_SUB(NOW(3), INTERVAL ? DAY)`, [sessionRetentionDays]);
        await query(`DELETE FROM Auth_Session
            WHERE Absolute_Expires_At < DATE_SUB(NOW(3), INTERVAL ? DAY)`, [sessionRetentionDays]);
    } catch (error) {
        console.warn('Session cleanup skipped:', error.message);
    }
}, 6 * 60 * 60 * 1000).unref();

app.get('/health', (req, res) => {
    db.query(`SELECT (
        (SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE()
            AND TABLE_NAME IN ('Auth_Session','Auth_Refresh_Token','Auth_Session_Event','Schema_Migration'))=4
        AND (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='User'
            AND COLUMN_NAME IN ('Security_Version','Sessions_Invalid_Before'))=2
        AND EXISTS (SELECT 1 FROM Schema_Migration WHERE Migration_ID='2026-07-29-secure-auth-sessions')
    ) AS ready`, (error, rows) => {
        if (error) {
            return res.status(503).json({ status: 'not-ready', service: 'database-api', database: false, sessionSchema: false });
        }
        const sessionSchema = Boolean(rows[0]?.ready);
        return res.status(sessionSchema ? 200 : 503).json({
            status: sessionSchema ? 'ok' : 'not-ready', service: 'database-api', database: true, sessionSchema,
        });
    });
});

const authRateBuckets = new Map();
setInterval(() => {
    const now = Date.now();
    for (const [key, bucket] of authRateBuckets) if (bucket.resetAt <= now) authRateBuckets.delete(key);
}, 15 * 60 * 1000).unref();
const authRateLimit = (name, limit, windowMs) => (req, res, next) => {
    const key = `${name}:${req.ip}:${String(req.body?.email || '').trim().toLowerCase()}`;
    const now = Date.now();
    const bucket = authRateBuckets.get(key);
    if (!bucket || bucket.resetAt <= now) {
        authRateBuckets.set(key, { count: 1, resetAt: now + windowMs });
        return next();
    }
    bucket.count += 1;
    if (bucket.count > limit) {
        res.set('Retry-After', String(Math.ceil((bucket.resetAt - now) / 1000)));
        return sendApiError(res, 429, 'AUTH_RATE_LIMITED', 'Too many authentication attempts');
    }
    return next();
};

app.post('/login', authRateLimit('login', 10, 15 * 60 * 1000), async (req, res) => {
    const { email, password } = req.body;

    // Input check
    if (!email || !password) {
        return res.status(400).json({ error: "Email and password are required" });
    }

    console.log('🔐 Login attempt:', email);

    const sql = `
        SELECT 
            User.ID, User.First_Name, User.Last_Name, User.Email, User.Password, 
            UserRole.Name AS Role_Name, User.Must_Change_Password, User.Security_Version, User.IsActive,
            Organization.IsActive AS Clinic_IsActive,
            COALESCE(Admin.Organization_ID, NULL) AS Organization_ID,
            COALESCE(Doctor.Works_At, NULL) AS WorksAt,
            COALESCE(Doctor.Specialty, NULL) AS Specialty,
            COALESCE(Doctor.Blockchain_ID, Patient.Blockchain_ID, NULL) AS BlockchainID
        FROM User 
        INNER JOIN UserRole ON User.Role_ID = UserRole.Role_ID
        LEFT JOIN Admin ON User.ID = Admin.User_ID
        LEFT JOIN Organization ON Admin.Organization_ID = Organization.Organization_ID
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
        if (!user.IsActive) return res.status(403).json({ error: 'Account is inactive' });
        if (normalizeRole(user.Role_Name) === 'admin' && !user.Clinic_IsActive) return res.status(403).json({ error: 'Clinic is inactive' });
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
            role: normalizeRole(user.Role_Name),
            organizationId: user.Organization_ID || null,
            worksAt: user.WorksAt || null,
            specialty: user.Specialty || null,
            blockchainID: user.BlockchainID || null,
            mustChangePassword: Boolean(user.Must_Change_Password),
            securityVersion: Number(user.Security_Version || 1)
        };

        // User data to return
        const userData = {
            id: user.ID,
            name: `${user.First_Name} ${user.Last_Name}`,
            email: user.Email,
            role: normalizeRole(user.Role_Name),
            organizationId: user.Organization_ID || null,
            worksAt: user.WorksAt || null,
            specialty: user.Specialty || null,
            blockchainID: user.BlockchainID || null,
            mustChangePassword: Boolean(user.Must_Change_Password)
        };
        let connection;
        try {
            connection = await db.promise().getConnection();
            await connection.beginTransaction();
            const session = await createSession(connection, tokenPayload, {
                clientType: req.body.clientType || 'web',
                deviceLabel: req.body.deviceLabel,
                ip: req.ip,
                userAgent: req.get('user-agent'),
            });
            await connection.commit();
            res.set('Cache-Control', 'no-store');
            if ((req.body.clientType || 'web') === 'web') {
                setWebSessionCookies(res, session);
                return res.status(200).json({ user: userData, csrfToken: session.csrfToken });
            }
            return res.status(200).json({
                token: session.accessToken,
                refreshToken: session.refreshToken,
                user: userData,
            });
        } catch (sessionError) {
            if (connection) await connection.rollback().catch(() => {});
            console.error('Session creation failed:', sessionError);
            return sendApiError(res, sessionError.statusCode || 500, sessionError.code || 'SESSION_CREATE_FAILED', 'Unable to create a secure session');
        } finally {
            if (connection) connection.release();
        }
    });
});

const getBearerToken = (req) => {
    const authHeader = req.headers.authorization;
    if (!authHeader) return null;

    const [scheme, token] = authHeader.split(' ');
    return /^Bearer$/i.test(scheme) ? token : null;
};

const getAccessToken = (req) => {
    const bearer = getBearerToken(req);
    if (bearer) return { token: bearer, mode: 'bearer' };
    const token = parseCookies(req.headers.cookie || '')[ACCESS_COOKIE];
    return token ? { token, mode: 'cookie' } : { token: null, mode: null };
};

const authenticateToken = async (req, res, next) => {
    const credentials = getAccessToken(req);
    if (!credentials.token) return sendApiError(res, 401, 'AUTH_REQUIRED', 'Access denied');
    try {
        const user = verifyAccessToken(credentials.token);
        const rows = await query(`SELECT s.Session_ID, s.Security_Version, s.Csrf_Token_Hash, s.Idle_Expires_At, s.Absolute_Expires_At,
            s.Revoked_At, u.IsActive, u.Security_Version AS User_Security_Version,
            u.Sessions_Invalid_Before, ur.Name AS Current_Role, COALESCE(o.IsActive,1) AS Clinic_IsActive
            FROM Auth_Session s JOIN User u ON u.ID=s.User_ID JOIN UserRole ur ON ur.Role_ID=u.Role_ID
            LEFT JOIN Admin a ON a.User_ID=u.ID LEFT JOIN Organization o ON o.Organization_ID=a.Organization_ID
            WHERE s.Session_ID=? AND s.User_ID=? LIMIT 1`, [user.sid, user.id]);
        const session = rows[0];
        const now = Date.now();
        if (!session || session.Revoked_At || !session.IsActive || !session.Clinic_IsActive
            || new Date(session.Idle_Expires_At).getTime() <= now || new Date(session.Absolute_Expires_At).getTime() <= now
            || Number(session.Security_Version) !== Number(session.User_Security_Version)
            || Number(user.securityVersion) !== Number(session.User_Security_Version)
            || (session.Sessions_Invalid_Before && user.iat < Math.floor(new Date(session.Sessions_Invalid_Before).getTime() / 1000))) {
            return sendApiError(res, 401, 'SESSION_REVOKED', 'Session is no longer active');
        }
        if (normalizeRole(session.Current_Role) !== normalizeRole(user.role)) {
            return sendApiError(res, 401, 'SESSION_STALE', 'Session claims are no longer current');
        }
        req.authMode = credentials.mode;
        req.accessToken = credentials.token;
        res.set('Cache-Control', 'private, no-store');
        if (credentials.mode === 'cookie' && !['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
            if (!hasAllowedWebOrigin(req)) {
                return sendApiError(res, 403, 'ORIGIN_VALIDATION_FAILED', 'Request origin is not permitted');
            }
            const csrf = req.get('x-csrf-token');
            if (!csrf || hashSessionSecret(csrf) !== session.Csrf_Token_Hash) {
                return sendApiError(res, 403, 'CSRF_VALIDATION_FAILED', 'CSRF validation failed');
            }
        }
        if (user.mustChangePassword && !['/change-password', '/auth/logout', '/auth/me'].includes(req.path)) {
            return sendApiError(res, 403, 'PASSWORD_CHANGE_REQUIRED', 'Password change is required before continuing');
        }
        req.user = user;
        next();
    } catch (error) {
        return sendApiError(res, error.statusCode || 403, error.code || 'INVALID_TOKEN', 'Invalid or expired session');
    }
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

const loadSessionUser = async (connection, sessionID) => {
    const [rows] = await connection.query(`SELECT u.ID, u.IsActive, u.Must_Change_Password, u.Security_Version,
        ur.Name AS Role_Name, COALESCE(a.Organization_ID,NULL) AS Organization_ID,
        COALESCE(d.Works_At,NULL) AS WorksAt, COALESCE(d.Specialty,NULL) AS Specialty,
        COALESCE(d.Blockchain_ID,p.Blockchain_ID,NULL) AS BlockchainID,
        COALESCE(o.IsActive,1) AS Clinic_IsActive
        FROM Auth_Session s JOIN User u ON u.ID=s.User_ID JOIN UserRole ur ON ur.Role_ID=u.Role_ID
        LEFT JOIN Admin a ON a.User_ID=u.ID LEFT JOIN Organization o ON o.Organization_ID=a.Organization_ID
        LEFT JOIN Doctor d ON d.ID=u.ID LEFT JOIN Patient p ON p.ID=u.ID
        WHERE s.Session_ID=? LIMIT 1`, [sessionID]);
    if (!rows.length || !rows[0].IsActive || !rows[0].Clinic_IsActive) return null;
    const row = rows[0];
    return {
        id: row.ID, role: normalizeRole(row.Role_Name), organizationId: row.Organization_ID || null,
        worksAt: row.WorksAt || null, specialty: row.Specialty || null, blockchainID: row.BlockchainID || null,
        mustChangePassword: Boolean(row.Must_Change_Password), securityVersion: Number(row.Security_Version || 1),
    };
};

app.post('/auth/refresh', authRateLimit('refresh', 60, 5 * 60 * 1000), async (req, res) => {
    const cookies = parseCookies(req.headers.cookie || '');
    const webToken = cookies[REFRESH_COOKIE];
    const webCsrf = req.get('x-csrf-token');
    const refreshToken = webToken || req.body?.refreshToken;
    if (!refreshToken) return sendApiError(res, 401, 'REFRESH_REQUIRED', 'Refresh token is required');
    if (webToken) {
        if (!hasAllowedWebOrigin(req)) return sendApiError(res, 403, 'ORIGIN_VALIDATION_FAILED', 'Request origin is not permitted');
        if (!webCsrf || webCsrf !== cookies[CSRF_COOKIE]) return sendApiError(res, 403, 'CSRF_VALIDATION_FAILED', 'CSRF validation failed');
    }
    let connection;
    try {
        connection = await db.promise().getConnection(); await connection.beginTransaction();
        const [tokens] = await connection.query(`SELECT rt.*, rt.Revoked_At AS Token_Revoked_At,
            s.Client_Type, s.Idle_Expires_At, s.Absolute_Expires_At,
            s.Revoked_At AS Session_Revoked_At, s.Security_Version, s.Csrf_Token_Hash
            FROM Auth_Refresh_Token rt JOIN Auth_Session s ON s.Session_ID=rt.Session_ID
            WHERE rt.Token_Hash=? FOR UPDATE`, [hashSessionSecret(refreshToken)]);
        const current = tokens[0];
        if (!current) throw Object.assign(new Error('Invalid refresh token'), { statusCode: 401, code: 'INVALID_REFRESH_TOKEN' });
        if (webToken && hashSessionSecret(webCsrf) !== current.Csrf_Token_Hash) {
            throw Object.assign(new Error('CSRF validation failed'), { statusCode: 403, code: 'CSRF_VALIDATION_FAILED' });
        }
        if (current.Used_At) {
            await connection.query(`UPDATE Auth_Session SET Revoked_At=NOW(3),Revocation_Reason='refresh token reuse detected'
                WHERE Session_ID=? AND Revoked_At IS NULL`, [current.Session_ID]);
            await connection.query('UPDATE Auth_Refresh_Token SET Revoked_At=COALESCE(Revoked_At,NOW(3)) WHERE Session_ID=?', [current.Session_ID]);
            await connection.query(`INSERT INTO Auth_Session_Event (Session_ID,User_ID,Event_Type,Details)
                SELECT Session_ID,User_ID,'REFRESH_REUSE_DETECTED',JSON_OBJECT('tokenId',?) FROM Auth_Session WHERE Session_ID=?`,
            [current.Token_ID, current.Session_ID]);
            await connection.commit();
            return sendApiError(res, 401, 'REFRESH_TOKEN_REUSE', 'Session revoked because refresh-token reuse was detected');
        }
        const now = Date.now();
        if (current.Token_Revoked_At || current.Session_Revoked_At || new Date(current.Expires_At).getTime() <= now
            || new Date(current.Idle_Expires_At).getTime() <= now || new Date(current.Absolute_Expires_At).getTime() <= now) {
            throw Object.assign(new Error('Refresh session expired or revoked'), { statusCode: 401, code: 'SESSION_REVOKED' });
        }
        const user = await loadSessionUser(connection, current.Session_ID);
        if (!user || Number(user.securityVersion) !== Number(current.Security_Version)) {
            throw Object.assign(new Error('Session claims are stale'), { statusCode: 401, code: 'SESSION_STALE' });
        }
        const replacementID = crypto.randomUUID();
        const replacement = base64UrlSecret();
        const ttl = sessionTtls(current.Client_Type);
        const absolute = new Date(current.Absolute_Expires_At);
        const idle = new Date(Math.min(now + ttl.idle, absolute.getTime()));
        await connection.query('UPDATE Auth_Refresh_Token SET Used_At=NOW(3),Replaced_By_Token_ID=? WHERE Token_ID=?', [replacementID, current.Token_ID]);
        await connection.query(`INSERT INTO Auth_Refresh_Token
            (Token_ID,Session_ID,Token_Hash,Parent_Token_ID,Expires_At) VALUES (?,?,?,?,?)`,
        [replacementID, current.Session_ID, hashSessionSecret(replacement), current.Token_ID, sqlDate(absolute)]);
        const csrfToken = current.Client_Type === 'web' ? base64UrlSecret() : null;
        await connection.query(`UPDATE Auth_Session SET Last_Seen_At=NOW(3),Idle_Expires_At=?,Last_IP_Hash=?,
            Csrf_Token_Hash=COALESCE(?,Csrf_Token_Hash) WHERE Session_ID=?`,
        [sqlDate(idle), req.ip ? hashSessionSecret(req.ip) : null, csrfToken ? hashSessionSecret(csrfToken) : null, current.Session_ID]);
        await connection.query(`INSERT INTO Auth_Session_Event (Session_ID,User_ID,Event_Type)
            SELECT Session_ID,User_ID,'SESSION_REFRESHED' FROM Auth_Session WHERE Session_ID=?`, [current.Session_ID]);
        const session = {
            accessToken: signAccessToken(user, current.Session_ID), refreshToken: replacement,
            csrfToken, refreshExpires: absolute,
        };
        await connection.commit();
        res.set('Cache-Control', 'no-store');
        if (current.Client_Type === 'web') {
            setWebSessionCookies(res, session);
            return res.json({ csrfToken });
        }
        return res.json({ token: session.accessToken, refreshToken: replacement });
    } catch (error) {
        if (connection) await connection.rollback().catch(() => {});
        return sendApiError(res, error.statusCode || 500, error.code || 'REFRESH_FAILED', error.statusCode ? error.message : 'Unable to refresh session');
    } finally { if (connection) connection.release(); }
});

app.post('/auth/logout', async (req, res) => {
    const cookies = parseCookies(req.headers.cookie || '');
    const webRefresh = cookies[REFRESH_COOKIE];
    if (webRefresh) {
        if (!hasAllowedWebOrigin(req)) return sendApiError(res, 403, 'ORIGIN_VALIDATION_FAILED', 'Request origin is not permitted');
        const csrf = req.get('x-csrf-token');
        if (!csrf || csrf !== cookies[CSRF_COOKIE]) return sendApiError(res, 403, 'CSRF_VALIDATION_FAILED', 'CSRF validation failed');
    }
    let sessionID = null;
    const access = getAccessToken(req).token;
    if (access) {
        try { sessionID = verifyAccessToken(access).sid; } catch { /* refresh token fallback handles expired access */ }
    }
    const refreshToken = webRefresh || req.body?.refreshToken;
    if (!sessionID && refreshToken) {
        const rows = await query('SELECT Session_ID FROM Auth_Refresh_Token WHERE Token_Hash=? LIMIT 1', [hashSessionSecret(refreshToken)]);
        sessionID = rows[0]?.Session_ID || null;
    }
    if (sessionID) {
        await query(`UPDATE Auth_Session SET Revoked_At=COALESCE(Revoked_At,NOW(3)),Revocation_Reason=COALESCE(Revocation_Reason,'user logout')
            WHERE Session_ID=?`, [sessionID]);
        await query('UPDATE Auth_Refresh_Token SET Revoked_At=COALESCE(Revoked_At,NOW(3)) WHERE Session_ID=?', [sessionID]);
        await query(`INSERT INTO Auth_Session_Event (Session_ID,User_ID,Event_Type)
            SELECT Session_ID,User_ID,'SESSION_LOGOUT' FROM Auth_Session WHERE Session_ID=?`, [sessionID]);
    }
    clearWebSessionCookies(res);
    return res.status(204).end();
});

app.get('/auth/me', authenticateToken, async (req, res) => {
    const rows = await query('SELECT First_Name,Last_Name,Email FROM User WHERE ID=? LIMIT 1', [req.user.id]);
    if (!rows.length) return sendApiError(res, 404, 'USER_NOT_FOUND', 'User not found');
    return res.json({ success: true, data: { id: req.user.id, name: `${rows[0].First_Name} ${rows[0].Last_Name}`, email: rows[0].Email,
        role: normalizeRole(req.user.role), organizationId: req.user.organizationId || null, blockchainID: req.user.blockchainID || null,
        mustChangePassword: Boolean(req.user.mustChangePassword) } });
});

app.post('/auth/logout-all', authenticateToken, async (req, res) => {
    const currentPassword = req.body?.currentPassword;
    const rows = await query('SELECT Password FROM User WHERE ID=? AND IsActive=1 LIMIT 1', [req.user.id]);
    if (!currentPassword || !rows.length || !(await bcrypt.compare(currentPassword, rows[0].Password))) {
        return sendApiError(res, 401, 'RECENT_AUTH_REQUIRED', 'Current password is required');
    }
    await query(`UPDATE User SET Security_Version=Security_Version+1,Sessions_Invalid_Before=NOW(3) WHERE ID=?`, [req.user.id]);
    await query(`UPDATE Auth_Session SET Revoked_At=COALESCE(Revoked_At,NOW(3)),Revocation_Reason=COALESCE(Revocation_Reason,'user logout all')
        WHERE User_ID=?`, [req.user.id]);
    await query(`INSERT INTO Auth_Session_Event (Session_ID,User_ID,Event_Type)
        VALUES (NULL,?,'LOGOUT_ALL')`, [req.user.id]);
    clearWebSessionCookies(res);
    return res.status(204).end();
});

app.get('/auth/sessions', authenticateToken, async (req, res) => {
    const rows = await query(`SELECT Session_ID,Client_Type,Device_Label,Created_At,Last_Seen_At,Idle_Expires_At,Absolute_Expires_At
        FROM Auth_Session WHERE User_ID=? AND Revoked_At IS NULL AND Idle_Expires_At>NOW(3) AND Absolute_Expires_At>NOW(3)
        ORDER BY Last_Seen_At DESC`, [req.user.id]);
    return res.json({ success: true, data: rows.map((row) => ({
        sessionId: row.Session_ID, clientType: row.Client_Type, deviceLabel: row.Device_Label,
        createdAt: row.Created_At, lastSeenAt: row.Last_Seen_At, idleExpiresAt: row.Idle_Expires_At,
        absoluteExpiresAt: row.Absolute_Expires_At, current: row.Session_ID === req.user.sid,
    })) });
});

app.delete('/auth/sessions/:sessionId', authenticateToken, async (req, res) => {
    const result = await query(`UPDATE Auth_Session SET Revoked_At=COALESCE(Revoked_At,NOW(3)),
        Revocation_Reason=COALESCE(Revocation_Reason,'user device revocation') WHERE Session_ID=? AND User_ID=?`,
    [req.params.sessionId, req.user.id]);
    if (!result.affectedRows) return sendApiError(res, 404, 'SESSION_NOT_FOUND', 'Session not found');
    await query('UPDATE Auth_Refresh_Token SET Revoked_At=COALESCE(Revoked_At,NOW(3)) WHERE Session_ID=?', [req.params.sessionId]);
    await query(`INSERT INTO Auth_Session_Event (Session_ID,User_ID,Event_Type)
        VALUES (?,?,?)`, [req.params.sessionId, req.user.id, req.params.sessionId === req.user.sid ? 'CURRENT_SESSION_REVOKED' : 'SESSION_REVOKED']);
    if (req.params.sessionId === req.user.sid) clearWebSessionCookies(res);
    return res.status(204).end();
});

app.post('/register', authenticateToken, requireRoles('system'), async (req, res) => {
    const { firstName, lastName, username, contactNumber, password, organizationId } = req.body;
    const roleId = ADMIN_ROLE_ID;

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

            const targetOrganization = Number(organizationId);
            if (!targetOrganization) {
                await rollback();
                return res.status(400).json({ error: 'A valid clinic is required' });
            }
            const organizations = await query('SELECT Organization_ID FROM Organization WHERE Organization_ID = ? AND IsActive = 1', [targetOrganization]);
            if (!organizations.length) {
                await rollback();
                return res.status(404).json({ error: 'Active clinic not found' });
            }

            const hashedPassword = await bcrypt.hash(password, 10);
            const insertUserSQL = `
                INSERT INTO User 
                (First_Name, Last_Name, Email, Contact_Number, Password, Role_ID, Created_Date, IsActive, Must_Change_Password)
                VALUES (?, ?, ?, ?, ?, ?, NOW(), 1, 1)
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
                [userResult.insertId, targetOrganization]
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

const validatePassword = (password) => typeof password === 'string' && password.length >= 12
    && /[a-z]/.test(password) && /[A-Z]/.test(password) && /\d/.test(password) && /[^A-Za-z0-9]/.test(password);

app.post('/change-password', authenticateToken, async (req, res) => {
    const { currentPassword, newPassword } = req.body || {};
    if (!currentPassword || !validatePassword(newPassword)) {
        return sendApiError(res, 400, 'INVALID_PASSWORD', 'New password must be at least 12 characters and include uppercase, lowercase, number, and symbol');
    }
    let connection;
    try {
        connection = await db.promise().getConnection();
        await connection.beginTransaction();
        const [rows] = await connection.query('SELECT Password, First_Name, Last_Name, Email, Role_ID, Security_Version FROM User WHERE ID = ? AND IsActive = 1 FOR UPDATE', [req.user.id]);
        if (!rows.length || !(await bcrypt.compare(currentPassword, rows[0].Password))) {
            await connection.rollback();
            return sendApiError(res, 401, 'INVALID_CURRENT_PASSWORD', 'Current password is incorrect');
        }
        if (await bcrypt.compare(newPassword, rows[0].Password)) {
            await connection.rollback();
            return sendApiError(res, 400, 'PASSWORD_REUSE', 'New password must differ from the current password');
        }
        const passwordHash = await bcrypt.hash(newPassword, 10);
        const securityVersion = Number(rows[0].Security_Version || 1) + 1;
        await connection.query(`UPDATE User SET Password=?,Must_Change_Password=0,Security_Version=?,
            Sessions_Invalid_Before=NOW(3) WHERE ID=?`, [passwordHash, securityVersion, req.user.id]);
        await connection.query(`UPDATE Auth_Session SET Revoked_At=NOW(3),Revocation_Reason='password changed'
            WHERE User_ID=? AND Session_ID<>? AND Revoked_At IS NULL`, [req.user.id, req.user.sid]);
        await connection.query(`UPDATE Auth_Refresh_Token rt JOIN Auth_Session s ON s.Session_ID=rt.Session_ID
            SET rt.Revoked_At=COALESCE(rt.Revoked_At,NOW(3)) WHERE s.User_ID=?`, [req.user.id]);
        const [sessions] = await connection.query('SELECT Client_Type,Absolute_Expires_At FROM Auth_Session WHERE Session_ID=? AND User_ID=? FOR UPDATE', [req.user.sid, req.user.id]);
        if (!sessions.length) throw Object.assign(new Error('Current session not found'), { code: 'SESSION_REVOKED', statusCode: 401 });
        const refreshToken = base64UrlSecret();
        const csrfToken = sessions[0].Client_Type === 'web' ? base64UrlSecret() : null;
        await connection.query(`UPDATE Auth_Session SET Security_Version=?,Last_Seen_At=NOW(3),
            Csrf_Token_Hash=? WHERE Session_ID=?`, [securityVersion, csrfToken ? hashSessionSecret(csrfToken) : null, req.user.sid]);
        await connection.query(`INSERT INTO Auth_Refresh_Token
            (Token_ID,Session_ID,Token_Hash,Expires_At) VALUES (?,?,?,?)`,
        [crypto.randomUUID(), req.user.sid, hashSessionSecret(refreshToken), sessions[0].Absolute_Expires_At]);
        await connection.query(`INSERT INTO Auth_Session_Event (Session_ID,User_ID,Event_Type)
            VALUES (?,?,?)`, [req.user.sid, req.user.id, 'PASSWORD_CHANGED']);
        const tokenPayload = {
            id: req.user.id, role: normalizeRole(req.user.role), organizationId: req.user.organizationId || null,
            worksAt: req.user.worksAt || null, specialty: req.user.specialty || null,
            blockchainID: req.user.blockchainID || null, mustChangePassword: false, securityVersion,
        };
        const session = {
            accessToken: signAccessToken(tokenPayload, req.user.sid), refreshToken, csrfToken,
            refreshExpires: new Date(sessions[0].Absolute_Expires_At),
        };
        await connection.commit();
        res.set('Cache-Control', 'no-store');
        const user = { id: req.user.id, name: `${rows[0].First_Name} ${rows[0].Last_Name}`, email: rows[0].Email,
            role: normalizeRole(req.user.role), organizationId: req.user.organizationId || null,
            blockchainID: req.user.blockchainID || null, mustChangePassword: false };
        if (sessions[0].Client_Type === 'web') {
            setWebSessionCookies(res, session);
            return res.json({ success: true, user, csrfToken });
        }
        return res.json({ success: true, token: session.accessToken, refreshToken, user });
    } catch (error) {
        if (connection) await connection.rollback().catch(() => {});
        console.error(error);
        return sendApiError(res, error.statusCode || 500, error.code || 'PASSWORD_CHANGE_FAILED', error.statusCode ? error.message : 'Unable to change password');
    } finally { if (connection) connection.release(); }
});

const normalizeClinic = (row) => ({
    clinicID: row.Organization_ID, name: row.Name, address: row.Address, description: row.Description,
    coordinates: row.Coordinates, type: row.Type, isActive: Boolean(row.IsActive),
    createdDate: row.Created_Date, modifiedDate: row.Modified_Date, adminCount: Number(row.Admin_Count || 0)
});

app.get('/clinics', authenticateToken, requireRoles('system'), async (_req, res) => {
    try {
        const rows = await query(`SELECT Organization.*, COUNT(Admin.User_ID) AS Admin_Count FROM Organization
            LEFT JOIN Admin ON Admin.Organization_ID = Organization.Organization_ID
            GROUP BY Organization.Organization_ID ORDER BY Organization.Name`);
        return res.json({ success: true, data: rows.map(normalizeClinic) });
    } catch (error) { console.error(error); return sendApiError(res, 500, 'CLINIC_LIST_FAILED', 'Unable to load clinics'); }
});

app.post('/clinics', authenticateToken, requireRoles('system'), async (req, res) => {
    const { name, address, description, coordinates, type = 'Dental Clinic', admin } = req.body || {};
    if (!name || !address || !admin?.firstName || !admin?.lastName || !admin?.email || !admin?.contactNumber || !validatePassword(admin?.password)) {
        return sendApiError(res, 400, 'INVALID_CLINIC', 'Clinic name, address, and a first admin with a strong temporary password are required');
    }
    let connection;
    try {
        connection = await db.promise().getConnection(); await connection.beginTransaction();
        const [duplicate] = await connection.query('SELECT ID FROM User WHERE Email = ? LIMIT 1', [admin.email]);
        if (duplicate.length) { const error = new Error('Admin email already exists'); error.statusCode = 409; throw error; }
        const [lastClinic] = await connection.query('SELECT Organization_ID FROM Organization ORDER BY Organization_ID DESC LIMIT 1 FOR UPDATE');
        const clinicID = Number(lastClinic[0]?.Organization_ID || 0) + 1;
        await connection.query(`INSERT INTO Organization
            (Organization_ID, Name, Address, Description, Coordinates, Type, IsActive, Created_Date) VALUES (?, ?, ?, ?, ?, ?, 1, NOW())`,
            [clinicID, name, address, description || null, coordinates || null, type]);
        const passwordHash = await bcrypt.hash(admin.password, 10);
        const [userResult] = await connection.query(`INSERT INTO User
            (First_Name, Last_Name, Password, Email, Contact_Number, Role_ID, Created_Date, IsActive, Must_Change_Password)
            VALUES (?, ?, ?, ?, ?, ?, NOW(), 1, 1)`, [admin.firstName, admin.lastName, passwordHash, admin.email, admin.contactNumber, ADMIN_ROLE_ID]);
        await connection.query('INSERT INTO Admin (Organization_ID, User_ID) VALUES (?, ?)', [clinicID, userResult.insertId]);
        await connection.commit();
        return res.status(201).json({ success: true, data: { clinicID, primaryAdminID: userResult.insertId } });
    } catch (error) {
        if (connection) await connection.rollback(); console.error(error);
        return sendApiError(res, error.statusCode || 500, 'CLINIC_CREATE_FAILED', error.message || 'Unable to create clinic');
    } finally { if (connection) connection.release(); }
});

app.patch('/clinics/:id', authenticateToken, requireRoles('system'), async (req, res) => {
    const clinicID = Number(req.params.id); const { name, address, description, coordinates, type, isActive } = req.body || {};
    if (!clinicID || !name || !address || typeof isActive !== 'boolean') return sendApiError(res, 400, 'INVALID_CLINIC', 'Valid clinic name, address, and status are required');
    try {
        const result = await query(`UPDATE Organization SET Name=?, Address=?, Description=?, Coordinates=?, Type=?, IsActive=?, Modified_Date=NOW() WHERE Organization_ID=?`,
            [name, address, description || null, coordinates || null, type || 'Dental Clinic', isActive ? 1 : 0, clinicID]);
        if (!result.affectedRows) return sendApiError(res, 404, 'CLINIC_NOT_FOUND', 'Clinic not found');
        if (!isActive) {
            await query(`UPDATE Auth_Session s JOIN User u ON u.ID=s.User_ID
                LEFT JOIN Admin a ON a.User_ID=u.ID LEFT JOIN Doctor d ON d.ID=u.ID LEFT JOIN Patient p ON p.ID=u.ID
                SET s.Revoked_At=COALESCE(s.Revoked_At,NOW(3)),s.Revocation_Reason=COALESCE(s.Revocation_Reason,'clinic deactivated')
                WHERE COALESCE(a.Organization_ID,d.Clinic_ID,p.Clinic_ID)=?`, [clinicID]);
            await query(`UPDATE User u LEFT JOIN Admin a ON a.User_ID=u.ID LEFT JOIN Doctor d ON d.ID=u.ID LEFT JOIN Patient p ON p.ID=u.ID
                SET u.Security_Version=u.Security_Version+1,u.Sessions_Invalid_Before=NOW(3)
                WHERE COALESCE(a.Organization_ID,d.Clinic_ID,p.Clinic_ID)=?`, [clinicID]);
        }
        return res.json({ success: true });
    } catch (error) { console.error(error); return sendApiError(res, 500, 'CLINIC_UPDATE_FAILED', 'Unable to update clinic'); }
});

app.get('/clinic-admins', authenticateToken, requireRoles('admin', 'system'), async (req, res) => {
    const requestedClinic = Number(req.query.clinicID || req.user.organizationId);
    if (!requestedClinic || (normalizeRole(req.user.role) === 'admin' && requestedClinic !== Number(req.user.organizationId))) return sendApiError(res, 403, 'CLINIC_SCOPE_DENIED', 'Clinic scope is not permitted');
    try {
        const rows = await query(`SELECT User.ID, User.First_Name, User.Last_Name, User.Email, User.Contact_Number, User.IsActive,
            User.Must_Change_Password, User.Modified_Date,
            Admin.Organization_ID FROM Admin JOIN User ON User.ID=Admin.User_ID WHERE Admin.Organization_ID=? ORDER BY User.Last_Name`, [requestedClinic]);
        return res.json({ success: true, data: rows.map((row) => ({ id: row.ID, firstName: row.First_Name, lastName: row.Last_Name,
            email: row.Email, contactNumber: row.Contact_Number, clinicID: row.Organization_ID, isActive: Boolean(row.IsActive),
            mustChangePassword: Boolean(row.Must_Change_Password), modifiedDate: row.Modified_Date })) });
    } catch (error) { console.error(error); return sendApiError(res, 500, 'ADMIN_LIST_FAILED', 'Unable to load clinic admins'); }
});

const validateClinicAdminProfile = (body, requirePassword = false) => {
    const required = ['firstName', 'lastName', 'email', 'contactNumber'];
    if (requirePassword) required.push('password');
    const missing = required.filter((field) => !body?.[field] || !String(body[field]).trim());
    if (missing.length || !/^\S+@\S+\.\S+$/.test(body?.email || '') || (requirePassword && !validatePassword(body.password))) {
        const error = new Error(requirePassword
            ? 'Complete administrator details and a strong temporary password are required'
            : 'Complete administrator details and a valid email are required');
        error.statusCode = 400;
        throw error;
    }
};

const revokeManagedAdminSessions = async (connection, userID, reason) => {
    await connection.query(`UPDATE Auth_Session SET Revoked_At=COALESCE(Revoked_At,NOW(3)),
        Revocation_Reason=COALESCE(Revocation_Reason,?) WHERE User_ID=?`, [reason, userID]);
    await connection.query(`UPDATE Auth_Refresh_Token rt JOIN Auth_Session s ON s.Session_ID=rt.Session_ID
        SET rt.Revoked_At=COALESCE(rt.Revoked_At,NOW(3)) WHERE s.User_ID=?`, [userID]);
};

const recordClinicAdminEvent = (connection, req, eventType, details) => connection.query(
    `INSERT INTO Auth_Session_Event (Session_ID,User_ID,Event_Type,Details) VALUES (?,?,?,?)`,
    [req.user.sid, req.user.id, eventType, JSON.stringify(details)]
);

app.patch('/clinics/:clinicID/admin', authenticateToken, requireRoles('system'), async (req, res) => {
    const clinicID = Number(req.params.clinicID);
    let connection;
    try {
        if (!clinicID) throw Object.assign(new Error('Valid clinic is required'), { statusCode: 400 });
        validateClinicAdminProfile(req.body);
        connection = await db.promise().getConnection(); await connection.beginTransaction();
        const [admins] = await connection.query(`SELECT User.ID,User.Email FROM Admin JOIN User ON User.ID=Admin.User_ID
            WHERE Admin.Organization_ID=? FOR UPDATE`, [clinicID]);
        if (!admins.length) throw Object.assign(new Error('Clinic administrator not found'), { statusCode: 404 });
        const [duplicate] = await connection.query('SELECT ID FROM User WHERE Email=? AND ID<>? LIMIT 1', [req.body.email, admins[0].ID]);
        if (duplicate.length) throw Object.assign(new Error('Email is already in use'), { statusCode: 409 });
        await connection.query(`UPDATE User SET First_Name=?,Last_Name=?,Email=?,Contact_Number=?,Modified_Date=NOW()
            WHERE ID=?`, [req.body.firstName, req.body.lastName, req.body.email, req.body.contactNumber, admins[0].ID]);
        await recordClinicAdminEvent(connection, req, 'CLINIC_ADMIN_UPDATED', {
            clinicID, adminID: admins[0].ID, previousEmail: admins[0].Email, email: req.body.email,
        });
        await connection.commit();
        return res.json({ success: true });
    } catch (error) {
        if (connection) await connection.rollback().catch(() => {});
        return sendApiError(res, error.statusCode || 500, 'CLINIC_ADMIN_UPDATE_FAILED', error.statusCode ? error.message : 'Unable to update clinic administrator');
    } finally { if (connection) connection.release(); }
});

app.post('/clinics/:clinicID/admin/reset-password', authenticateToken, requireRoles('system'), async (req, res) => {
    const clinicID = Number(req.params.clinicID);
    if (!clinicID || !validatePassword(req.body?.password)) {
        return sendApiError(res, 400, 'INVALID_PASSWORD', 'A strong temporary password is required');
    }
    let connection;
    try {
        connection = await db.promise().getConnection(); await connection.beginTransaction();
        const [admins] = await connection.query(`SELECT User.ID FROM Admin JOIN User ON User.ID=Admin.User_ID
            WHERE Admin.Organization_ID=? FOR UPDATE`, [clinicID]);
        if (!admins.length) throw Object.assign(new Error('Clinic administrator not found'), { statusCode: 404 });
        const passwordHash = await bcrypt.hash(req.body.password, 10);
        await connection.query(`UPDATE User SET Password=?,Must_Change_Password=1,Security_Version=Security_Version+1,
            Sessions_Invalid_Before=NOW(3),Modified_Date=NOW() WHERE ID=?`, [passwordHash, admins[0].ID]);
        await revokeManagedAdminSessions(connection, admins[0].ID, 'password reset by system administrator');
        await recordClinicAdminEvent(connection, req, 'CLINIC_ADMIN_PASSWORD_RESET', { clinicID, adminID: admins[0].ID });
        await connection.commit();
        return res.json({ success: true });
    } catch (error) {
        if (connection) await connection.rollback().catch(() => {});
        return sendApiError(res, error.statusCode || 500, 'CLINIC_ADMIN_RESET_FAILED', error.statusCode ? error.message : 'Unable to reset clinic administrator password');
    } finally { if (connection) connection.release(); }
});

app.post('/clinics/:clinicID/admin/transfer', authenticateToken, requireRoles('system'), async (req, res) => {
    const clinicID = Number(req.params.clinicID);
    let connection;
    try {
        if (!clinicID) throw Object.assign(new Error('Valid clinic is required'), { statusCode: 400 });
        validateClinicAdminProfile(req.body, true);
        connection = await db.promise().getConnection(); await connection.beginTransaction();
        const [organizations] = await connection.query('SELECT Organization_ID FROM Organization WHERE Organization_ID=? FOR UPDATE', [clinicID]);
        if (!organizations.length) throw Object.assign(new Error('Clinic not found'), { statusCode: 404 });
        const [current] = await connection.query(`SELECT User.ID,User.Email FROM Admin JOIN User ON User.ID=Admin.User_ID
            WHERE Admin.Organization_ID=? FOR UPDATE`, [clinicID]);
        if (!current.length) throw Object.assign(new Error('Current clinic administrator not found'), { statusCode: 409 });
        const [duplicate] = await connection.query('SELECT ID FROM User WHERE Email=? LIMIT 1', [req.body.email]);
        if (duplicate.length) throw Object.assign(new Error('Replacement administrator email is already in use'), { statusCode: 409 });
        const passwordHash = await bcrypt.hash(req.body.password, 10);
        const [created] = await connection.query(`INSERT INTO User
            (First_Name,Last_Name,Password,Email,Contact_Number,Role_ID,Created_Date,IsActive,Must_Change_Password)
            VALUES (?,?,?,?,?,?,NOW(),1,1)`, [req.body.firstName, req.body.lastName, passwordHash, req.body.email,
            req.body.contactNumber, ADMIN_ROLE_ID]);
        await connection.query('UPDATE Admin SET User_ID=? WHERE Organization_ID=? AND User_ID=?',
            [created.insertId, clinicID, current[0].ID]);
        await connection.query(`UPDATE User SET IsActive=0,Security_Version=Security_Version+1,
            Sessions_Invalid_Before=NOW(3),Modified_Date=NOW() WHERE ID=?`, [current[0].ID]);
        await revokeManagedAdminSessions(connection, current[0].ID, 'clinic ownership transferred');
        await recordClinicAdminEvent(connection, req, 'CLINIC_ADMIN_TRANSFERRED', {
            clinicID, previousAdminID: current[0].ID, previousEmail: current[0].Email,
            newAdminID: created.insertId, newEmail: req.body.email,
        });
        await connection.commit();
        return res.status(201).json({ success: true, data: { clinicID, previousAdminID: current[0].ID, newAdminID: created.insertId } });
    } catch (error) {
        if (connection) await connection.rollback().catch(() => {});
        return sendApiError(res, error.statusCode || 500, 'CLINIC_ADMIN_TRANSFER_FAILED', error.statusCode ? error.message : 'Unable to transfer clinic ownership');
    } finally { if (connection) connection.release(); }
});

app.get('/clinics/:clinicID/admin-history', authenticateToken, requireRoles('system'), async (req, res) => {
    const clinicID = Number(req.params.clinicID);
    if (!clinicID) return sendApiError(res, 400, 'INVALID_CLINIC', 'Valid clinic is required');
    try {
        const rows = await query(`SELECT Event_ID,Event_Type,Occurred_At,Details FROM Auth_Session_Event
            WHERE Event_Type IN ('CLINIC_ADMIN_UPDATED','CLINIC_ADMIN_PASSWORD_RESET','CLINIC_ADMIN_TRANSFERRED')
            AND JSON_UNQUOTE(JSON_EXTRACT(Details,'$.clinicID'))=? ORDER BY Occurred_At DESC`, [String(clinicID)]);
        return res.json({ success: true, data: rows.map((row) => ({
            eventID: row.Event_ID, eventType: row.Event_Type, occurredAt: row.Occurred_At,
            details: typeof row.Details === 'string' ? JSON.parse(row.Details) : row.Details,
        })) });
    } catch (error) { return sendApiError(res, 500, 'CLINIC_ADMIN_HISTORY_FAILED', 'Unable to load administrator history'); }
});

const DOCTOR_SELECT = `SELECT Doctor.*, User.First_Name, User.Last_Name, User.Email, User.Contact_Number, User.Created_Date
    FROM Doctor INNER JOIN User ON Doctor.ID = User.ID`;
const CLINIC_DOCTOR_SCOPE = `(Doctor.Clinic_ID=? OR (Doctor.Clinic_ID IS NULL AND EXISTS (
    SELECT 1 FROM Patient WHERE Patient.Clinic_ID=? AND JSON_CONTAINS(Patient.Doctors, JSON_QUOTE(Doctor.Blockchain_ID))
)))`;
const normalizeDoctor = (row) => ({ doctorID: row.Blockchain_ID, firstName: row.First_Name, lastName: row.Last_Name,
    email: row.Email, contactNumber: row.Contact_Number, worksAt: row.Works_At, speciality: row.Specialty,
    licenseNumber: row.License_Number, emiratesID: row.Emirates_ID, clinicID: row.Clinic_ID,
    createdDate: row.Created_Date, modifiedDate: row.Modified_Date });
const validateDoctorPayload = (body, isCreate = false) => {
    const required = ['firstName','lastName','email','contactNumber','worksAt','speciality','licenseNumber','emiratesID'];
    if (isCreate) required.push('password');
    const missing = required.filter((field) => body[field] === undefined || body[field] === null || String(body[field]).trim() === '');
    if (missing.length) { const error = new Error(`Missing required fields: ${missing.join(', ')}`); error.statusCode = 400; throw error; }
    if (!/^\S+@\S+\.\S+$/.test(body.email)) { const error = new Error('Invalid email address'); error.statusCode = 400; throw error; }
};

app.post('/doctors', authenticateToken, requireRoles('admin'), async (req, res) => {
    let connection;
    try {
        validateDoctorPayload(req.body, true);
        const clinicID = Number(req.user.organizationId);
        if (!clinicID) return sendApiError(res, 403, 'ADMIN_CLINIC_MISSING', 'Authenticated admin has no clinic organization');
        connection = await db.promise().getConnection(); await connection.beginTransaction();
        const [duplicates] = await connection.query(`SELECT Doctor.ID FROM Doctor INNER JOIN User ON Doctor.ID=User.ID
            WHERE User.Email=? OR Doctor.License_Number=? OR Doctor.Emirates_ID=? LIMIT 1`, [req.body.email, req.body.licenseNumber, req.body.emiratesID]);
        if (duplicates.length) { const error = new Error('Doctor email, license number, or Emirates ID already exists'); error.statusCode = 409; throw error; }
        const passwordHash = await bcrypt.hash(req.body.password, 10);
        const [userResult] = await connection.query(`INSERT INTO User
            (First_Name,Last_Name,Email,Contact_Number,Password,Role_ID,Created_Date,IsActive) VALUES (?,?,?,?,?,?,NOW(),1)`,
            [req.body.firstName, req.body.lastName, req.body.email, req.body.contactNumber, passwordHash, DOCTOR_ROLE_ID]);
        const doctorID = `Doctor-${crypto.randomUUID()}`;
        await connection.query(`INSERT INTO Doctor
            (ID,Works_At,Specialty,Blockchain_ID,License_Number,Emirates_ID,Clinic_ID,Modified_Date) VALUES (?,?,?,?,?,?,?,NOW())`,
            [userResult.insertId, req.body.worksAt, req.body.speciality, doctorID, req.body.licenseNumber, req.body.emiratesID, clinicID]);
        await provisionFabricIdentity(req, 'doctor', doctorID, clinicID);
        await callBlockchain(req, '/addDoctor', 'POST', { ...req.body, doctorID, clinicID, patients: [] });
        await connection.commit();
        return res.status(201).json({ success: true, data: { ...req.body, password: undefined, doctorID, clinicID }, message: 'Doctor created consistently in MySQL and Fabric' });
    } catch (error) { if (connection) await connection.rollback().catch(() => {}); return sendApiError(res, error.statusCode || (error.code === 'ER_DUP_ENTRY' ? 409 : 500), 'DOCTOR_CREATE_FAILED', error.message); }
    finally { if (connection) connection.release(); }
});

app.get('/doctors', authenticateToken, requireRoles('admin'), async (req, res) => {
    try {
        const rows = await query(`${DOCTOR_SELECT} WHERE ${CLINIC_DOCTOR_SCOPE} ORDER BY User.Last_Name,User.First_Name`,
            [req.user.organizationId, req.user.organizationId]);
        return res.json({ success: true, data: rows.map(normalizeDoctor) });
    }
    catch (error) { return sendApiError(res, 500, 'DOCTOR_LIST_FAILED', 'Unable to retrieve doctors'); }
});

app.get('/doctors/:id', authenticateToken, requireRoles('admin','doctor'), async (req, res) => {
    try { const rows = await query(`${DOCTOR_SELECT} WHERE Doctor.Blockchain_ID=? LIMIT 1`, [req.params.id]);
        if (!rows.length) return sendApiError(res, 404, 'DOCTOR_NOT_FOUND', 'Doctor not found');
        const doctor = normalizeDoctor(rows[0]); const role = normalizeRole(req.user.role);
        if (role === 'doctor' && req.user.blockchainID !== req.params.id) return sendApiError(res, 403, 'DOCTOR_OWNER_MISMATCH', 'Doctors may retrieve only their own profile');
        if (role === 'admin') requireAdminClinic(req, doctor.clinicID);
        return res.json({ success: true, data: doctor });
    } catch (error) { return sendApiError(res, error.statusCode || 500, 'DOCTOR_READ_FAILED', error.message); }
});

app.put('/doctors/:id', authenticateToken, requireRoles('admin'), async (req, res) => {
    let connection;
    try { validateDoctorPayload(req.body); const clinicID = Number(req.user.organizationId); connection = await db.promise().getConnection(); await connection.beginTransaction();
        const [rows] = await connection.query(`${DOCTOR_SELECT} WHERE Doctor.Blockchain_ID=? FOR UPDATE`, [req.params.id]);
        if (!rows.length) { const error = new Error('Doctor not found'); error.statusCode = 404; throw error; } requireAdminClinic(req, rows[0].Clinic_ID);
        await connection.query('UPDATE User SET First_Name=?,Last_Name=?,Email=?,Contact_Number=? WHERE ID=?', [req.body.firstName,req.body.lastName,req.body.email,req.body.contactNumber,rows[0].ID]);
        await connection.query('UPDATE Doctor SET Works_At=?,Specialty=?,License_Number=?,Emirates_ID=?,Modified_Date=NOW() WHERE ID=?', [req.body.worksAt,req.body.speciality,req.body.licenseNumber,req.body.emiratesID,rows[0].ID]);
        await callBlockchain(req, `/doctor/${encodeURIComponent(req.params.id)}`, 'PUT', { ...req.body, clinicID, patients: req.body.patients || [] });
        await connection.commit(); return res.json({ success:true, data:{ ...req.body, doctorID:req.params.id, clinicID }, message:'Doctor updated consistently' });
    } catch (error) { if (connection) await connection.rollback().catch(()=>{}); return sendApiError(res,error.statusCode || (error.code==='ER_DUP_ENTRY'?409:500),'DOCTOR_UPDATE_FAILED',error.message); }
    finally { if (connection) connection.release(); }
});

app.delete('/doctors/:id', authenticateToken, requireRoles('admin'), async (req, res) => {
    let connection;
    try { connection = await db.promise().getConnection(); await connection.beginTransaction(); const [rows] = await connection.query(`${DOCTOR_SELECT} WHERE Doctor.Blockchain_ID=? FOR UPDATE`, [req.params.id]);
        if (!rows.length) { const error = new Error('Doctor not found'); error.statusCode = 404; throw error; } requireAdminClinic(req, rows[0].Clinic_ID);
        const [assigned] = await connection.query('SELECT ID FROM Patient WHERE JSON_CONTAINS(Doctors, JSON_QUOTE(?)) LIMIT 1', [req.params.id]);
        if (assigned.length) { const error = new Error('Reassign or remove this doctor from assigned patients before deletion'); error.statusCode = 409; throw error; }
        await callBlockchain(req, `/doctor/${encodeURIComponent(req.params.id)}`, 'DELETE'); await connection.query('DELETE FROM Doctor WHERE ID=?',[rows[0].ID]); await connection.query('DELETE FROM User WHERE ID=?',[rows[0].ID]);
        await connection.commit(); return res.json({ success:true, data:{ doctorID:req.params.id, deleted:true }, message:'Doctor deleted from Fabric and MySQL' });
    } catch (error) { if (connection) await connection.rollback().catch(()=>{}); return sendApiError(res,error.statusCode||500,'DOCTOR_DELETE_FAILED',`${error.message}; no MySQL deletion was committed`); }
    finally { if (connection) connection.release(); }
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
        await provisionFabricIdentity(req, 'patient', patientID, Number(req.body.clinicID));
        await callBlockchain(req, '/patient-metadata', 'POST', {
            patientID, clinicID: Number(req.body.clinicID), doctors: req.body.doctors || [],
            offChainRef: `mysql:Patient/${userResult.insertId}`, dataHash
        });
        for (const doctorID of req.body.doctors || []) {
            await callBlockchain(req, '/assignPatientToDoctor', 'POST', {
                patientID,
                doctorID,
                dataHash,
                modifiedDate: new Date().toISOString(),
            });
        }
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

app.get('/doctor/me/assigned-patients', authenticateToken, requireRoles('doctor'), async (req, res) => {
    try {
        if (!req.user.blockchainID) return sendApiError(res, 403, 'DOCTOR_IDENTITY_REQUIRED', 'Authenticated doctor has no blockchain identity');
        // Revalidate the JWT-to-certificate actor binding before returning authoritative MySQL PII.
        await callBlockchain(req, '/doctor/me/assigned-patients', 'GET');
        const rows = await query(`${PATIENT_SELECT} WHERE JSON_CONTAINS(Patient.Doctors, JSON_QUOTE(?))
            ORDER BY User.Last_Name, User.First_Name`, [String(req.user.blockchainID)]);
        return res.json({ success: true, data: rows.map(normalizePatient) });
    } catch (error) { return sendApiError(res, error.statusCode || 500, 'ASSIGNED_PATIENT_LIST_FAILED', error.message); }
});

app.get('/patients/:id', authenticateToken, requireRoles('admin', 'doctor', 'patient'), async (req, res) => {
    try {
        const rows = await query(`${PATIENT_SELECT} WHERE Patient.Blockchain_ID = ? LIMIT 1`, [req.params.id]);
        if (!rows.length) return sendApiError(res, 404, 'PATIENT_NOT_FOUND', 'Patient not found');
        const patient = normalizePatient(rows[0]);
        if (normalizeRole(req.user.role) === 'patient' && req.user.blockchainID !== req.params.id) {
            return sendApiError(res, 403, 'PATIENT_OWNER_MISMATCH', 'Patients may retrieve only their own profile');
        }
        if (normalizeRole(req.user.role) === 'admin') requireAdminClinic(req, patient.clinicID);
        if (normalizeRole(req.user.role) === 'doctor') {
            if (!req.user.blockchainID || !patient.doctors.includes(String(req.user.blockchainID))) {
                return sendApiError(res, 403, 'PATIENT_ASSIGNMENT_REQUIRED', 'Doctors may retrieve only patients assigned to them');
            }
        }
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
        const [doctorRows] = await connection.query('SELECT Blockchain_ID, Clinic_ID FROM Doctor WHERE Blockchain_ID=? FOR UPDATE', [req.body.doctorID]);
        if (!doctorRows.length) { const error = new Error('Doctor not found'); error.statusCode = 404; throw error; }
        requireAdminClinic(req, doctorRows[0].Clinic_ID);
        if (Number(doctorRows[0].Clinic_ID) !== Number(current.clinicID)) {
            const error = new Error('Doctor and patient must belong to the same clinic');
            error.statusCode = 403;
            throw error;
        }
        const doctors = [...new Set([...(current.doctors || []), String(req.body.doctorID)])];
        await connection.query('UPDATE Patient SET Doctors=?, Modified_Date=NOW() WHERE ID=?', [JSON.stringify(doctors), rows[0].ID]);
        const updated = { ...current, doctors };
        const dataHash = patientHash(updated);
        await callBlockchain(req, `/patient-metadata/${encodeURIComponent(req.params.id)}`, 'PUT', {
            clinicID: Number(current.clinicID),
            doctors,
            offChainRef: `mysql:Patient/${rows[0].ID}`,
            dataHash,
        });
        await callBlockchain(req, '/assignPatientToDoctor', 'POST', {
            patientID: req.params.id,
            doctorID: req.body.doctorID,
            dataHash,
            modifiedDate: new Date().toISOString(),
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

app.post(['/clinical-records', '/addMedicalRecord', '/addDentalChartEntry'], authenticateToken, requireRoles('doctor'), async (req, res) => {
    let connection;
    try {
        const recordType = req.path === '/addDentalChartEntry' ? 'dental' : (req.body.recordType || 'medical');
        validateClinicalPayload(recordType, req.body.payload);
        if (!req.body.patientID) return sendApiError(res, 400, 'VALIDATION_ERROR', 'patientID is required');
        if (!req.user.blockchainID) return sendApiError(res, 403, 'DOCTOR_IDENTITY_REQUIRED', 'Authenticated doctor is missing a blockchain identity');
        const recordID = `Clinical-${crypto.randomUUID()}`;
        const dataHash = clinicalHash(req.body.payload);
        const createdAt = new Date().toISOString();
        connection = await db.promise().getConnection(); await connection.beginTransaction();
        await connection.query('INSERT INTO Clinical_Record (Record_ID, Patient_Blockchain_ID, Record_Type, Payload, Data_Hash, Created_By_Doctor_ID, Created_Date) VALUES (?, ?, ?, ?, ?, ?, ?)',
            [recordID, req.body.patientID, recordType, JSON.stringify(req.body.payload), dataHash, req.user.blockchainID, createdAt.slice(0, 19).replace('T', ' ')]);
        await callBlockchain(req, '/clinical-record-metadata', 'POST', { recordID, recordType, patientID: req.body.patientID, offChainRef: `mysql:Clinical_Record/${recordID}`, dataHash, doctorID: req.user.blockchainID, createdAt });
        await connection.commit();
        return res.status(201).json({ success: true, data: { recordID, recordType, patientID: req.body.patientID, payload: req.body.payload, dataHash, createdAt } });
    } catch (error) {
        if (connection) await connection.rollback().catch(() => {});
        return sendApiError(res, error.statusCode || 500, 'CLINICAL_RECORD_CREATE_FAILED', error.message);
    } finally { if (connection) connection.release(); }
});

app.get(['/patients/:id/clinical-records/:recordType', '/getMedicalRecords/:id', '/getDentalChartData/:id'], authenticateToken, requireRoles('doctor', 'patient'), async (req, res) => {
    try {
        const recordType = req.path.startsWith('/getDentalChartData') ? 'dental' : (req.params.recordType || 'medical');
        const metadata = await callBlockchain(req, `/clinical-records/${encodeURIComponent(req.params.id)}/${recordType}?purpose=${encodeURIComponent(req.query.purpose || 'clinical care')}`, 'GET');
        if (!metadata.length) return res.json({ success: true, data: [] });
        const ids = metadata.map((item) => item.recordID);
        const placeholders = ids.map(() => '?').join(',');
        const rows = await query(`SELECT * FROM Clinical_Record WHERE Record_ID IN (${placeholders}) ORDER BY Created_Date DESC`, ids);
        const byID = new Map(metadata.map((item) => [item.recordID, item]));
        const records = rows.map((row) => ({ ...byID.get(row.Record_ID), payload: typeof row.Payload === 'string' ? JSON.parse(row.Payload) : row.Payload, dataHash: row.Data_Hash, createdAt: row.Created_Date }));
        return res.json({ success: true, data: records });
    } catch (error) { return sendApiError(res, error.statusCode || 500, 'CLINICAL_RECORD_READ_FAILED', error.message); }
});

const relayBlockchainJson = async (req, res, path, method = 'GET', body) => {
    try {
        const response = await callBlockchainResponse(req, path, method, body);
        const payload = await response.json().catch(() => ({
            success: false,
            error: { code: 'BLOCKCHAIN_INVALID_RESPONSE', message: 'Blockchain service returned an invalid response' },
        }));
        return res.status(response.status).json(payload);
    } catch (error) {
        return sendApiError(res, error.statusCode || 503, 'BLOCKCHAIN_SERVICE_UNAVAILABLE', error.message);
    }
};

// Public clients use only this application API. These facade routes sanitize
// actor scope before calling the private blockchain service.
app.get('/getRequestsForAdmin/:clinicID', authenticateToken, requireRoles('admin'), (req, res) =>
    relayBlockchainJson(req, res, `/getRequestsForAdmin/${encodeURIComponent(req.user.organizationId)}`));

app.post('/approveRequest', authenticateToken, requireRoles('admin'), (req, res) =>
    relayBlockchainJson(req, res, '/approveRequest', 'POST', {
        ...req.body,
        adminID: req.user.blockchainID || req.user.id,
        adminClinicID: req.user.organizationId,
    }));

app.post('/admin/rejectRequest', authenticateToken, requireRoles('admin'), (req, res) =>
    relayBlockchainJson(req, res, '/admin/rejectRequest', 'POST', {
        ...req.body,
        adminID: req.user.blockchainID || req.user.id,
        adminClinicID: req.user.organizationId,
    }));

app.post('/requestAccess', authenticateToken, requireRoles('doctor'), (req, res) =>
    relayBlockchainJson(req, res, '/requestAccess', 'POST', {
        ...req.body,
        doctorID: req.user.blockchainID,
    }));

app.get('/getAllRequestsForPatient/:patientID', authenticateToken, requireRoles('patient'), (req, res) =>
    relayBlockchainJson(req, res, `/getAllRequestsForPatient/${encodeURIComponent(req.user.blockchainID)}`));

app.post('/grantConsent', authenticateToken, requireRoles('patient'), (req, res) =>
    relayBlockchainJson(req, res, '/grantConsent', 'POST', { ...req.body, patientID: req.user.blockchainID }));

app.post('/patient/rejectRequest', authenticateToken, requireRoles('patient'), (req, res) =>
    relayBlockchainJson(req, res, '/patient/rejectRequest', 'POST', { ...req.body, patientID: req.user.blockchainID }));

app.post('/patient/revokeConsent', authenticateToken, requireRoles('patient'), (req, res) =>
    relayBlockchainJson(req, res, '/patient/revokeConsent', 'POST', { ...req.body, patientID: req.user.blockchainID }));

app.get(['/audit/clinical-access/:patientID', '/getAccessAuditLogs/:patientID'], authenticateToken, requireRoles('admin', 'patient'), (req, res) =>
    relayBlockchainJson(req, res, `/audit/clinical-access/${encodeURIComponent(req.params.patientID)}`));

app.get('/notifications', authenticateToken, requireRoles('admin', 'doctor', 'patient'), (req, res) => {
    const status = req.query.status ? `?status=${encodeURIComponent(req.query.status)}` : '';
    return relayBlockchainJson(req, res, `/notifications${status}`);
});

app.post('/notifications/:notificationID/read', authenticateToken, requireRoles('admin', 'doctor', 'patient'), (req, res) =>
    relayBlockchainJson(req, res, `/notifications/${encodeURIComponent(req.params.notificationID)}/read`, 'POST', req.body));

app.get('/push/config', authenticateToken, requireRoles('admin', 'doctor', 'patient'), (req, res) =>
    relayBlockchainJson(req, res, '/push/config'));
app.get('/push/subscriptions', authenticateToken, requireRoles('admin', 'doctor', 'patient'), (req, res) =>
    relayBlockchainJson(req, res, '/push/subscriptions'));
app.post('/push/subscriptions', authenticateToken, requireRoles('admin', 'doctor', 'patient'), (req, res) =>
    relayBlockchainJson(req, res, '/push/subscriptions', 'POST', req.body));
app.delete('/push/subscriptions', authenticateToken, requireRoles('admin', 'doctor', 'patient'), (req, res) =>
    relayBlockchainJson(req, res, '/push/subscriptions', 'DELETE', req.body));
app.delete('/push/subscriptions/:subscriptionID', authenticateToken, requireRoles('admin', 'doctor', 'patient'), (req, res) =>
    relayBlockchainJson(req, res, `/push/subscriptions/${encodeURIComponent(req.params.subscriptionID)}`, 'DELETE'));

app.get('/patients/:patientID/radiographic-files', authenticateToken, requireRoles('admin', 'doctor', 'patient'), (req, res) =>
    relayBlockchainJson(req, res, `/patients/${encodeURIComponent(req.params.patientID)}/radiographic-files`));

app.get('/radiographic-files/:fileID/verify-integrity', authenticateToken, requireRoles('admin', 'doctor', 'patient'), (req, res) =>
    relayBlockchainJson(req, res, `/radiographic-files/${encodeURIComponent(req.params.fileID)}/verify-integrity`));

app.post('/radiographic-files', authenticateToken, requireRoles('doctor'),
    express.raw({ type: 'application/octet-stream', limit: Number(process.env.RADIOGRAPHIC_MAX_FILE_BYTES || 536870912) }),
    async (req, res) => {
        try {
            const response = await callBlockchainResponse(req, '/radiographic-files', 'POST', req.body, 'application/octet-stream', {
                'x-patient-id': req.get('x-patient-id') || '',
                'x-file-name': req.get('x-file-name') || '',
                'x-file-media-type': req.get('x-file-media-type') || 'application/octet-stream',
            });
            const payload = await response.json().catch(() => ({}));
            return res.status(response.status).json(payload);
        } catch (error) {
            return sendApiError(res, error.statusCode || 503, 'BLOCKCHAIN_SERVICE_UNAVAILABLE', error.message);
        }
    });

app.get('/radiographic-files/:fileID/content', authenticateToken, requireRoles('doctor', 'patient'), async (req, res) => {
    try {
        const query = req.query.purpose ? `?purpose=${encodeURIComponent(req.query.purpose)}` : '';
        const response = await callBlockchainResponse(
            req,
            `/radiographic-files/${encodeURIComponent(req.params.fileID)}/content${query}`,
            'GET',
            undefined,
            null,
        );
        if (!response.ok) {
            const payload = await response.json().catch(() => ({}));
            return res.status(response.status).json(payload);
        }
        res.set('Content-Type', response.headers.get('content-type') || 'application/octet-stream');
        res.set('Content-Disposition', response.headers.get('content-disposition') || 'inline');
        return res.send(Buffer.from(await response.arrayBuffer()));
    } catch (error) {
        return sendApiError(res, error.statusCode || 503, 'BLOCKCHAIN_SERVICE_UNAVAILABLE', error.message);
    }
});

const APPOINTMENT_SELECT = `SELECT Appointment.Appointment_ID, Appointment.Meeting_For,
    COALESCE(Appointment.Appointment_Date_Time, Appointment.Date) AS Appointment_Date_Time,
    Appointment.Date, Appointment.Specialty, Appointment.Status, Appointment.Notes,
    Doctor.Blockchain_ID AS Doctor_ID, Patient.Blockchain_ID AS Patient_ID,
    CONCAT(DoctorUser.First_Name, ' ', DoctorUser.Last_Name) AS Doctor_Name,
    CONCAT(PatientUser.First_Name, ' ', PatientUser.Last_Name) AS Patient_Name
    FROM Appointment
    INNER JOIN Doctor ON Appointment.Doctor_ID = Doctor.ID
    INNER JOIN User DoctorUser ON Doctor.ID = DoctorUser.ID
    INNER JOIN Patient ON Appointment.Patient_ID = Patient.ID
    INNER JOIN User PatientUser ON Patient.ID = PatientUser.ID`;

app.get('/appointment-options/doctors', authenticateToken, requireRoles('admin'), async (req, res) => {
    try {
        const rows = await query(`${DOCTOR_SELECT} WHERE ${CLINIC_DOCTOR_SCOPE} ORDER BY User.Last_Name,User.First_Name`,
            [req.user.organizationId, req.user.organizationId]);
        return res.json({ success: true, data: rows.map(normalizeDoctor) });
    } catch (error) { return sendApiError(res, 500, 'APPOINTMENT_DOCTOR_OPTIONS_FAILED', 'Unable to retrieve clinic appointment doctors'); }
});

const listAppointments = async (req, res) => {
    try {
        const role = normalizeRole(req.user.role);
        let whereClause;
        let params;
        if (role === 'admin') {
            whereClause = 'Patient.Clinic_ID = ?';
            params = [req.user.organizationId];
        } else if (role === 'doctor') {
            if (!req.user.blockchainID) return sendApiError(res, 403, 'DOCTOR_IDENTITY_REQUIRED', 'Authenticated doctor has no blockchain identity');
            whereClause = 'Doctor.Blockchain_ID = ?';
            params = [req.user.blockchainID];
        } else {
            if (!req.user.blockchainID) return sendApiError(res, 403, 'PATIENT_IDENTITY_REQUIRED', 'Authenticated patient has no blockchain identity');
            whereClause = 'Patient.Blockchain_ID = ?';
            params = [req.user.blockchainID];
        }
        const period = String(req.query.period || '').toLowerCase();
        if (role !== 'patient' && period) return sendApiError(res, 400, 'INVALID_PERIOD', 'period is supported only for patient appointment history');
        if (role === 'patient' && period === 'upcoming') whereClause += " AND Appointment.Status <> 'cancelled' AND COALESCE(Appointment.Appointment_Date_Time, Appointment.Date) >= NOW()";
        if (role === 'patient' && period === 'past') whereClause += " AND (Appointment.Status = 'cancelled' OR COALESCE(Appointment.Appointment_Date_Time, Appointment.Date) < NOW())";
        if (role === 'patient' && period && !['upcoming', 'past'].includes(period)) return sendApiError(res, 400, 'INVALID_PERIOD', 'period must be upcoming or past');
        const rows = await query(`${APPOINTMENT_SELECT} WHERE ${whereClause}
            ORDER BY Appointment.Specialty, COALESCE(Appointment.Appointment_Date_Time, Appointment.Date)`, params);
        return res.json({ success: true, data: rows });
    } catch (error) { return sendApiError(res, 500, 'APPOINTMENT_LIST_FAILED', 'Unable to retrieve appointments'); }
};

app.get('/appointments', authenticateToken, requireRoles('admin', 'doctor', 'patient'), listAppointments);

app.post('/appointments', authenticateToken, requireRoles('admin'), async (req, res) => {
    try {
        const { patientID, doctorID, appointmentDateTime, specialty, meetingFor, notes } = req.body;
        if (![patientID, doctorID, appointmentDateTime, specialty, meetingFor].every(Boolean)) return sendApiError(res, 400, 'VALIDATION_ERROR', 'patientID, doctorID, appointmentDateTime, specialty, and meetingFor are required');
        const rows = await query(`SELECT Patient.ID AS Patient_DB_ID, Patient.Clinic_ID AS Patient_Clinic_ID, Patient.Doctors AS Patient_Doctors,
            Doctor.ID AS Doctor_DB_ID, Doctor.Clinic_ID AS Doctor_Clinic_ID
            FROM Patient JOIN Doctor ON Doctor.Blockchain_ID=? WHERE Patient.Blockchain_ID=? LIMIT 1`, [doctorID, patientID]);
        if (!rows.length) return sendApiError(res, 404, 'APPOINTMENT_PARTY_NOT_FOUND', 'Patient or doctor not found');
        requireAdminClinic(req, rows[0].Patient_Clinic_ID);
        if (rows[0].Doctor_Clinic_ID === null) {
            const assignedDoctors = typeof rows[0].Patient_Doctors === 'string' ? JSON.parse(rows[0].Patient_Doctors || '[]') : (rows[0].Patient_Doctors || []);
            if (!assignedDoctors.map(String).includes(String(doctorID))) return sendApiError(res, 403, 'APPOINTMENT_DOCTOR_SCOPE_DENIED', 'Doctor must be assigned to the patient in the admin clinic');
        } else requireAdminClinic(req, rows[0].Doctor_Clinic_ID);
        const result = await query(`INSERT INTO Appointment (Meeting_For, Doctor_ID, Patient_ID, Date, Appointment_Date_Time, Specialty, Status, Notes, Modified_Date)
            VALUES (?, ?, ?, DATE(?), ?, ?, 'scheduled', ?, NOW())`, [meetingFor, rows[0].Doctor_DB_ID, rows[0].Patient_DB_ID, appointmentDateTime, appointmentDateTime, specialty, notes || null]);
        const created = await query(`${APPOINTMENT_SELECT} WHERE Appointment.Appointment_ID=?`, [result.insertId]);
        return res.status(201).json({ success: true, data: created[0] });
    } catch (error) { return sendApiError(res, error.statusCode || 500, 'APPOINTMENT_CREATE_FAILED', error.message); }
});

app.put('/appointments/:id', authenticateToken, requireRoles('admin'), async (req, res) => {
    try {
        const existing = await query(`${APPOINTMENT_SELECT} WHERE Appointment.Appointment_ID=?`, [req.params.id]);
        if (!existing.length) return sendApiError(res, 404, 'APPOINTMENT_NOT_FOUND', 'Appointment not found');
        const scope = await query('SELECT Patient.Clinic_ID AS Patient_Clinic_ID FROM Appointment JOIN Patient ON Appointment.Patient_ID=Patient.ID WHERE Appointment.Appointment_ID=?', [req.params.id]);
        requireAdminClinic(req, scope[0].Patient_Clinic_ID);
        const appointmentDateTime = req.body.appointmentDateTime || existing[0].Appointment_Date_Time;
        await query(`UPDATE Appointment SET Meeting_For=?, Date=DATE(?), Appointment_Date_Time=?, Specialty=?, Notes=?, Status='scheduled', Modified_Date=NOW() WHERE Appointment_ID=?`,
            [req.body.meetingFor || existing[0].Meeting_For, appointmentDateTime, appointmentDateTime, req.body.specialty || existing[0].Specialty, req.body.notes ?? existing[0].Notes, req.params.id]);
        const updated = await query(`${APPOINTMENT_SELECT} WHERE Appointment.Appointment_ID=?`, [req.params.id]);
        return res.json({ success: true, data: updated[0] });
    } catch (error) { return sendApiError(res, error.statusCode || 500, 'APPOINTMENT_UPDATE_FAILED', error.message); }
});

app.patch('/appointments/:id/cancel', authenticateToken, requireRoles('admin'), async (req, res) => {
    try {
        const rows = await query(`SELECT Patient.Clinic_ID FROM Appointment JOIN Patient ON Appointment.Patient_ID=Patient.ID WHERE Appointment.Appointment_ID=?`, [req.params.id]);
        if (!rows.length) return sendApiError(res, 404, 'APPOINTMENT_NOT_FOUND', 'Appointment not found');
        requireAdminClinic(req, rows[0].Clinic_ID);
        await query("UPDATE Appointment SET Status='cancelled', Notes=COALESCE(?, Notes), Cancelled_Date=NOW(), Modified_Date=NOW() WHERE Appointment_ID=?", [req.body.reason || null, req.params.id]);
        const cancelled = await query(`${APPOINTMENT_SELECT} WHERE Appointment.Appointment_ID=?`, [req.params.id]);
        return res.json({ success: true, data: cancelled[0] });
    } catch (error) { return sendApiError(res, error.statusCode || 500, 'APPOINTMENT_CANCEL_FAILED', error.message); }
});

// Route to fetch Lab Results
app.get('/Lab_Results', authenticateToken, requireRoles('admin', 'doctor'), (req, res) => {
    return sendApiError(res, 501, 'LAB_RESULTS_NOT_IMPLEMENTED', 'Lab results are unavailable until a scoped clinical data source is configured');
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

const PORT = process.env.PORT || 8080;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`listening on port ${PORT}`);
});
