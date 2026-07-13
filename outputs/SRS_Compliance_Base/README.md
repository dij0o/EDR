# EDR SRS Compliance Baseline

Prepared by: Codex
Date: 2026-07-10
Workspace: `C:\Workbench\EDR_Source`

## Purpose

This folder is the shared reference point for bringing `Source_Code_Remediation` into alignment with `SRS-EDR-001_Blockchain_EDR_System.docx`.

Use these files at the start of future threads instead of repeating the full SRS/code audit. The baseline is code-level only. It records what was found from source inspection, not from executing the application.

## Source Of Truth

| Item | Path |
|---|---|
| SRS document | `C:\Workbench\EDR_Source\Documents\SRS-EDR-001_Blockchain_EDR_System.docx` |
| Working implementation | `C:\Workbench\EDR_Source\Source_Code_Remediation` |
| Original source snapshot | `C:\Workbench\EDR_Source\Source_Code` |
| Existing remediation change log | `C:\Workbench\EDR_Source\Outputs\EDR_Remediation_Change_Log.md` |

## Documents In This Pack

| Document | Use |
|---|---|
| `SRS_Gap_Traceability_Matrix.md` | Requirement-by-requirement baseline with status, evidence, and needed work. |
| `SRS_Remediation_Roadmap.md` | Phased implementation plan to close all gaps. |
| `SRS_Acceptance_Checklist.md` | Completion criteria for each feature area. |
| `Thread_Startup_Context.md` | Compact context to paste/read in future Codex threads to save tokens. |
| `Phase1_AWS_Deployment_Runbook.md` | Existing AWS VM migration, env, and smoke-test checklist for Phase 1 rollout. |

## Current Baseline Summary

The remediation codebase has a credible prototype foundation, but it does not yet meet the SRS as a complete functional or usable product.

Primary gaps:

- Phase 1 API-layer JWT/role enforcement is deployed on AWS; the patient mapping, matching JWT secrets, protected registration, service restarts, and public smoke suite passed again after pushed commit `4892875` was synchronized.
- Phase 2 MSP/certificate binding and chaincode RBAC are deployed for the current AWS admin, doctor, patient, and system identities; automated enrollment/revocation remains incomplete.
- Chaincode `basic` 1.0.1 sequence 3 validates trusted MSP, role, actor, clinic, assignment, ownership, and consent context on covered paths.
- REST endpoints do not fully match the SRS endpoint registry.
- Patient, doctor, clinical record, appointment, notification, DICOM/hash, and audit flows are partial.
- Mobile now uses `/login`, JWT headers, and the authenticated user's off-chain `Patient.Blockchain_ID` for patient request/consent calls.
- Web and mobile screens include placeholder/static workflows.
- Fabric default topology is closer to a development test network than the SRS target topology.
- Before Phase 12 evidence capture, every non-Fabric service must be containerized and the Fabric/Hyperledger exception boundary must be documented.
- Test and verification evidence is incomplete.
- Chaincode test tooling needs an ESLint parser/`ecmaVersion` update so the standard `npm test` command reaches the 16 passing Mocha tests.

## Recommended Future Thread Start

Future threads should begin with:

1. Read `Outputs\SRS_Compliance_Base\Thread_Startup_Context.md`.
2. Read the relevant section of `SRS_Gap_Traceability_Matrix.md`.
3. Work in `Source_Code_Remediation` only unless the user explicitly asks otherwise.
4. Update the baseline documents after each completed remediation phase.

## Update Rules

When a gap is fixed, update:

- Requirement status in `SRS_Gap_Traceability_Matrix.md`.
- Phase progress in `SRS_Remediation_Roadmap.md`.
- Completion evidence in `SRS_Acceptance_Checklist.md`.

Use exact files and line references where possible.
