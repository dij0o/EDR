# Future Thread Startup Context

Use this file at the start of future Codex threads to save tokens.

## One-Sentence Goal

Bring `C:\Workbench\EDR_Source\Source_Code_Remediation` into compliance with `SRS-EDR-001_Blockchain_EDR_System.docx`.

## Canonical Paths

| Purpose | Path |
|---|---|
| SRS | `C:\Workbench\EDR_Source\Documents\SRS-EDR-001_Blockchain_EDR_System.docx` |
| Working code | `C:\Workbench\EDR_Source\Source_Code_Remediation` |
| Original baseline | `C:\Workbench\EDR_Source\Source_Code` |
| Compliance docs | `C:\Workbench\EDR_Source\Outputs\SRS_Compliance_Base` |
| Existing remediation changelog | `C:\Workbench\EDR_Source\Outputs\EDR_Remediation_Change_Log.md` |

## First Files To Read

1. `Outputs\SRS_Compliance_Base\README.md`
2. `Outputs\SRS_Compliance_Base\SRS_Gap_Traceability_Matrix.md`
3. `Outputs\SRS_Compliance_Base\SRS_Remediation_Roadmap.md`
4. `Outputs\SRS_Compliance_Base\SRS_Acceptance_Checklist.md`

## Implementation Target

Work in `Source_Code_Remediation`.

Do not modify `Source_Code` unless the user explicitly requests it.

## Current Code-Level Baseline

The remediation codebase includes:

- Database API: `backend\server.js`
- Blockchain API: `dental-backend\index.js`
- Main chaincode: `fabric-samples\dental-record-sharing\chaincode-javascript\lib\dentalRecordSharing.js`
- Web app: `bc-dentistry-frontend`
- Mobile app: `BC-Dentistry-Mobile-App`
- MySQL schema: `database\dump.sql`
- Fabric setup: `fabric-samples\test-network`

Latest checkpoint, 2026-07-10:

- Phase 1 API-layer auth is implemented at source level: Database API and Blockchain API business routes validate JWTs and roles.
- Web protected API calls now attach `Authorization: Bearer <token>`.
- Mobile sign-in now uses Database API `/login`, stores the token in context, and sends JWT headers on protected patient request/consent calls.
- Patient identity mapping is now implemented at source level: `Patient.Blockchain_ID` is in the schema/dump/migration, Database API login returns it, patient sync backfills it, mobile uses only the login `blockchainID`, and Blockchain API patient request/consent routes reject mismatched patient IDs.
- Public admin registration is closed at source level: `POST /register` requires an Admin/System JWT or `ADMIN_BOOTSTRAP_TOKEN` through `x-bootstrap-token`.
- Phase 1 AWS rollout gate: apply the patient mapping migration, set required env vars, restart services, and run the smoke tests in `Phase1_AWS_Deployment_Runbook.md`.
- MSP/certificate binding decision: Phase 1 keeps JWT as an API-session token signed by `JWT_SECRET`; user-specific MSP/certificate binding moves to Phase 2 chaincode/gateway identity work.

The main SRS compliance gaps are:

- Chaincode RBAC/MSP checks are missing or commented out.
- API endpoint names and coverage do not fully match the SRS.
- Patient and doctor management are partial.
- Clinical records are partial and not exposed as complete workflows.
- DICOM/off-chain file SHA-256 integrity verification is missing.
- Consent flow exists but needs authenticated identity, notifications, revocation/decision clarity, and automatic audit logging.
- Appointment management is mostly read-only/static.
- Mobile app still has placeholder/static areas and needs full usability polish beyond the now-mapped patient request/consent flow.
- Web/mobile contain placeholder workflows.
- Fabric default topology is a development network, not full SRS target topology.
- Tests and verification evidence are incomplete.

## Recommended Work Order

1. Apply the patient `Blockchain_ID` migration and run the Phase 1 AWS VM smoke tests.
2. Chaincode MSP/RBAC enforcement.
3. SRS API endpoint parity.
4. Patient and doctor CRUD completion.
5. Clinical record workflows.
6. DICOM/file hash integrity.
7. Consent, notifications, audit logging.
8. Appointment management.
9. Mobile/web usability cleanup.
10. Fabric topology/deployment alignment.
11. Tests, evidence, and final documentation.

## Rule For Future Updates

After any implementation phase, update:

- `SRS_Gap_Traceability_Matrix.md`
- `SRS_Remediation_Roadmap.md`
- `SRS_Acceptance_Checklist.md`
- `Outputs\EDR_Remediation_Change_Log.md` if code/config actually changed

Use exact file paths and line references where practical.

## Suggested Future Thread Prompt

Read `C:\Workbench\EDR_Source\Outputs\SRS_Compliance_Base\Thread_Startup_Context.md` and continue the SRS remediation work in `Source_Code_Remediation`. Focus on the next incomplete phase in `SRS_Remediation_Roadmap.md`, keep changes scoped, and update the compliance docs when done.
