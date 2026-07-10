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

Checkpoint note, 2026-07-10: Phase 1 is implemented at source level. Patient owner-only request and consent calls now have an off-chain `Patient.Blockchain_ID` source and API boundary checks. Runtime deployment must apply `database/migrations/2026-07-10-add-patient-blockchain-id.sql`, set the required AWS environment values, and complete the smoke tests in `Phase1_AWS_Deployment_Runbook.md`.

## Chaincode Security

- [ ] Chaincode checks invoker identity through `ctx.clientIdentity`.
- [ ] Admin-only functions reject doctor/patient identities.
- [ ] Doctor-only functions reject admin/patient identities unless explicitly allowed.
- [ ] Patient consent functions reject non-owner patients.
- [ ] Role violation tests exist and pass.

## Patient Management

- [ ] Admin can add patient with all SRS fields.
- [ ] Detailed PII/clinical fields are stored off-chain.
- [ ] On-chain record stores only allowed metadata/hashes/references.
- [ ] Unique patient ID is generated or enforced.
- [ ] Admin can update patient demographics.
- [ ] Admin can update insurance information.
- [ ] Admin/Doctor can retrieve allowed patient records.
- [ ] Admin can assign patient to one or more doctors.
- [ ] Admin can delete patient record.

## Doctor Management

- [ ] Admin can register doctor with name, specialty, clinic, contact, and license number.
- [ ] Doctor creation is synchronized between database identity and chaincode metadata.
- [ ] Admin can update doctor profile.
- [ ] Doctor can retrieve assigned patients only.
- [ ] Admin can delete doctor record.

## Clinical Records

- [ ] Doctor can add medical history.
- [ ] Doctor can add allergies.
- [ ] Doctor can add medications.
- [ ] Doctor can add lab results.
- [ ] Doctor can add dental chart entries.
- [ ] Dental chart entries include treatment phase, procedure code, tooth, ceramic type, prescriptions, diagnostics.
- [ ] Doctor can retrieve medical records only when assigned or consented.
- [ ] Patient can retrieve own medical/dental records.
- [ ] Access attempts without consent or assignment are rejected.

## DICOM And Integrity

- [ ] DICOM/radiographic files are stored off-chain.
- [ ] SHA-256 hash is computed when file is stored.
- [ ] Hash and metadata are stored on-chain.
- [ ] Integrity verification endpoint exists.
- [ ] UI shows verification result.
- [ ] Hash mismatch test exists.

## Consent And Cross-Institution Sharing

- [ ] Doctor can initiate cross-clinic request.
- [ ] Request records include who, what, when, why, requesting clinic, holding clinic, and data type.
- [ ] Holding clinic admin can approve request.
- [ ] Holding clinic admin can reject request with reason.
- [ ] Patient receives request details in mobile app.
- [ ] Patient can grant consent.
- [ ] Patient can reject consent.
- [ ] Consent decision is recorded on-chain with authenticated patient identity.
- [ ] Access is granted only after admin approval and patient consent.
- [ ] Consent revocation is implemented or formally documented as a deviation.

## Audit Logging

- [ ] `LogAccess` is automatically called when authorized data is retrieved.
- [ ] Log includes actor, patient, timestamp, purpose/request ID, and data type where applicable.
- [ ] Audit logs are immutable on-chain.
- [ ] Admin/patient audit retrieval view or API exists.

## Appointment Management

- [ ] Admin can create appointment with patient, doctor, date/time, and specialty.
- [ ] Admin can update appointment.
- [ ] Admin can cancel appointment.
- [ ] Patient can view upcoming appointments in mobile app.
- [ ] Patient can view past appointments in mobile app.
- [ ] Appointments are organized by specialty/date.

## Notifications

- [ ] Admin receives notification for incoming data requests.
- [ ] Patient receives notification after admin approval.
- [ ] Notification records persist in database or equivalent storage.
- [ ] Notification status can be read/updated.

## Usability

- [ ] Web app has no placeholder-only core workflows.
- [x] Mobile app has no hard-coded `Patient1` workflow for protected request/consent API calls.
- [ ] API base URLs are environment-driven.
- [ ] Core forms show validation errors.
- [ ] Core workflows show loading, empty, success, and failure states.
- [ ] Consent status colors are green approved, red rejected, blue pending.
- [ ] Web UI is responsive for desktop and tablet.
- [ ] WCAG 2.1 AA review is completed and findings are addressed or documented.

## Deployment And Architecture

- [ ] MySQL 9.0.1 or accepted compatible version documented.
- [ ] Node/Express versions documented.
- [ ] React/React Native versions documented.
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
- [ ] Consent bypass tests exist.
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
