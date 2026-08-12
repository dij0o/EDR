# EDR benchmark execution preparation

This package implements the performance scope in `EDR_Testing_Deliverables_Specification_Synergic_.docx`. It treats Hyperledger Caliper as the transaction driver and metrics collector. Fabric proposal signing is part of the normal end-to-end path; cryptographic attack tests remain in the separate security test workstream.

## Prepared scope

- Six canonical BDF workload modules under `caliper/workloads/`:
  - W1 `patient-registration.js` -> `addPatient`
  - W2 `dental-record-entry.js` -> `AddDentalChartEntry`
  - W3 `radiograph-upload.js` -> `AddMedicalRecord` with an off-chain reference and SHA-256 digest only
  - W4 `cross-clinic-request.js` -> `RequestDataAccess`
  - W5 `patient-consent-grant.js` -> `ProvideConsent`
  - W6 `record-retrieval.js` -> `GetAllDentalChartData`
- PERF-01 through PERF-07 and SCALE-01 through SCALE-03 in `caliper/benchmark-matrix.json`.
- Three rounds per combination, fixed at 10 TPS, with each combination generated as an independent configuration.
- Required CSV schemas and Docker resource-statistics schema under `templates/`.
- Role-specific Fabric identity profile generation without committed private keys.

## Safety boundary

Run this suite only against a disposable benchmark network or an approved test-network snapshot. It creates patients, clinical metadata, access requests, approvals, and immutable consent transactions. It must not be pointed at production. Do not package MSP private keys, the generated network profile, JWTs, passwords, or real patient data as evidence.

## 1. Install the locked toolchain

From this directory on the benchmark VM:

```bash
npm ci
npx --no-install caliper bind --caliper-bind-sut fabric:2.5
npx --no-install caliper --version
```

Record the exact Node.js, npm, Caliper, Fabric peer CLI, and Docker versions. If the target Fabric release differs, bind to the actual compatible release and record that decision.

## 2. Create role-specific benchmark identities

Follow `caliper/IDENTITY_REQUIREMENTS.md`. The certificates must contain the required `role`, `actorID`, and `clinicID` ecert attributes. Ordinary `User1` identities are insufficient for the current authorization controls.

Then generate the untracked runtime profile:

```bash
./update-test-network-config.sh
```

## 3. Seed and validate synthetic fixtures

Copy `caliper/fixtures/benchmark-fixtures.example.json` to the ignored filename `caliper/fixtures/benchmark-fixtures.json`. Populate it from a synthetic ledger seed operation.

The largest isolated run requires at least:

- 500 distinct patients eligible for deletion;
- 200 distinct doctor/patient/origin-clinic combinations for new access requests;
- 200 requests in `PENDING_ADMIN_APPROVAL` for PERF-05;
- 200 different requests belonging to `Patient-BENCH-001` in `PENDING_PATIENT_CONSENT` for PERF-06;
- assigned synthetic patients for record-entry and retrieval operations.

Use a fresh network snapshot and fresh fixture manifest before every generated configuration. Never reuse a consumed deletion, approval, or consent fixture.

## 4. Generate and validate configurations

```bash
npm run benchmark:generate
npm run benchmark:validate
npm run benchmark:preflight
```

The generated `caliper/config/generated/manifest.json` is the execution register. It contains 102 isolated runs: 18 extended-performance runs, 30 consent-workflow runs, and 54 scalability runs.

## 5. Execute one controlled run

After restoring the correct ledger snapshot and fixture file:

```bash
./scripts/run-one.sh \
  caliper/config/generated/perf-06-200-r1.yaml \
  networks/fabric/test-network.yaml \
  benchmark-output/perf-06-200-r1
```

Do not run the whole matrix unattended until one read smoke test and one signed write smoke test both succeed, the identity attributes are confirmed, and resource monitoring captures the peers, orderer, chaincode, and application containers.

## 6. Scalability topology rule

SCALE scenarios require three genuinely different Fabric networks: 2, 4, and 6 organizations. Relabeling the current two-organization network does not constitute scalability evidence. For every topology record the organization count, total peer count, orderer count, endorsement policy, channel configuration hash, chaincode version/sequence, VM resources, and network profile checksum.

The current development topology can support the 2-organization baseline only. Four- and six-organization network definitions and their independent deployment evidence remain prerequisites for those runs.

## 7. Evidence retained for every run

- generated benchmark YAML;
- Caliper HTML report and raw console log;
- per-transaction raw latency JSONL and the calculated p50/p95 summary;
- tool versions;
- Docker stats sampled throughout the test window, not just before and after;
- sanitized environment/topology manifest and checksums;
- fixture manifest checksum, with no sensitive values;
- CSV row containing all mandatory metrics;
- failure classification and raw error when any transaction fails.

Report actual failures as failures. Use Blocked only when the required identity, fixture state, toolchain, or Fabric topology is unavailable. Never calculate or invent missing benchmark results.
