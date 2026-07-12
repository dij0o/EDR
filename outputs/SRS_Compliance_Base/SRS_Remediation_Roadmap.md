# SRS Remediation Roadmap

Prepared by: Codex
Date: 2026-07-10
Working target: `C:\Workbench\EDR_Source\Source_Code_Remediation`

## Guiding Rules

- Keep `Source_Code` read-only as the original baseline.
- Implement in `Source_Code_Remediation`.
- Keep SRS IDs attached to every change.
- Prefer small, testable phases over broad rewrites.
- Update this roadmap and the traceability matrix after each phase.

## Phase 0: Baseline Control

Goal: Establish shared documents and prevent repeated full audits.

Deliverables:

- `Outputs\SRS_Compliance_Base\README.md`
- `Outputs\SRS_Compliance_Base\SRS_Gap_Traceability_Matrix.md`
- `Outputs\SRS_Compliance_Base\SRS_Remediation_Roadmap.md`
- `Outputs\SRS_Compliance_Base\SRS_Acceptance_Checklist.md`
- `Outputs\SRS_Compliance_Base\Thread_Startup_Context.md`

Exit criteria:

- Future threads can start from these docs.
- Requirement status and remediation phases are explicit.

## Phase 1: Authentication And Authorization Foundation

SRS coverage: FR-01, FR-02, FR-03, FR-04, SEC-01, SEC-06

Tasks:

- Add role middleware to Database API.
- Add JWT middleware to Blockchain API.
- Define role names consistently: Admin, Doctor, Patient, System.
- Add authenticated user context to all relevant web API calls.
- Replace mobile local email matching with real `/login`.
- Store/use token in mobile app.
- Move JWT expiry to env config.
- Decide and document how MSP/certificate identity is represented in JWT claims.

Exit criteria:

- Business APIs reject missing/invalid token.
- Admin-only, doctor-only, patient-only routes enforce role.
- Web and mobile attach `Authorization: Bearer <token>`.
- No client can access role-restricted data by changing local storage only.

Progress checkpoint - 2026-07-10:

- Done: Database API now issues JWTs with configurable expiry and role/context claims, and protects business routes with role middleware.
- Done: Blockchain API now validates JWTs and enforces Admin/Doctor/Patient/System route permissions, including admin-clinic and doctor-self checks where current token claims allow it.
- Done: Web app now attaches `Authorization: Bearer <token>` to protected Database and Blockchain API calls.
- Done: Mobile app sign-in now calls Database API `/login`, stores the token in context, and sends it on patient request/consent calls.
- Done: Patient mobile self-service now has a durable off-chain mapping from authenticated patient user to on-chain `patientID` via `Patient.Blockchain_ID`; Database API login returns it, sync backfills it from chaincode patient IDs, and Blockchain API patient routes enforce owner-only access at the API boundary.
- Done: `POST /register` now requires either an Admin/System JWT or an `x-bootstrap-token` matching `ADMIN_BOOTSTRAP_TOKEN`, so anonymous public admin registration is closed.
- Done: Phase 1 AWS deployment runbook documents the required DB migration, environment values, smoke tests, and the MSP/certificate identity decision.
- Deployment gate: Apply `database/migrations/2026-07-10-add-patient-blockchain-id.sql`, set `ADMIN_BOOTSTRAP_TOKEN` if bootstrap registration is needed, restart services, and complete the AWS VM smoke tests before starting Phase 2.
- Phase 2 carry-forward: User-specific MSP/certificate binding and chaincode-level MSP/RBAC enforcement remain Phase 2 work.
- AWS gate status - 2026-07-11: **Passed.** The existing AWS database already contained `Patient.Blockchain_ID` with `Patient1`-`Patient3` mappings; JWT secret digests matched; Database API was rebuilt, Blockchain API restarted under PM2, and the frontend was rebuilt and recopied to Nginx. Smoke tests passed for 401 unauthenticated access, admin 200 access, doctor cross-user 403, patient cross-user 403, frontend 200, and anonymous registration 401. `ADMIN_BOOTSTRAP_TOKEN` is absent; no bootstrap exception is enabled.

## Phase 2: Chaincode RBAC And Identity Enforcement

SRS coverage: SEC-02, FR role restrictions, SEC-06

Tasks:

- Implement helper functions in chaincode for role/MSP checks.
- Enforce Admin on patient/doctor create/update/delete/assign.
- Enforce Doctor on clinical record writes and cross-clinic requests.
- Enforce Patient on consent decisions and patient request retrieval.
- Enforce System or service identity for `LogAccess` if used directly.
- Update chaincode tests to match current signatures and role behavior.

Progress checkpoint - 2026-07-11:

- **Completed and deployed to AWS.**
- Chaincode validates trusted `Org1MSP`/`Org2MSP`, certificate `role`, `actorID`, and admin `clinicID` attributes across restricted functions.
- Blockchain API maps verified JWT claims to `admin-<organizationId>`, `doctor-<blockchainID>`, `patient-<blockchainID>`, or `role-system` wallet identities and rejects missing identities before gateway connection.
- AWS CA/wallet now contains clinic-bound admin, actor-bound doctor/patient, and system identities; the legacy shared `appUser` is no longer selected by active Phase 2 routes.
- Chaincode `basic` version `1.0.1`, sequence `3`, is committed with Org1MSP and Org2MSP approval.
- Verification passed: 16 chaincode unit tests, 4 gateway identity-mapping tests, 9 live Fabric identity checks, and the Phase 1 API smoke regression suite.
- Git-synchronized redeployment - 2026-07-11: the AWS checkout was backed up to `/home/ubuntu/deployment-backups/20260711-094718` and aligned to pushed commit `4892875`. The Database API image, PM2 Blockchain API, and Nginx frontend were rebuilt/restarted from that commit. The Phase 1 public smoke suite, 16 direct chaincode tests, 4 gateway resolver tests, and 9 live Fabric identity checks passed again.
- Known test-tooling item: the direct Mocha chaincode suite passes, but the inherited `npm test` ESLint pre-hook does not parse object spread syntax. Update the ESLint parser/`ecmaVersion` configuration so the standard test command runs end to end.
- Dependency audit item: clean AWS installs reported 28 vulnerabilities in `dental-backend` (3 critical), 33 in the frontend (1 critical), and 19 in the chaincode package (1 critical). Remediate through reviewed dependency upgrades and compatibility tests; do not run `npm audit fix --force` directly in production.

Exit criteria:

- Unauthorized identities cannot invoke restricted chaincode functions.
- Role violation tests exist for admin, doctor, and patient functions.

## Phase 3: REST API Parity With SRS

SRS coverage: Section 5 API gateway specifications

Status - 2026-07-11: **Completed and deployed to AWS.** The Blockchain API exposes all six SRS-named routes, patient update/delete, doctor read/update/delete, and separate admin/patient rejection routes. Canonical routes use `{ success, data }` or `{ success: false, error: { code, message } }`; legacy aliases remain available. Checkout `b30cae6` is live under PM2 and chaincode `basic` version `1.0.2`, sequence `4`, is committed with Org1MSP and Org2MSP approvals. Seven route/identity tests and 13 authenticated AWS smoke checks pass, including patient self reads, unassigned-doctor 403, validation 400s, role 403s, and actor-mismatch 403.

Tasks:

- Add endpoint aliases or canonical routes for:
  - `GET /getPatientByID/:id`
  - `POST /addMedicalRecord`
  - `GET /getDentalChartData/:id`
  - `POST /requestAccess`
  - `POST /grantConsent`
  - `GET /getPendingRequests`
- Add update/delete patient routes.
- Add read/update/delete doctor routes.
- Add admin reject and patient reject endpoints if separate from generic rejection.
- Normalize response shapes and error handling.
- Document endpoints in README/setup docs.

Implementation notes:

- SRS aliases: `/getPatientByID/:id` -> `/readPatient/:patientID`, `/requestAccess` -> `/requestDataAccess`, `/grantConsent` -> `/provideConsent`, and `/getPendingRequests` -> `/getPendingRequestsForPatient/:patientID`.
- New canonical routes: `POST /addMedicalRecord`, `GET /getDentalChartData/:id`, `PUT|DELETE /patient/:id`, `GET|PUT|DELETE /doctor/:id`, `POST /admin/rejectRequest`, and `POST /patient/rejectRequest`.
- No database migration is required for Phase 3. Deployment requires publishing the Blockchain API and the updated chaincode because clinic-scoped delete enforcement changed on-chain.

Exit criteria:

- Every endpoint named in the SRS exists or has a documented, tested compatible alias.
- Every endpoint requires JWT and correct role.

## Phase 4: Patient Management Completion

Status: **Completed and deployed 2026-07-11.** Chaincode `basic` 1.0.3 sequence 5, the Phase 4 database migration, both APIs, and the frontend were deployed; the authenticated create/update/read/assign/owner/delete smoke flow passed.

Implementation notes:

- MySQL is authoritative for patient PII and detailed demographic, clinical, medication, allergy, insurance, contact, and address data.
- Fabric stores patient ID, clinic/doctor identifiers, an opaque `mysql:Patient/<ID>` reference, SHA-256 data hash, timestamps, and `PII_OFF_CHAIN_MYSQL`.
- Database API coordinates both stores: Fabric writes precede MySQL commit; failures roll back MySQL. Delete removes Fabric first, then commits the MySQL cascade.
- IDs are server-generated as `Patient-<UUID>`.
- Accepted naming deviation: metadata-safe `AddPatientMetadata` and `UpdatePatientMetadata` replace PII-bearing SRS transaction payloads. Historical ledger PII must be sanitized during deployment.
- Deployment requires the Phase 4 migration, chaincode upgrade, API restarts, frontend rebuild/copy, and authenticated smoke tests.

SRS coverage: FR-05 to FR-10

Tasks:

- Expand add-patient UI and payload to include:
  - date of birth
  - gender
  - contact details
  - Emirates ID
  - nationality
  - address
  - blood type
  - medical history
  - allergies
  - medications
  - insurance details
  - clinic association
- Decide on hybrid storage split:
  - PII and detailed clinical/admin fields off-chain
  - patient metadata/hash/reference on-chain
- Add patient update UI/API.
- Add patient delete UI/API with confirmation.
- Add generated unique patient ID or documented ID policy.

Exit criteria:

- Admin can create, update, retrieve, assign, and delete patients using SRS fields.
- PII storage aligns with SEC-03.

## Phase 5: Doctor Management Completion

Status: **Completed and deployed 2026-07-12.** Commit `4da2e8e` is live; the database migration is applied, chaincode `basic` 1.0.4 sequence 6 is committed with both MSP approvals, both APIs and the frontend are deployed, and the disposable authenticated Phase 5 workflow passed.

Implementation notes:

- Doctor creation is coordinated by the Database API: it generates `Doctor-<UUID>`, writes the User/Doctor rows in a MySQL transaction, invokes Fabric registration, and commits MySQL only after Fabric succeeds.
- Doctor list/read/update/delete are clinic-scoped for admins; doctor self-read is owner-bound. Delete is blocked while patients remain assigned.
- Doctor license number, Emirates ID, clinic ID, and modification timestamp are included in the schema/migration and API/UI contracts.
- The admin web UI provides list/search/create/update/delete with confirmation, loading, empty, success, and actionable error states.
- `GET /doctor/me/assigned-patients` derives the doctor exclusively from the verified JWT; chaincode independently enforces the doctor certificate `actorID`.
- Deployment must apply `2026-07-12-phase5-doctor-management.sql`, upgrade chaincode/API signatures, rebuild the frontend, and enroll/revoke `doctor-<doctorID>` Fabric identities as lifecycle operations.
- Legacy `Doctor1` and `Doctor2` retain null license/Emirates values until authoritative records are supplied; all newly created/updated Phase 5 doctors require these fields. This is a legacy data-quality carry-forward, not a fabricated backfill.

SRS coverage: FR-11 to FR-14

Tasks:

- Add license number to doctor schema/API/UI.
- Unify MySQL doctor user creation with on-chain doctor registration.
- Add doctor read/update/delete APIs.
- Add admin UI for doctor management.
- Ensure doctor assigned-patient retrieval uses authenticated doctor identity.

Exit criteria:

- Admin can create, update, retrieve, and delete doctors.
- Doctors can only retrieve their own assigned patients unless explicitly authorized.

## Phase 6: Clinical Record Management

SRS coverage: FR-15 to FR-18

Tasks:

- Add doctor-only medical record API and UI.
- Add dental chart entry API and UI.
- Add lab results, medications, prescriptions, diagnostics, and history integration.
- Add patient and doctor retrieval flows.
- Enforce assigned-patient or consent-based access.
- Add automatic access logging for reads.

Exit criteria:

- Doctor can add records for assigned/authorized patients.
- Patient can view own records.
- External doctor can view only after admin approval and patient consent.

## Phase 7: DICOM And Integrity Verification

SRS coverage: FR-19, FR-20, SEC-04

Tasks:

- Add off-chain file upload/storage service.
- Compute SHA-256 for uploaded DICOM/radiographic files.
- Store hash and file metadata on-chain.
- Add verify-integrity endpoint.
- Add UI status: verified, mismatch, missing file, unknown.
- Decide where large files live: filesystem, object storage, IPFS, or database references.

Exit criteria:

- Upload creates off-chain file plus on-chain SHA-256 metadata.
- Verification detects hash mismatch.
- Patient/doctor UI can display integrity status.

## Phase 8: Consent, Data Sharing, Notifications, And Audit

SRS coverage: FR-21 to FR-28, SEC-08, GDPR audit

Tasks:

- Harden doctor request creation.
- Add admin notification and approve/reject actions.
- Add patient notification/mobile request details.
- Add patient approve/reject with authenticated patient identity.
- Add consent revocation if required by GDPR language.
- Ensure access is blocked unless admin approval and patient consent are both present.
- Automatically log all approved data access with immutable `LogAccess`.
- Add audit query/report view.

Exit criteria:

- Full Doctor -> Admin -> Patient workflow is usable from web/mobile.
- Data access without fulfilled consent fails.
- Every data read through consent creates an audit log.

## Phase 9: Appointment Management

SRS coverage: FR-29 to FR-31

Tasks:

- Add appointment create API.
- Add appointment update API.
- Add appointment cancel API.
- Connect web appointment dialog to persisted API.
- Add mobile upcoming/past appointments for authenticated patient.
- Organize mobile appointment display by specialty and date.

Exit criteria:

- Admin can create/update/cancel appointments.
- Patient can view upcoming and past appointments in mobile app.

## Phase 10: Usability And Accessibility

SRS coverage: UI screens, Section 6.5 usability, WCAG 2.1 AA

Tasks:

- Remove static placeholders from web/mobile flows.
- Add loading, empty, error, and success states.
- Add route guards and session expiry behavior.
- Review keyboard navigation and semantic labels.
- Fix custom controls that lack accessibility names/states.
- Check responsive web layouts on desktop/tablet widths.
- Ensure consent statuses use green, red, blue consistently.

Exit criteria:

- Core admin, doctor, and patient workflows are end-to-end usable.
- Accessibility audit findings are documented and addressed.

## Phase 11: Fabric Topology And Deployment Alignment

SRS coverage: Architecture, reliability, availability, scalability

Tasks:

- Decide if SRS target is production topology or test topology.
- Add/document two peers per organization if required.
- Add/document Raft orderer topology. Production Raft needs at least three orderers.
- Ensure connection profiles and wallets support the selected topology.
- Document onboarding of additional clinics.

Exit criteria:

- Setup docs clearly match either SRS target topology or an accepted development exception.
- Fabric network starts from documented commands in the target environment.

## Phase 12: Test And Evidence Package

SRS coverage: Section 8 testing requirements

Tasks:

- Update chaincode unit tests.
- Add API integration tests for auth, role violations, consent bypass, CRUD, hash verification.
- Add frontend/mobile workflow test notes or automated tests where practical.
- Run Caliper benchmarks for read, write, delete at 1, 10, 50, 100, 200 transactions.
- Capture CPU/memory metrics per container.
- Produce final verification report.

Exit criteria:

- Each FR and SEC requirement has pass/fail evidence.
- Performance results are tied to the current code revision.

## Phase 13: Final Documentation And Handover

SRS coverage: Client readiness

Tasks:

- Update README and `docs\SETUP.md`.
- Create final SRS compliance report.
- Create API reference.
- Create user workflow guide.
- Update remediation change log with exact files and line changes.
- Record known limitations and accepted deviations.

Exit criteria:

- Client can understand what was changed, how to run it, and how each SRS item was satisfied.
