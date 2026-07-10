# Next Thread Prompt

Read `C:\Workbench\EDR_Source\Outputs\SRS_Compliance_Base\Thread_Startup_Context.md` first, then continue the EDR SRS remediation work in `C:\Workbench\EDR_Source\Source_Code_Remediation`.

Current state:

- Phase 1 is source-complete for API-layer JWT/RBAC, web/mobile JWT usage, patient `Blockchain_ID` mapping, patient owner-only API checks, and protected admin registration.
- The AWS VM is the deployment target. Before moving to Phase 2, run the deployment gate in `C:\Workbench\EDR_Source\Outputs\SRS_Compliance_Base\Phase1_AWS_Deployment_Runbook.md`.
- Track all future changes, migrations, verification results, and known deployment items in `C:\Workbench\EDR_Source\Outputs\EDR_fixes.xlsx`.

Immediate next work:

1. On the AWS VM, apply `Source_Code_Remediation/database/migrations/2026-07-10-add-patient-blockchain-id.sql`.
2. Confirm `JWT_SECRET` matches between `backend/.env` and `dental-backend/.env`.
3. Decide whether `ADMIN_BOOTSTRAP_TOKEN` is needed for bootstrap registration; if used, rotate or remove it after bootstrap.
4. Restart the Database API, Blockchain API, and frontend deployment.
5. Run the Phase 1 smoke tests listed in the AWS runbook.
6. Update `EDR_fixes.xlsx`, `SRS_Remediation_Roadmap.md`, `SRS_Gap_Traceability_Matrix.md`, and `Thread_Startup_Context.md` with the AWS results.

Only after the AWS Phase 1 gate passes, start Phase 2:

- Implement chaincode-level MSP/RBAC checks using `ctx.clientIdentity`.
- Replace shared Fabric identity assumptions where required by the SRS.
- Add role violation tests for admin, doctor, and patient paths.
