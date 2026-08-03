'use strict';

const fs = require('fs');

const inFlightEnrollments = new Map();

const identityDefinition = ({ role, actorID, clinicID }) => {
    const normalizedRole = String(role || '').trim().toLowerCase();
    const normalizedActorID = String(actorID || '').trim();
    if (!['admin', 'doctor', 'patient'].includes(normalizedRole)) {
        throw Object.assign(new Error('Only admin, doctor, and patient identities can be provisioned dynamically'), { statusCode: 400 });
    }
    if (!normalizedActorID || !/^[A-Za-z0-9._:-]{1,128}$/.test(normalizedActorID)) {
        throw Object.assign(new Error('A valid doctor or patient blockchain identity is required'), { statusCode: 400 });
    }
    if (normalizedRole === 'admin' && (!clinicID || normalizedActorID !== `AdminClinic${clinicID}`)) {
        throw Object.assign(new Error('Admin identity must match its clinic'), { statusCode: 400 });
    }
    if (normalizedRole === 'doctor' && !/^Doctor(?:-|[0-9])/i.test(normalizedActorID)) {
        throw Object.assign(new Error('Doctor identity prefix does not match the requested role'), { statusCode: 400 });
    }
    if (normalizedRole === 'patient' && !/^Patient(?:-|[0-9])/i.test(normalizedActorID)) {
        throw Object.assign(new Error('Patient identity prefix does not match the requested role'), { statusCode: 400 });
    }
    return {
        label: normalizedRole === 'admin' ? `admin-${clinicID}` : `${normalizedRole}-${normalizedActorID}`,
        role: normalizedRole,
        actorID: normalizedActorID,
        clinicID: clinicID === undefined || clinicID === null ? '' : String(clinicID),
    };
};

const enrollIdentity = async ({ ccpPath, walletPath, role, actorID, clinicID }) => {
    const definition = identityDefinition({ role, actorID, clinicID });
    if (inFlightEnrollments.has(definition.label)) return inFlightEnrollments.get(definition.label);

    const enrollment = (async () => {
        const FabricCAServices = require('fabric-ca-client');
        const { Wallets } = require('fabric-network');
        const ccp = JSON.parse(fs.readFileSync(ccpPath, 'utf8'));
        const caInfo = ccp.certificateAuthorities?.['ca.org1.example.com']
            || Object.values(ccp.certificateAuthorities || {})[0];
        if (!caInfo) throw Object.assign(new Error('Fabric connection profile has no certificate authority'), { statusCode: 503 });

        const wallet = await Wallets.newFileSystemWallet(walletPath);
        if (await wallet.get(definition.label)) {
            return { label: definition.label, created: false };
        }

        const registrarLabel = process.env.FABRIC_CA_REGISTRAR_IDENTITY || 'admin';
        const registrarIdentity = await wallet.get(registrarLabel);
        if (!registrarIdentity) {
            throw Object.assign(new Error(`Fabric registrar identity ${registrarLabel} is not available`), { statusCode: 503 });
        }

        const ca = new FabricCAServices(caInfo.url, {
            trustedRoots: caInfo.tlsCACerts?.pem,
            verify: process.env.FABRIC_CA_TLS_VERIFY !== 'false',
        }, caInfo.caName);
        const provider = wallet.getProviderRegistry().getProvider(registrarIdentity.type);
        const registrar = await provider.getUserContext(registrarIdentity, registrarLabel);
        const enrollmentSecret = await ca.register({
            enrollmentID: definition.label,
            role: 'client',
            attrs: [
                { name: 'role', value: definition.role, ecert: true },
                { name: 'actorID', value: definition.actorID, ecert: true },
                ...(definition.clinicID ? [{ name: 'clinicID', value: definition.clinicID, ecert: true }] : []),
            ],
        }, registrar);
        const certificate = await ca.enroll({
            enrollmentID: definition.label,
            enrollmentSecret,
            attr_reqs: [
                { name: 'role', optional: false },
                { name: 'actorID', optional: false },
                { name: 'clinicID', optional: true },
            ],
        });
        await wallet.put(definition.label, {
            credentials: {
                certificate: certificate.certificate,
                privateKey: certificate.key.toBytes(),
            },
            mspId: process.env.FABRIC_MSP_ID || 'Org1MSP',
            type: 'X.509',
        });
        return { label: definition.label, created: true };
    })();

    inFlightEnrollments.set(definition.label, enrollment);
    try {
        return await enrollment;
    } finally {
        inFlightEnrollments.delete(definition.label);
    }
};

module.exports = { enrollIdentity, identityDefinition };
