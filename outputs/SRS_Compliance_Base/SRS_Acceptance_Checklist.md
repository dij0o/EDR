# SRS Acceptance Checklist

Prepared by: Codex
Date: 2026-07-10

Use this checklist to decide when `Source_Code_Remediation` meets the SRS at a code and workflow level.

## Authentication And Session Management

- [x] All clients authenticate via `/login`.
- [x] Web app sends JWT on protected API calls.
- [x] Mobile app sends JWT on protected API calls.
- [x] Database API validates JWT on business routes.
- [x] Blockchain API validates JWT on business routes.
- [x] Role middleware enforces Admin, Doctor, Patient, and System permissions.
- [x] JWT expiry is configurable.
- [x] Patient login can return the user's on-chain `patientID` from `Patient.Blockchain_ID`.
- [x] Blockchain API patient request/consent routes reject patient IDs that differ from the authenticated patient's token claim.
- [x] Public admin registration is blocked unless the caller has an Admin/System JWT or the AWS deployment bootstrap token.
- [x] MSP/certificate identity strategy is formally documented as a Phase 2 chaincode/gateway identity item.

Checkpoint note, 2026-07-11: Phase 1 passed on AWS. The patient mapping, aligned JWT secrets, service restarts, and role/ownership smoke tests were verified.

Redeployment note, 2026-07-11: the AWS checkout was aligned to pushed commit `4892875`; both APIs and the Nginx frontend were rebuilt/restarted, and the complete Phase 1 smoke suite plus Phase 2 chaincode/gateway identity checks passed again. The only test-command caveat is the stale ESLint parser used by the chaincode `npm test` pre-hook; direct Mocha execution passes all 16 tests.

Phase 3 deployment checkpoint, 2026-07-11: all Section 5 SRS route names and patient/doctor CRUD routes are deployed from `b30cae6` with JWT, role, actor/clinic binding, normalized canonical responses, and documented legacy aliases. Chaincode `basic` 1.0.2 sequence 4 is committed with both MSP approvals; 7 route/identity tests and the 13-check authenticated AWS smoke suite pass.

## REST API Parity

- [x] `GET /getPatientByID/:id` exists with compatible `/readPatient/:patientID` alias.
- [x] `POST /addMedicalRecord` is Doctor-only and actor-bound.
- [x] `GET /getDentalChartData/:id` enforces record access.
- [x] `POST /requestAccess` exists with compatible `/requestDataAccess` alias.
- [x] `POST /grantConsent` exists with compatible `/provideConsent` alias.
- [x] `GET /getPendingRequests` derives the patient from the JWT.
- [x] Patient update/delete and Doctor read/update/delete routes exist.
- [x] Admin and Patient rejection routes are separate and role-bound.
- [x] Canonical success and error envelopes are documented and tested.
- [x] Phase 3 Blockchain API and chaincode changes are deployed and smoke-tested on AWS.

## Chaincode Security

- [x] Chaincode checks invoker MSP and certificate attributes through `ctx.clientIdentity`.
- [x] Admin-only functions reject doctor/patient identities and enforce clinic-bound admin certificates where applicable.
- [x] Doctor-only functions reject admin/patient identities unless explicitly allowed and enforce actor/assignment/consent checks.
- [x] Patient consent and record functions reject non-owner patients.
- [x] System-only initialization and access logging reject non-system identities.
- [x] Role violation tests exist and pass locally and against the deployed AWS Fabric gateway.

## Patient Management

- [x] Admin can add patient with all SRS fields at source level; AWS smoke test pending.
- [x] Detailed patient PII/clinical fields are stored off-chain in MySQL.
- [x] Phase 4 on-chain writes store only metadata/hash/reference; historical ledger PII cleanup is a deployment gate.
- [x] Unique patient ID is server-generated as `Patient-<UUID>`.
- [x] Admin can update patient demographics through the coordinated Phase 4 API/UI.
- [x] Admin can update insurance information and refresh the on-chain hash.
- [x] Admin and patient owner can retrieve allowed profiles; doctor clinical access remains assignment/consent-bound.
- [x] Admin can assign patient to one or more doctors through the API/UI.
- [x] Admin can delete Fabric metadata and the MySQL identity with confirmation and audit-friendly errors.

## Doctor Management

- [x] Admin can register doctor with name, specialty, clinic, contact, Emirates ID, and license number at source level; AWS smoke test pending.
- [x] Doctor creation is coordinated between MySQL identity/profile rows and Fabric registration; MySQL rolls back if Fabric registration fails.
- [x] Admin can update an on-chain doctor profile within the authenticated clinic scope.
- [x] Admin can list/search/read/update doctors in the authenticated clinic through the Database API and web UI.
- [x] Doctor assigned-patient retrieval uses a parameter-free JWT-derived self endpoint and chaincode certificate actor binding.
- [x] Admin can delete an on-chain doctor record within the authenticated clinic scope.
- [x] Coordinated delete removes Fabric and MySQL records and refuses deletion while patients remain assigned.
- [x] Phase 5 migration, chaincode/API/frontend rollout, and authenticated AWS CRUD/self/spoof smoke tests are complete.
- [ ] Automate Fabric CA enrollment/revocation for newly created/deleted doctors; current lifecycle remains an explicit operational step.

## Clinical Records

- [x] Doctor can add medical history.
- [x] Doctor can add allergies.
- [x] Doctor can add medications.
- [x] Doctor can add lab results.
- [x] Doctor can add dental chart entries.
- [x] Dental chart entries include treatment phase, procedure code, tooth, ceramic type, prescriptions, diagnostics.
- [x] Doctor can retrieve medical records only when assigned or consented.
- [x] Patient can retrieve own medical/dental records.
- [x] Access attempts without consent or assignment are rejected.

## DICOM And Integrity

- [x] DICOM/radiographic files are stored off-chain in the deployed private persistent path.
- [x] SHA-256 hash is computed when file is stored.
- [x] Hash and metadata only are stored on-chain.
- [x] Integrity verification endpoint exists with verified, mismatch, missing file, and unknown states.
- [x] Patient/doctor/admin patient UI shows metadata and verification result.
- [x] Hash mismatch, missing, unknown, upload/hash, metadata-only, and unauthorized source tests exist.

## Consent And Cross-Institution Sharing

- [x] Doctor can initiate cross-clinic request.
- [x] Request records include who, what, when, why, requesting clinic, holding clinic, and data type.
- [x] Holding clinic admin can approve request.
- [x] Holding clinic admin has a separate JWT/MSP-bound rejection endpoint with reason.
- [x] Patient receives request details in mobile app.
- [x] Patient can grant consent.
- [x] Patient has a separate JWT/MSP owner-bound rejection endpoint with reason.
- [x] Consent decision is recorded on-chain with authenticated patient identity.
- [x] Access is granted only after admin approval and patient consent.
- [x] Consent revocation is implemented or formally documented as a deviation.

Phase 8 deployment checkpoint, 2026-07-14: AWS smoke passed for doctor request creation, admin notification/approval, patient notification/read status, patient consent metadata, consent-based doctor access, immutable audit retrieval, revocation, and denied access after revocation. Final Fabric state is `basic` 1.0.9 sequence 11; no MySQL migration was required.

## Audit Logging

- [x] `LogAccess` is automatically called when authorized data is retrieved.
- [x] Log includes actor, patient, timestamp, purpose/request ID, and data type where applicable.
- [x] Audit logs are immutable on-chain.
- [x] Admin/patient audit retrieval view or API exists.

## Appointment Management

- [x] Admin can create appointment with patient, doctor, date/time, and specialty.
- [x] Admin can update appointment.
- [x] Admin can cancel appointment.
- [x] Patient can view upcoming appointments through the authenticated API/mobile source flow.
- [x] Patient can view past and cancelled appointments through the authenticated API/mobile source flow.
- [x] Appointments are organized by specialty/date.

Phase 9 deployment checkpoint, 2026-07-15: migration applied and VM checkout aligned to `f3f8526`; backend/API 33/33 and frontend 8/8 tests, lint/build, API/Nginx checks, and authenticated create/update/cancel/upcoming/past/role-denial smoke passed with marker `PHASE9_APPOINTMENT_SMOKE_OK`.

## Notifications

- [x] Admin receives notification for incoming data requests.
- [x] Patient receives notification after admin approval.
- [x] Notification records persist in database or equivalent storage.
- [x] Notification status can be read/updated.

## Usability

- [x] Web app has no enabled placeholder-only core workflows; sample labs and mock appointment creation are explicitly unavailable pending their implementation phases.
- [x] Mobile app has no hard-coded `Patient1` workflow for protected request/consent API calls.
- [x] Web API base URLs are environment-driven and the Phase 7A frontend container provides same-origin proxy defaults.
- [ ] Core forms show validation errors.
- [ ] Core workflows show loading, empty, success, and failure states.
- [x] Consent status colors are green approved, red rejected, blue pending.
- [ ] Web UI is responsive for desktop and tablet.
- [ ] WCAG 2.1 AA review is completed and findings are addressed or documented.

## Phase 7A Web Frontend Stabilization Gate

- [x] Protected web routes require a valid, unexpired JWT and enforce presentation-level role boundaries.
- [x] Logout, unauthorized navigation, and expired-session clearing are implemented.
- [x] Appointment compatibility reads are JWT scoped for admin, doctor, and patient roles.
- [x] Doctor compatibility reads are clinic scoped for admins and self scoped for doctors.
- [x] Doctor assigned-patient listing derives doctor identity from JWT and revalidates Fabric actor binding.
- [x] Patient list/detail and dashboard appointment views use scoped production APIs without patient payload console logging.
- [x] Sample lab results, mock appointment creation, false dashboard values, and blank Settings/Info routes are removed or explicitly unavailable.
- [x] Frontend tests (4/4), API/source tests (24/24), lint, and production build pass.
- [x] Nginx frontend container, health check, and same-origin API proxies are defined in Compose.
- [ ] Complete Compose runtime is started and health-checked with the Docker engine running.
- [x] AWS deployment runs commit `d6ecc1b`; MySQL, Database API, Blockchain API, Nginx frontend, and public Database API proxy health checks pass.
- [x] Authenticated admin/doctor/patient API smoke passes for scoped appointments, doctor visibility, assigned-patient detail, unauthenticated denial, and disabled sample labs.
- [ ] Interactive authenticated admin/doctor/patient browser UI smoke and responsive screenshots pass against the deployed stack.
- [ ] Real DICOM browser execution is verified and Cornerstone bundling warnings are resolved or formally accepted.
- [ ] Desktop/tablet responsive, keyboard, focus, contrast, and WCAG evidence is captured under Phase 10.

## Deployment And Architecture

- [ ] MySQL 9.0.1 or accepted compatible version documented.
- [ ] Node/Express versions documented.
- [ ] React/React Native versions documented.
- [ ] All non-Fabric SRS services are containerized and started from documented Docker/Compose commands before Phase 12 evidence capture.
- [ ] Fabric/Hyperledger components are either containerized through the selected Fabric topology or explicitly documented as the accepted exception boundary.
- [ ] Fabric network topology matches SRS or deviation is accepted.
- [ ] Two clinic organizations are supported.
- [ ] Two peers per organization are configured or documented as production-only work.
- [ ] Raft orderer topology is configured or documented as production-only work.
- [ ] TLS configuration is documented for Fabric and REST layers.
- [ ] Additional clinic onboarding procedure exists.

## Testing And Evidence

- [ ] Positive tests exist for all core workflows.
- [ ] Negative tests exist for invalid input.
- [ ] Unauthorized role tests exist.
- [x] Consent bypass tests exist.
- [ ] Expired token tests exist.
- [ ] Boundary tests exist for record sizes and concurrent requests.
- [ ] Caliper read tests cover 1, 10, 50, 100, 200 transactions.
- [ ] Caliper write tests cover 1, 10, 50, 100, 200 transactions.
- [ ] Caliper delete tests cover 1, 10, 50, 100, 200 transactions.
- [ ] Throughput, latency, success rate, CPU, and memory evidence is saved.

## Final Handover

- [ ] `SRS_Gap_Traceability_Matrix.md` shows no unresolved required gaps.
- [ ] `SRS_Remediation_Roadmap.md` phases are marked complete.
- [ ] `EDR_Remediation_Change_Log.md` is updated with exact code/config changes.
- [ ] README and setup docs are current.
- [ ] Final SRS compliance report is generated.
