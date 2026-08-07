# FR-21 Cross-Clinic Care Lifecycle Addendum

## Purpose

This addendum separates two workflows that must not be represented by one permanent patient-wide data-access flag:

1. A referral or shared-care episode, where another doctor treats a defined problem for a limited period.
2. A transfer of care, where the patient's current treating clinic changes at a defined cutover time.

Clinics remain application-level tenants on one private Fabric network. A clinic is never described as owning a patient. Records retain their origin and custodian even after a care relationship ends.

## FR-21A Referral and shared-care episode

A referral request shall record the patient, referring/data-origin clinic, requesting doctor and clinic, clinical purpose, requested record categories, effective dates, urgency, and supporting notes.

The lifecycle is:

`PENDING_ADMIN_APPROVAL -> PENDING_PATIENT_CONSENT -> ACTIVE -> COMPLETED`

The terminal alternatives are `REJECTED`, `CANCELLED`, `REVOKED`, and `EXPIRED`.

- Approval activates only the recorded purpose and data scope.
- An active referral permits the receiving doctor to read the approved source-clinic categories and create records only within the referral episode.
- Referral-created results and the completion summary remain available to the originating care team.
- Completion, revocation, or expiry ends prospective cross-clinic access.
- Ending access never deletes records already created or disclosures already made.
- Reopening care requires a new request; completed requests are immutable history.

## FR-21B Transfer of care

A transfer of care is not a referral and shall use an independent request and approval lifecycle:

`REQUESTED -> IDENTITY_VERIFIED -> RECORDS_PREPARED -> DESTINATION_ACCEPTED -> CUTOVER_COMPLETE`

The terminal alternatives are `CANCELLED` and `REJECTED`.

- At cutover, the destination becomes the current treating clinic.
- The source clinic retains access to the records it created or maintains through the cutover.
- The source clinic receives no automatic access to records created after cutover.
- The destination receives a defined transfer packet and records created after cutover are attributed to it.
- Later source-clinic access requires a new referral or another documented lawful basis.

## Authorization decision

Every clinical read or write shall be decided from the authenticated actor and role, actor clinic, patient, record origin clinic, record type, referral or transfer identifier, purpose, request status, and effective dates. A patient-level `sharedWith` flag is not a sufficient authorization decision.

## Required provenance

New clinical records shall retain `patientID`, `authorDoctorID`, `originClinicID`, `recordType`, `createdAt`, and, when applicable, `referralID`. Amendments shall preserve prior versions and audit history.

## Audit and safeguards

The ledger shall record request creation, administrative action, patient decision, activation, access, completion, revocation, expiry, and exceptional access. Emergency access requires a reason, short validity period, notification, and post-event review. PHI file content remains encrypted off-chain; the ledger stores lifecycle evidence and integrity metadata.

## Access matrix

| Relationship | Permitted visibility |
| --- | --- |
| Origin clinic during active referral | Its own patient history and referral-related results |
| Receiving doctor during active referral | Approved record categories and records in that referral episode |
| Receiving doctor after closure | Records authored by the receiving clinic and the closed referral packet; no unrelated future records |
| Former clinic after transfer | Records it created or maintained through cutover |
| Destination clinic after transfer | Transfer packet and records created under its care |
| Unrelated clinic | No access without another documented lawful basis |
