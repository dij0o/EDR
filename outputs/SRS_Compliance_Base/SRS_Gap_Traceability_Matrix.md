# SRS Gap Traceability Matrix

Prepared by: Codex
Date: 2026-07-10
Scope: Static code-level review of `C:\Workbench\EDR_Source\Source_Code_Remediation`

## Status Legend

| Status | Meaning |
|---|---|
| Implemented | Code path appears present and usable at source level. |
| Partial | Some code exists, but missing API/UI/security/persistence/integration pieces. |
| Missing | No meaningful code-level implementation found. |
| Mismatch | Code exists but does not match the SRS naming, contract, or behavior. |
| Evidence Needed | Code or config exists, but verification evidence is not present. |

## Key Code Areas Reviewed

| Area | Path |
|---|---|
| Database API | `Source_Code_Remediation\backend\server.js` |
| Blockchain API | `Source_Code_Remediation\dental-backend\index.js` |
| Main chaincode | `Source_Code_Remediation\fabric-samples\dental-record-sharing\chaincode-javascript\lib\dentalRecordSharing.js` |
| Web app | `Source_Code_Remediation\bc-dentistry-frontend` |
| Mobile app | `Source_Code_Remediation\BC-Dentistry-Mobile-App` |
| Database schema | `Source_Code_Remediation\database\dump.sql` |
| Deployment/setup | `Source_Code_Remediation\docker-compose.yml`, `Source_Code_Remediation\fabric-samples\test-network` |

## Functional Requirements

| SRS ID | Requirement Summary | Status | Code-Level Evidence | Gap To Close |
|---|---|---|---|---|
| FR-01 | Authenticate all users via username/password against organizational records. | Partial | Database `/login` exists in `backend/server.js`. Web and mobile now call it. Business API routes now require JWT at the API layer. Patient login now joins `Patient.Blockchain_ID` for authenticated on-chain patient identity. Public `/register` now requires Admin/System JWT or `ADMIN_BOOTSTRAP_TOKEN`. | Apply the patient mapping DB migration in runtime environments and capture AWS smoke-test evidence. |
| FR-02 | Issue JWT signed with user's MSP digital certificate. | Phase 2 Deviation | Phase 1 JWTs are API session tokens signed with `JWT_SECRET`; `Phase1_AWS_Deployment_Runbook.md` documents the decision because current Fabric gateway uses shared `appUser`. | Implement user-specific MSP/certificate binding during Phase 2 chaincode/gateway identity work. |
| FR-03 | Enforce role-based UI rendering and permitted data/features. | Partial | Database and Blockchain APIs now enforce JWT roles on business routes. Web/mobile send JWTs on protected calls. Patient request/consent API routes now reject patient IDs that do not match the authenticated `blockchainID` claim. | Add chaincode-level MSP/RBAC checks and complete UI-level route/feature gating tests in later phases. |
| FR-04 | JWT tokens expire after configurable timeout. | Implemented | `/login` signs tokens using `JWT_EXPIRES_IN` with a `2h` default. Protected APIs verify token expiry through JWT validation. | Add expiry/session UX such as logout or re-login prompts in web/mobile. |
| FR-05 | Admin add patient with complete demographics, medical, allergy, medication, insurance, clinic data. | Partial | Web add-patient posts only core identity/contact/clinic fields to blockchain API. DB schema has related tables. | Expand data model/API/UI to persist all required fields off-chain and relevant metadata on-chain. |
| FR-06 | Invoke `addPatient` chaincode and generate unique patient ID. | Partial | `/addPatient` calls chaincode `addPatient`, but patient ID is user-supplied. | Add server-side unique patient ID generation or deterministic uniqueness policy. |
| FR-07 | Admin update patient demographic and insurance via `UpdatePatientInfo`. | Partial | Chaincode has `UpdatePatientInfo`; no REST/UI workflow found. | Add authenticated admin API and UI for updates; include insurance/off-chain fields. |
| FR-08 | Retrieve all patients and individual patient lookup. | Partial | `/getAllPatients`, `/readPatient/:patientID`, clinic/doctor filters exist. SRS endpoint name differs. | Add SRS endpoint alias `/getPatientByID/:id`; enforce auth/role and consent rules. |
| FR-09 | Assign patient to one or more doctors via `AssignPatientToDoctor`. | Partial | Chaincode and `/assignPatientToDoctor` exist. UI workflow incomplete. | Add admin UI workflow, validation, and role enforcement. |
| FR-10 | Admin delete patient via `DeletePatient`. | Partial | Chaincode has `DeletePatient`; no REST/UI workflow found. | Add admin-only delete endpoint and UI confirmation/audit behavior. |
| FR-11 | Admin register doctors with name, specialty, clinic, contact, license via `addDoctor`. | Partial | Chaincode/API support doctor fields but no license number. DB `/registerDoctor` is separate. | Add license field, unify DB/on-chain doctor registration, add admin UI. |
| FR-12 | Admin update doctor profiles via `UpdateDoctorInfo`. | Partial | Chaincode has function; no REST/UI workflow found. | Add admin-only update endpoint and UI. |
| FR-13 | Doctor retrieve assigned patients via `GetPatientsAssignedToDoctor`. | Partial | `/getPatientsAssignedToDoctor/:doctorID` exists; web patients page uses it. API now requires Doctor/Admin role and rejects doctor IDs that differ from the authenticated doctor's `blockchainID`. | Add chaincode-level identity checks and tests for unauthorized doctor access. |
| FR-14 | Admin delete doctors via `DeleteDoctor`. | Partial | Chaincode has function; no REST/UI workflow found. | Add admin-only delete endpoint and UI. |
| FR-15 | Doctors add medical records for assigned patients via `AddMedicalRecord`. | Partial | Chaincode has `AddMedicalRecord`; no API/UI workflow found. | Add doctor-only API, UI form, assignment validation, off-chain persistence/hash if needed. |
| FR-16 | Doctors/patients retrieve medical records subject to consent via `GetMedicalRecords`. | Partial | Chaincode has `GetMedicalRecords`, but no API route and weak consent enforcement. | Add API/UI, authenticated patient/doctor access, consent check, audit log. |
| FR-17 | Doctors add dental chart entries via `AddDentalChartEntry`. | Mismatch | Chaincode has lower-case `addDentalChartEntry`; no API/UI workflow found. | Add SRS-named alias or standardize route, API, and UI. |
| FR-18 | Retrieve complete dental chart history via `GetAllDentalChartData`. | Mismatch | Chaincode has lower-case `getAllDentalChartData`; no SRS REST route. | Add proper chaincode alias/API `/getDentalChartData/:id`, role/consent checks. |
| FR-19 | DICOM/radiographic files off-chain with SHA-256 hash on-chain. | Partial | Public DICOM files and viewer code exist; chaincode has `addDentalFile` with CID metadata. No SHA-256 flow found. | Add upload/storage, hash computation, on-chain hash metadata, UI. |
| FR-20 | Verify integrity by comparing on-chain hash to current off-chain file content. | Missing | No verify-integrity API/UI found. | Add verification service, chaincode/API query, UI status. |
| FR-21 | Doctors initiate cross-clinic data access request. | Partial | `/requestDataAccess` and chaincode `RequestDataAccess` exist; web request card posts it. API now requires Doctor role and matches body `doctorID` to JWT `blockchainID`. | Add richer request details and chaincode-level identity checks. |
| FR-22 | Holding clinic admin notified and approves/rejects request. | Partial | Admin approval UI/API exists. API approval now requires Admin role and matching admin organization/clinic claim. Notification and clear admin rejection flow incomplete. | Add notification records and admin reject UI/API with reason. |
| FR-23 | Patient receives mobile notification with full requesting-party details. | Partial | Mobile request list now uses JWT and authenticated patient `blockchainID` from Database API login instead of hard-coded request API calls. No notification system. | Add notification persistence, push/in-app delivery, and full request-detail screen. |
| FR-24 | Patient grants/rejects consent recorded on-chain with cryptographic signature. | Partial | `ProvideConsent` and `RejectRequest` exist; API requires Patient role/JWT and rejects mismatched body `patientID` values. No patient signature/MSP binding beyond Fabric tx identity observed. | Bind consent to authenticated patient identity/certificate and record signature metadata; add chaincode-level owner checks. |
| FR-25 | Access only after admin approval and patient consent. | Partial | Chaincode status transitions and `GetPatientData` sharedWith check exist. API/UI data access routes are incomplete. | Ensure all medical/dental retrieval routes enforce two-step consent before returning data. |
| FR-26 | All access events logged immutably via `LogAccess`. | Partial | `LogAccess` exists in chaincode but is not automatically invoked by data retrieval paths. | Call access log from approved retrieval APIs and add audit view. |
| FR-27 | Patients retrieve incoming/outgoing access requests. | Partial | `/getAllRequestsForPatient/:patientID` exists; mobile runtime calls now use JWT plus the authenticated patient's Database API `blockchainID`, and the Blockchain API rejects mismatched patient IDs. | Add separate incoming/outgoing views if required and regression tests for owner-only access. |
| FR-28 | Admins view active requests for organization. | Partial | `/getRequestsForAdmin/:clinicID` exists and web page uses it. API now requires Admin role and matching organization/clinic claim. | Add active status filtering and notification linkage. |
| FR-29 | Admin create appointments linking patient, doctor, datetime, specialty. | Partial | DB has `Appointment` table; only `GET /Appointment` API. Web dialog is static and does not persist. | Add create appointment API and complete web form persistence. |
| FR-30 | Patients view upcoming/past appointments in mobile by specialty/date. | Partial | Mobile has appointment UI components with static data. | Add authenticated patient appointment API and mobile integration. |
| FR-31 | Admin update/cancel appointments. | Missing | No update/cancel appointment API found. | Add admin-only update/cancel endpoints and UI. |

## Chaincode Function Registry

| SRS Function | Status | Notes |
|---|---|---|
| `addDoctor` | Partial | Present. Needs RBAC/MSP enforcement and license data alignment. |
| `UpdateDoctorInfo` | Partial | Present. No exposed API/UI. |
| `ReadDoctor` | Partial | Present. No SRS REST endpoint and weak auth. |
| `DeleteDoctor` | Partial | Present. No exposed API/UI. |
| `addPatient` | Partial | Present. Missing full SRS data fields and generated unique ID. |
| `UpdatePatientInfo` | Partial | Present. No exposed API/UI; data shape may drop fields. |
| `ReadPatient` | Partial | Present. API uses `/readPatient/:patientID` not SRS `/getPatientByID/:id`. |
| `DeletePatient` | Partial | Present. No exposed API/UI. |
| `RegisterPatientInClinic` | Mismatch | Present as lower-case `registerPatientInClinic`. API route lower-case. |
| `AssignPatientToDoctor` | Mismatch | Present as lower-case `assignPatientToDoctor`. API route lower-case. |
| `GetPatientsAssignedToDoctor` | Mismatch | Present as lower-case `getPatientsAssignedToDoctor`; API uses lower-case chaincode call. |
| `RequestDataAccess` | Partial | Present and exposed. Needs RBAC and richer request details. |
| `ApproveRequest` | Partial | Present and exposed. Needs notification and auth enforcement. |
| `RejectRequest` | Partial | Present, but generic actor rejection. Needs admin/patient distinction. |
| `ProvideConsent` | Partial | Present. Needs cryptographic/patient identity binding. |
| `RejectConsent` | Missing/Mismatch | No distinct `RejectConsent`; rejection uses `RejectRequest`. |
| `LogAccess` | Partial | Present but not integrated automatically. |
| `AddMedicalRecord` | Partial | Present but not exposed. |
| `GetMedicalRecords` | Partial | Present but not exposed and consent enforcement incomplete. |
| `AddDentalChartEntry` | Mismatch | Present as lower-case `addDentalChartEntry`; not exposed. |
| `GetAllDentalChartData` | Mismatch | Present as lower-case `getAllDentalChartData`; not exposed. |
| `GetAllRequestsForPatient` | Partial | Present and exposed. Mobile runtime now uses JWT plus authenticated patient context helper, but patient ID mapping is not complete. |
| `GetPendingRequestsForPatient` | Partial | Present and exposed. |
| `GetRequestsForAdmin` | Partial | Present, exposed, and now protected by Admin role plus clinic claim matching. Needs notification linkage and active filtering. |
| `InitLedger / InitDoctors / InitPatients` | Implemented | Present for bootstrapping. |

## REST API Requirements

| SRS Endpoint | Current Status | Needed Work |
|---|---|---|
| `POST /login` | Partial | Present in Database API only; enforce use in all clients and all protected APIs. |
| `POST /registerDoctor` | Mismatch | DB route exists; blockchain API uses `/addDoctor`. Need unified workflow or alias. |
| `POST /addPatient` | Partial | Present in blockchain API and now Admin-authenticated. Needs full SRS payload and off-chain storage split. |
| `POST /assignPatientToDoctor` | Partial | Present and now Admin-authenticated. Needs complete UI workflow and chaincode identity checks. |
| `GET /getAllPatients` | Partial | Present and now Admin/System-authenticated. Needs SRS endpoint compatibility and tests. |
| `GET /getPatientByID/:id` | Missing/Mismatch | Actual route is `/readPatient/:patientID`. Add SRS alias. |
| `POST /addMedicalRecord` | Missing | Add API route to chaincode. |
| `GET /getDentalChartData/:id` | Missing | Add API route to chaincode. |
| `POST /requestAccess` | Missing/Mismatch | Actual route is `/requestDataAccess`. Add SRS alias or update spec mapping. |
| `POST /approveRequest` | Partial | Present and now Admin-authenticated with clinic claim matching. Needs rejection counterpart and notifications. |
| `POST /grantConsent` | Missing/Mismatch | Actual route is `/provideConsent`. Add SRS alias. |
| `GET /getPendingRequests` | Missing/Mismatch | Actual route requires `/:patientID`. Add authenticated patient route. |

## Security Requirements

| SEC ID | Requirement Summary | Status | Gap To Close |
|---|---|---|---|
| SEC-01 | All API endpoints require JWT with role validation. | Partial | Database API and Blockchain API business routes now use JWT/role middleware. Public routes remain root, `/login`, and bootstrap `/register`. | Decide whether bootstrap registration remains an accepted setup exception; add automated unauthorized/role tests. |
| SEC-02 | Chaincode verifies MSP identity before executing. | Missing/Partial | Role/MSP checks are commented out or absent; implement `ctx.clientIdentity` checks. |
| SEC-03 | No PII stored directly on-chain. | Partial | Patient/doctor chaincode stores names, Emirates ID, email, contact, address. | Move PII off-chain or explicitly revise SRS architecture. |
| SEC-04 | Off-chain record integrity via SHA-256 hashes on-chain. | Missing/Partial | No SHA-256 DICOM/record hash workflow found. |
| SEC-05 | Prevent replay with uniqueness/timestamps. | Evidence Needed | Fabric tx IDs exist; no app-level nonce strategy found. |
| SEC-06 | Prevent impersonation through certificate identity. | Partial | Fabric wallet identity exists, but API uses a shared `appUser` identity. |
| SEC-07 | TLS encrypted communication between layers. | Partial | Fabric TLS config exists; REST APIs appear HTTP/local by default. |
| SEC-08 | Patient data sharing only with authorized personnel and explicit consent. | Partial | Consent state exists; data retrieval APIs/UI incomplete and not consistently enforced. |

## Non-Functional And Usability Requirements

| Area | Status | Gap To Close |
|---|---|---|
| Performance targets | Evidence Needed | Caliper configs exist for read/write/delete, but current evidence package needs to be tied to latest code and SRS metrics. |
| Reliability and availability | Partial | Default Fabric test network uses one peer per org and one orderer, not two peers per org plus Raft fault tolerance target. |
| Scalability | Partial | Database schema is broad, but APIs do not expose many entities. Org onboarding is mostly Fabric sample behavior. |
| Web responsive desktop/tablet UI | Partial | React app exists; many flows are placeholders/static and route protection is weak. |
| Patient mobile Android/iOS | Partial | Expo app now uses `/login`, token context, env-driven API helpers, and JWT headers. Patient blockchain ID mapping remains incomplete. |
| WCAG 2.1 AA | Evidence Needed | No accessibility audit evidence found; many custom controls need review. |
| Consent status colors | Partial | Some UI status colors exist, but not consistently tied to authenticated workflow. |
| HIPAA minimum necessary | Partial | SRS says PII off-chain, but current chaincode stores PII on-chain. |
| GDPR audit | Partial | `LogAccess` exists but is not integrated automatically. |
| Explicit/revocable consent | Partial | Grant/reject exists; revocation path not found. |

## Immediate Remediation Priorities

1. Apply the patient `Blockchain_ID` migration and run the Phase 1 AWS VM smoke tests.
2. Implement chaincode MSP/RBAC checks.
3. Add API endpoint parity with SRS section 5.
4. Complete patient/doctor CRUD and assignment workflows.
5. Complete medical/dental record APIs and UI with consent checks.
6. Add DICOM/off-chain file hashing and verification.
7. Complete consent notifications, access logging, and audit views.
8. Implement appointment create/update/cancel and mobile appointment history.
9. Remove remaining placeholder/static web and mobile workflows.
10. Produce tests and evidence for FR, SEC, performance, and usability requirements.
