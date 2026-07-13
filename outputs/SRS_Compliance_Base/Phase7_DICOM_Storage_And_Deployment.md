# Phase 7 DICOM Storage And Deployment

Date: 2026-07-12
SRS coverage: FR-19, FR-20, SEC-04

## Storage decision

Phase 7 uses a private server filesystem for DICOM/radiographic bytes. `RADIOGRAPHIC_STORAGE_ROOT` selects the persistent directory and defaults to `dental-backend/data/radiographic-files`. Fabric stores only the generated file ID, patient ID, opaque `filesystem:<fileID>` reference, original filename, media type, byte size, uploader, timestamp, and SHA-256 digest.

This is the smallest deployable strategy for the current single Blockchain API host. Database BLOB storage was rejected because it burdens MySQL with large binary payloads; public IPFS was rejected because clinical images must not be publicly retrievable; object storage remains the preferred future multi-host strategy but requires an approved private bucket, encryption/KMS, lifecycle, and IAM design. The opaque reference deliberately does not expose a host path.

No MySQL migration is required. Fabric gains `AddDentalFileMetadata`, `GetDentalFile`, and the revised `getDentalFiles` metadata index, so a chaincode upgrade is required.

## API contract

- `POST /radiographic-files`: Doctor JWT only. Body is raw `application/octet-stream`; required headers are `x-patient-id` and `x-file-name`, with optional `x-file-media-type`.
- `GET /patients/:patientID/radiographic-files`: Admin/Doctor/Patient/System, with chaincode patient ownership, assignment, or consent enforcement.
- `GET /radiographic-files/:fileID/verify-integrity`: same read roles and chaincode access check. Returns `verified`, `mismatch`, `missing file`, or `unknown`.

The maximum upload is controlled by `RADIOGRAPHIC_MAX_FILE_BYTES` and defaults to 512 MiB. If Fabric anchoring fails, the newly written file is deleted.

## AWS deployment result - 2026-07-12

- Pre-copy backup: `/home/ubuntu/deployment-backups/20260712-111048-phase7-source-precopy`.
- Deployment backup: `/home/ubuntu/deployment-backups/20260712-111209-phase7-predeploy`.
- Persistent storage: `/var/lib/edr/radiographic-files`, owned by the Blockchain API account with mode `0700`.
- Fabric: `basic` version `1.0.5`, sequence `7`, committed with Org1MSP and Org2MSP approvals.
- Verification: 17 Blockchain API source tests and 18 chaincode tests passed on AWS; frontend production build, PM2 restart, Nginx validation/reload passed.
- Disposable smoke: upload plus metadata-only SHA-256 anchor, assigned-doctor list, doctor `verified`, patient-owner `verified`, unauthorized-doctor 403, admin `verified`, tampered `mismatch`, and deleted `missing file` all passed.
- The disposable file bytes were deleted by the missing-file case. The immutable disposable metadata remains on the test ledger as expected.
- No MySQL migration was required or executed.

## Repeat deployment procedure

1. Back up the current checkout, Fabric state, and service configuration.
2. Create a persistent private directory outside the Git checkout, owned by the Blockchain API service account, mode `0700` (for example `/var/lib/edr/radiographic-files`).
3. Set `RADIOGRAPHIC_STORAGE_ROOT` to that directory and optionally set `RADIOGRAPHIC_MAX_FILE_BYTES`.
4. Upgrade chaincode with both organization approvals and a new version/sequence.
5. Restart the Blockchain API and rebuild/deploy the frontend.
6. Upload a disposable DICOM as an assigned doctor; confirm the file exists off-chain and the ledger metadata contains no bytes.
7. Verify as doctor and patient, mutate the disposable file and confirm `mismatch`, remove it and confirm `missing file`, and confirm an unauthorized doctor receives 403.
8. Remove disposable evidence according to the clinical-data retention policy; do not delete real ledger history.

For future deployments, record version, sequence, backup path, environment path, and smoke-test results here and in `Outputs/EDR_fixes.xlsx` only after execution.
