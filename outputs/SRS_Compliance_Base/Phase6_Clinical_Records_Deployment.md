# Phase 6 Clinical Records Deployment

Date: 2026-07-12
SRS coverage: FR-15, FR-16, FR-17, FR-18

## Architecture

Clinical payloads are authoritative in MySQL `Clinical_Record`. Fabric stores only record ID, patient ID, record type, opaque MySQL reference, SHA-256 hash, doctor ID, and timestamp. Doctor writes and doctor/patient reads reuse certificate-bound assignment/consent/ownership checks. Every successful read submits `LogClinicalAccess` with a deterministic Fabric transaction timestamp.

## AWS result

- Source pre-copy backup: `/home/ubuntu/deployment-backups/20260712-171146-phase6-completion-source-precopy`.
- Successful deployment backup: `/home/ubuntu/deployment-backups/20260712-171801-phase6-completion-predeploy`.
- Migration `2026-07-12-phase6-clinical-records.sql` applied.
- Chaincode `basic` 1.0.7 sequence 9 committed with Org1MSP and Org2MSP approvals. Sequence 8 exposed nondeterministic `new Date()` audit timestamps during smoke; sequence 9 corrected this to `ctx.stub.getTxTimestamp()`.
- 20/20 API/source tests and 18/18 chaincode tests passed on AWS.
- Database API, Blockchain API, frontend, PM2, and Nginx rollout passed.
- Authenticated smoke passed: medical create, dental create, assigned-doctor read, unauthorized-doctor denial, patient-owner read, and immutable automatic access-log retrieval.

Smoke records remain in the AWS test database/ledger as explicit Phase 6 verification evidence.
