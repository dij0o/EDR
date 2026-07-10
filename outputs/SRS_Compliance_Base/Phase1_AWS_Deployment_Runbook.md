# Phase 1 AWS Deployment Runbook

Prepared by: Codex
Date: 2026-07-10

Use this runbook when deploying the Phase 1 remediation changes to the existing AWS VM. It tracks deployment actions that cannot be proven from source alone.

## Required Database Migration

Run before deploying the updated Database API login code:

```sql
SOURCE Source_Code_Remediation/database/migrations/2026-07-10-add-patient-blockchain-id.sql;
```

Purpose:

- Adds `Patient.Blockchain_ID`.
- Creates a unique key for durable off-chain patient-to-ledger identity mapping.
- Backfills the seeded patients by Emirates ID to `Patient1`, `Patient2`, and `Patient3`.

Pre-check:

```sql
DESCRIBE Patient;
SELECT ID, Emirates_ID, Blockchain_ID FROM Patient ORDER BY ID;
```

Post-check:

```sql
SELECT ID, Emirates_ID, Blockchain_ID
FROM Patient
WHERE Blockchain_ID IS NOT NULL
ORDER BY ID;
```

## Required Environment Updates

Set these values consistently on the AWS VM before restarting services:

```env
JWT_SECRET=<same-strong-secret-used-by-backend-and-dental-backend>
JWT_EXPIRES_IN=8h
ADMIN_BOOTSTRAP_TOKEN=<strong-one-time-token-if-bootstrap-admin-registration-is-needed>
BLOCKCHAIN_API_URL=<reachable Blockchain API URL from Database API runtime>
CORS_ORIGIN=<production frontend origin>
```

Notes:

- `JWT_SECRET` must match in `backend/.env` and `dental-backend/.env`.
- `ADMIN_BOOTSTRAP_TOKEN` is only for `POST /register` when an Admin/System JWT is not available. Remove or rotate it after bootstrap if the deployed process does not need ongoing bootstrap registration.
- Do not place `ADMIN_BOOTSTRAP_TOKEN` in frontend `.env` files.

## Phase 1 Smoke Tests

After deployment and restart, run these against the AWS VM:

1. `POST /login` succeeds for an admin and returns `token`.
2. Calling Database API business routes without a token returns `401` or `403`.
3. Calling Blockchain API business routes without a token returns `401` or `403`.
4. Admin token can call `/Patient`, `/Doctor`, `/users`, and admin Blockchain routes.
5. Doctor token cannot call another doctor's `/getPatientsAssignedToDoctor/:doctorID`.
6. Patient token can call `/getAllRequestsForPatient/<own blockchainID>`.
7. Patient token cannot call `/getAllRequestsForPatient/<different patientID>`.
8. `POST /register` without Admin/System JWT or `x-bootstrap-token` returns `401`.
9. `POST /register` with Admin/System JWT or valid `x-bootstrap-token` follows normal validation rules.

## Phase 1 Identity Decision

For Phase 1, JWTs remain API session tokens signed with `JWT_SECRET` and carry role/context claims. User-specific MSP certificate signing is not implemented in Phase 1 because the current Fabric gateway uses a shared `appUser` wallet identity. Chaincode-level MSP/RBAC enforcement and per-user Fabric identity binding remain Phase 2 work.
