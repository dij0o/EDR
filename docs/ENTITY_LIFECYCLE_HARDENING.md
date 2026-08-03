# Entity lifecycle hardening

This release treats clinic actors as security principals whose MySQL account, Fabric identity, and ledger record must move through one coordinated lifecycle.

## Enforced behavior

- Clinic creation provisions `admin-<clinicID>` immediately. Lazy enrollment remains a recovery path, and startup reconciliation covers active pre-existing clinics.
- Doctor and patient identifiers, clinic ownership, credentials, and relationship arrays cannot be changed through profile-update payloads.
- Doctor/patient assignment and unassignment update both MySQL and Fabric. The unassign transaction removes both sides of the ledger relationship atomically.
- Doctor and patient removal is a deactivation. Historical MySQL and ledger records remain, sessions are revoked, security versions are advanced, and the application wallet identity is retired.
- Compatibility transactions named `DeleteDoctor` and `DeletePatient` remain callable only to return `HARD_DELETE_FORBIDDEN`; they can never invoke `deleteState`.
- Active-actor filters prevent deactivated accounts from appearing in normal doctor, patient, assignment, and appointment selection flows.
- Fabric certificates are renewed before expiry. Expired certificates fail closed and require registrar-led recovery; the service never silently replaces an expired credential.
- Startup reconciliation enrolls active clinic admins, doctors, and patients and recreates missing active doctor ledger actors from authoritative MySQL data.

## Cross-store operation evidence

`Entity_Lifecycle_Operation` records the operation type, actor, tenant, correlation ID, payload digest, current stage, completion state, and failure details. System administrators can inspect it through `GET /api/database/lifecycle-operations`.

This record makes partial MySQL/Fabric failures visible and auditable. It does not make the two stores one ACID transaction; failed operations still require an operator to inspect the recorded stage and reconcile before retrying.

Apply the schema before starting the updated API:

```bash
./scripts/apply-entity-lifecycle-hardening-migration.sh
```

The API health check remains unhealthy until the migration is present.

## Operational security notes

- Fabric CA revocation and removal from the application wallet prevent continued application use. If peer-side certificate revocation enforcement is required, regenerate and distribute the CA CRL through the Fabric MSP/channel governance process.
- Do not reuse deactivated doctor or patient blockchain IDs. Ledger tombstones are intentionally permanent history.
- Monitor failed lifecycle operations and certificates approaching the `FABRIC_IDENTITY_RENEWAL_DAYS` threshold.
