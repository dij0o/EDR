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
| FR-01 | Authenticate all users via username/password against organizational records. | Partial | Database `/login` exists in `backend/server.js`. Web and mobile call it, protected business APIs require JWTs, patient login returns the durable `Patient.Blockchain_ID`, and public `/register` requires Admin/System authorization. The AWS migration and smoke suite passed again after commit `4892875` was deployed. | Extend authenticated coverage to the remaining incomplete SRS endpoints and workflows. |
| FR-02 | Issue JWT signed with user's MSP digital certificate. | Phase 2 Deviation | API JWTs remain signed with the shared deployment `JWT_SECRET`, but verified JWT organization/actor claims now select clinic-, doctor-, patient-, or system-bound X.509 Fabric wallet identities. The shared `appUser` is no longer used by active Phase 2 routes. | If strict FR-02 wording is mandatory, replace shared-secret JWT signing with an MSP-backed token signing/verification design. |
| FR-03 | Enforce role-based UI rendering and permitted data/features. | Implemented for current web routes | Phase 7A adds a central protected-route boundary, presentation-level role gates, unauthorized handling, and authoritative server scoping. Phase 8 web/API consent workflow is deployed with role-bound routes. Backend and chaincode controls remain the security boundary. | Extend the same complete treatment to Phase 9 workflows and packaged mobile runtime evidence. |
| FR-04 | JWT tokens expire after configurable timeout. | Implemented for web/API | `/login` signs configurable expiring tokens; APIs validate expiry, and Phase 7A clears expired web sessions and provides logout/re-login navigation. | Revisit localStorage bearer-token exposure during Phase 10/11 session hardening and apply the selected mobile lifecycle. |
| FR-05 | Admin add patient with complete demographics, medical, allergy, medication, insurance, clinic data. | Implemented at source | `backend/server.js` `POST /patients`, Phase 4 migration, and `NewPatientDialog.jsx` cover all required fields. PII/details remain in MySQL. | Apply migration and deploy/revalidate on AWS. |
| FR-06 | Invoke `addPatient` chaincode and generate unique patient ID. | Implemented at source with accepted compatible transaction | Database API generates `Patient-<UUID>` and invokes `AddPatientMetadata`; this replaces PII-bearing `addPatient` for SEC-03 compliance. | Deploy upgraded chaincode and treat legacy `addPatient` as deprecated. |
| FR-07 | Admin update patient demographic and insurance via `UpdatePatientInfo`. | Implemented at source with accepted compatible transaction | Admin `PUT /patients/:id` updates MySQL and invokes metadata-only `UpdatePatientMetadata`; web patient cards expose update action. | Deploy and run authenticated update smoke test. |
| FR-08 | Retrieve all patients and individual patient lookup. | Implemented at source | Clinic-scoped admin `GET /patients`, Admin/owner-only `GET /patients/:id`, plus existing Fabric metadata/record routes. | Deploy and verify clinic/owner negative cases. |
| FR-09 | Assign patient to one or more doctors via `AssignPatientToDoctor`. | Implemented at source with accepted compatible transaction | Admin `POST /patients/:id/assign` updates MySQL doctor list and Fabric metadata hash/reference; web card exposes Assign. | Deploy and validate doctor identity exists as operational input. |
| FR-10 | Admin delete patient via `DeletePatient`. | Implemented at source | Admin `DELETE /patients/:id` deletes Fabric metadata first, then MySQL user/patient in a transaction; errors state that MySQL deletion was not committed. UI requires confirmation. | Deploy and test success plus Fabric-failure rollback. |
| FR-11 | Admin register doctors with name, specialty, clinic, contact, license via `addDoctor`. | Implemented at source | Phase 5 migration/schema, coordinated `POST /doctors` (`/registerDoctor` alias), chaincode payload, and admin UI include license and required profile fields. MySQL commits only after Fabric succeeds. | Apply migration, upgrade chaincode/APIs, enroll the generated doctor Fabric identity, and smoke-test on AWS. |
| FR-12 | Admin update doctor profiles via `UpdateDoctorInfo`. | Implemented at source | Clinic-scoped `GET/PUT /doctors/:id`, coordinated Fabric update, and UI edit states are present. | Deploy and run positive plus cross-clinic negative smoke tests. |
| FR-13 | Doctor retrieve assigned patients via `GetPatientsAssignedToDoctor`. | Deployed and runtime verified | Phase 7A UI calls parameter-free Database API `GET /doctor/me/assigned-patients`; the API derives doctor identity from JWT, revalidates it through the actor-bound Blockchain API route, and returns only assigned MySQL patient records. AWS assigned-patient list/detail smoke passed under commit `d6ecc1b`. | Retain cross-doctor denial in the interactive browser regression pack. |
| FR-14 | Admin delete doctors via `DeleteDoctor`. | Implemented at source | Clinic-scoped coordinated delete removes Fabric then MySQL and blocks deletion while patients remain assigned; UI requires confirmation and shows clear errors. | Deploy and test assigned conflict, cross-clinic denial, and successful deletion/revocation. |
| FR-15 | Doctors add medical records for assigned patients via `AddMedicalRecord`. | Deployed and verified | Doctor-only coordinated MySQL/Fabric write includes medical history, allergies, labs, and medications; assigned/consented access and metadata-only anchoring enforced. | Complete. |
| FR-16 | Doctors/patients retrieve medical records subject to consent via `GetMedicalRecords`. | Deployed and verified | Doctor/patient APIs and UI retrieve off-chain payloads only after Fabric access evaluation; successful reads are logged immutably. | Complete. |
| FR-17 | Doctors add dental chart entries via `AddDentalChartEntry`. | Deployed and verified | Canonical transaction/API supports treatment phase, procedure code, tooth, ceramic type, prescriptions, and diagnostics with off-chain payload storage. | Complete. |
| FR-18 | Retrieve complete dental chart history via `GetAllDentalChartData`. | Deployed and verified | Canonical and legacy aliases return access-checked metadata used to retrieve complete MySQL dental history; doctor/patient AWS smoke passed. | Complete. |
| FR-19 | DICOM/radiographic files off-chain with SHA-256 hash on-chain. | Deployed and verified | Private filesystem bytes and opaque metadata-only Fabric anchor deployed with `basic` 1.0.5 sequence 7; doctor upload/list and patient/admin status smoke checks passed. | Complete. |
| FR-20 | Verify integrity by comparing on-chain hash to current off-chain file content. | Deployed and verified | JWT/MSP-protected verification returned `verified`, detected tamper as `mismatch`, reported deleted content as `missing file`, and denied an unauthorized doctor on AWS. | Complete. |
| FR-21 | Doctors initiate cross-clinic data access request. | Deployed and verified | `/requestDataAccess` and `/requestAccess` are doctor-only, JWT doctor-bound, and submit enriched request metadata including data type, purpose, requesting clinic, holding clinic, requester, timestamps, and details JSON. AWS smoke created request `11544b6bf91fb05d592f43be492835a7d601c9b4c89eb1b94dead6c116ffa768`. | Complete. |
| FR-22 | Holding clinic admin notified and approves/rejects request. | Deployed and verified | `RequestDataAccess` writes an admin notification; admin routes approve or reject with reason and clinic/MSP-bound identity; web Data Requests page exposes approve/reject actions. AWS smoke verified admin notification and approval. | Complete for deployed web/API workflow. |
| FR-23 | Patient receives mobile notification with full requesting-party details. | Deployed and verified for in-app ledger notification | Admin approval writes a patient notification; mobile request screens display request data type, purpose/reason, requester, and timestamps from the authenticated patient request feed. AWS smoke verified patient notification and read-status update through the deployed API. | External push delivery and packaged mobile-device runtime evidence remain separate if required. |
| FR-24 | Patient grants/rejects consent recorded on-chain with cryptographic signature. | Deployed and verified | Patient grant/reject routes remain JWT owner-bound; chaincode records patient consent actor ID, MSP ID, Fabric transaction ID, and decision timestamps. AWS smoke verified patient consent metadata and access decision effects. | Complete for Fabric identity/transaction evidence; strict detached digital-signature wording would require a separate signature artifact design. |
| FR-25 | Access only after admin approval and patient consent. | Deployed and verified | Consent-based sharing is only granted after admin approval and patient consent; revocation removes active sharing when no other granted request remains. AWS smoke verified denial before consent, access after approval/consent, revocation, and denial after revocation. | Complete. |
| FR-26 | All access events logged immutably via `LogAccess`. | Deployed and verified | Clinical reads call immutable ledger logging; Phase 8 adds access basis, request ID, purpose, and data type where available plus admin/patient audit retrieval aliases. AWS smoke verified immutable audit retrieval for consent-based access. | Complete. |
| FR-27 | Patients retrieve incoming/outgoing access requests. | Deployed and verified | Patient request retrieval remains JWT patient-bound and mobile screens now render canonical request details with grant/reject/revoke paths. AWS smoke verified patient consent flow against authenticated patient-owned request data. | Complete for API/web and patient mobile source flow; packaged mobile runtime evidence remains separate. |
| FR-28 | Admins view active requests for organization. | Deployed and verified | Admin request retrieval is organization/clinic scoped, linked to notification records, and surfaced in the web Data Requests workflow with approve/reject actions. AWS smoke verified holding-clinic admin notification and approval. | Complete. |
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
| `RequestDataAccess` | Deployed and verified | Present, exposed, doctor-bound, enriched with request purpose, data type, clinic context, timestamps, and notification creation, and verified on AWS under `basic` 1.0.9 sequence 11. |
| `ApproveRequest` | Deployed and verified | Present, exposed, admin-bound, creates patient notification, and verified in the AWS Phase 8 smoke. |
| `RejectRequest` | Deployed and verified | Present with admin/patient rejection metadata, reason, and doctor notification; covered by Phase 8 source tests and deployed chaincode. |
| `ProvideConsent` | Deployed and verified | Present with patient owner binding plus consent actor, MSP, transaction ID, and timestamp metadata; verified in the AWS Phase 8 smoke. |
| `RejectConsent` | Missing/Mismatch | No distinct `RejectConsent`; rejection uses `RejectRequest`. |
| `RevokeConsent` | Deployed and verified | Added patient owner-bound revocation with sharing cleanup and doctor notification; AWS smoke verified access denial after revocation. |
| `LogAccess` | Deployed and verified | Clinical access logging is automatic for protected clinical reads and now includes consent request context where available; AWS smoke verified immutable audit retrieval. |
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
| `GET /getPatientByID/:id` | Deployed and verified | Canonical JWT-protected route calls `ReadPatient`; legacy `/readPatient/:patientID` remains compatible. Patient self-access and chaincode record-access rules apply. |
| `POST /addMedicalRecord` | Deployed and verified | Doctor-only route requires the JWT doctor ID to match `doctorID`; chaincode enforces assignment/consent record access. |
| `GET /getDentalChartData/:id` | Deployed and verified | JWT-protected Admin/Doctor/Patient/System route calls `getAllDentalChartData`; patient self and chaincode record-access rules apply. |
| `POST /requestAccess` | Deployed and verified | SRS alias uses the same doctor-only, actor-bound handler as `/requestDataAccess`. |
| `POST /approveRequest` | Partial | Present and now Admin-authenticated with clinic claim matching. Needs rejection counterpart and notifications. |
| `POST /grantConsent` | Deployed and verified | SRS alias uses the same patient-only, owner-bound handler as `/provideConsent`. |
| `GET /getPendingRequests` | Deployed and verified | Patient-only route derives the patient ID from the verified JWT instead of accepting an impersonable path parameter. |
| `PUT /patient/:id`; `DELETE /patient/:id` | Deployed and verified | Admin-only routes expose chaincode update/delete. Update and chaincode delete enforce the admin clinic certificate binding. |
| `GET /doctor/:id`; `PUT /doctor/:id`; `DELETE /doctor/:id` | Deployed and verified | Read permits Admin/System or the same Doctor identity; mutations are Admin-only and clinic-bound. |
| `POST /admin/rejectRequest`; `POST /patient/rejectRequest` | Deployed and verified | Separate role-specific routes call the stage-aware `RejectRequest` transaction; admin clinic and patient actor binding are enforced. |

## Security Requirements

| SEC ID | Requirement Summary | Status | Gap To Close |
|---|---|---|---|
| SEC-01 | All API endpoints require JWT with role validation. | Partial | Database API and Blockchain API business routes now use JWT/role middleware. Public routes remain root, `/login`, and bootstrap `/register`. | Decide whether bootstrap registration remains an accepted setup exception; add automated unauthorized/role tests. |
| SEC-02 | Chaincode verifies MSP identity before executing. | Implemented | Deployed chaincode validates trusted Org1MSP/Org2MSP plus certificate role, actorID, and admin clinicID attributes. JWT claims select matching role-bound wallet identities. Chaincode `basic` 1.0.1 sequence 3 is committed on AWS; 16 unit and 9 live identity checks pass. | Extend the same identity-provisioning procedure when onboarding new clinics, doctors, or patients. |
| SEC-03 | No PII stored directly on-chain. | Implemented for Phase 4 patient writes; legacy cleanup pending deployment | Metadata transactions store only patient ID, clinic/doctor IDs, opaque MySQL reference, SHA-256 hash, timestamps, and policy marker. Historical patient objects still contain PII until sanitized; doctor PII remains Phase 5 scope. | Deploy chaincode upgrade, migrate legacy patient state, and complete doctor split in Phase 5. |
| SEC-04 | Off-chain record integrity via SHA-256 hashes on-chain. | Deployed and verified | Streaming SHA-256, metadata-only Fabric anchoring, Phase 6 access enforcement, patient-owner verification, tamper detection, missing-file reporting, and unauthorized-doctor denial passed on AWS. |
| SEC-05 | Prevent replay with uniqueness/timestamps. | Evidence Needed | Fabric tx IDs exist; no app-level nonce strategy found. |
| SEC-06 | Prevent impersonation through certificate identity. | Implemented for current AWS identities | Active Blockchain API routes no longer select shared `appUser`; JWT organization/blockchain claims map to clinic/actor-bound X.509 wallet identities carrying CA attributes. | Automate identity enrollment/revocation as user lifecycle management expands. |
| SEC-07 | TLS encrypted communication between layers. | Partial | Fabric TLS config exists; REST APIs appear HTTP/local by default. |
| SEC-08 | Patient data sharing only with authorized personnel and explicit consent. | Deployed and verified | Deployed chaincode paths enforce doctor identity, assignment or granted sharing, patient ownership, and consent decisions. Phase 8 adds enriched request records, admin/patient notifications, revocation, identity metadata on consent, and automatic clinical audit context. AWS smoke verified denial before consent, consent-based access, audit retrieval, revocation, and denial after revocation. | Complete for deployed API/web workflow. |

## Non-Functional And Usability Requirements

| Area | Status | Gap To Close |
|---|---|---|
| Performance targets | Evidence Needed | Caliper configs exist for read/write/delete, but current evidence package needs to be tied to latest code and SRS metrics. |
| Reliability and availability | Partial | Default Fabric test network uses one peer per org and one orderer, not two peers per org plus Raft fault tolerance target. Non-Fabric application services must be containerized before Phase 12 evidence capture. |
| Scalability | Partial | Database schema is broad, but APIs do not expose many entities. Org onboarding is mostly Fabric sample behavior. |
| Containerized deployment | Partial at source | Phase 7A adds a multi-stage Nginx web image, frontend health check, and same-origin Database/Blockchain API proxy definitions to Compose. Docker engine runtime proof is pending, and Phase 11 must still document/containerize the full non-Fabric topology and Fabric exception boundary. |

## Phase 7A Web Frontend Stabilization Evidence

| Area | Status | Evidence / Remaining Gap |
|---|---|---|
| Legacy list authorization | Source verified | `/Appointment` is role/identity scoped and `/Doctor` is clinic/self scoped; source tests cover both compatibility paths. |
| Patient visibility | Source verified | Doctor list and detail use scoped Database API routes with JWT-derived identity, assignment checks, and Fabric actor revalidation; client-side `sharedWith` authorization logic and PII console output were removed. |
| Session and routes | Source verified | Protected/role routes, token-expiry clearing, logout, unauthorized state, and wildcard redirect are implemented. |
| Functional truth | Source verified | Dashboard appointments use persisted scoped data; sample labs and mock appointment creation are explicitly disabled; Settings/Info are functional. |
| Engineering gate | Verified locally | Frontend 4/4, API/source 24/24, lint pass, and Vite build pass. Cornerstone browser shims and the 1.37 MB patient/DICOM lazy chunk remain for browser/performance validation. |
| Container delivery | Deployed in current accepted topology; Phase 11 partial | Commit `d6ecc1b` is live with Docker MySQL/Database API, PM2 Blockchain API, and the rebuilt static frontend behind Nginx. Public frontend/proxy and authenticated runtime smoke pass. All-services Compose/container alignment remains Phase 11 work. |
| Web responsive desktop/tablet UI | Partial | React app exists; many flows are placeholders/static and route protection is weak. |
| Patient mobile Android/iOS | Partial | Expo app now uses `/login`, token context, env-driven API helpers, and JWT headers. Patient blockchain ID mapping remains incomplete. |
| WCAG 2.1 AA | Evidence Needed | No accessibility audit evidence found; many custom controls need review. |
| Consent status colors | Deployed and verified | Request status colors now map granted to green, pending to blue, and rejected/revoked states to red in the authenticated data request flow. Phase 8 web frontend was rebuilt and deployed to Nginx. |
| HIPAA minimum necessary | Partial | SRS says PII off-chain, but current chaincode stores PII on-chain. |
| GDPR audit | Deployed and verified | Immutable clinical access logs are automatic for protected clinical reads and admin/patient audit retrieval is exposed; AWS Phase 8 smoke verified audit retrieval after consent-based access. |
| Explicit/revocable consent | Deployed and verified | Grant, reject, and revoke paths exist with patient owner binding and chaincode state updates; AWS Phase 8 smoke verified revocation and denial after revocation. |

## Immediate Remediation Priorities

1. Apply/verify the patient `Blockchain_ID` migration and run the Phase 1 AWS VM smoke tests. **Passed on 2026-07-11.**
2. Implement chaincode MSP/RBAC checks. **Passed on AWS; `basic` 1.0.1 sequence 3 remains committed after Git-synchronized redeployment of `4892875`.**
3. Add API endpoint parity with SRS section 5.
4. Complete patient/doctor CRUD and assignment workflows.
5. Complete medical/dental record APIs and UI with consent checks.
6. Add DICOM/off-chain file hashing and verification.
7. Complete consent notifications, access logging, and audit views. **Passed on AWS 2026-07-14.**
8. Implement appointment create/update/cancel and mobile appointment history.
9. Remove remaining placeholder/static web and mobile workflows.
10. Containerize all non-Fabric services and document the Fabric/Hyperledger exception boundary before Phase 12.
11. Produce tests and evidence for FR, SEC, performance, and usability requirements.
