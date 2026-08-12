# Benchmark identity requirements

Create these identities only in the isolated benchmark Fabric network. Their enrollment certificates must contain the listed attributes as ecert attributes because the deployed chaincode enforces them.

| Caliper alias | MSP | Required certificate attributes | Purpose |
|---|---|---|---|
| `BenchAdminOrigin` | Org1MSP | `role=admin`, `actorID=BENCH-ADMIN-ORIGIN`, `clinicID=2` | Patient registration, deletion, and origin-clinic approval |
| `BenchPatient` | Org1MSP | `role=patient`, `actorID=BENCH-PATIENT-001`, `clinicID=2` | Consent grant transactions |
| `BenchDoctor` | Org2MSP | `role=doctor`, `actorID=BENCH-DOCTOR-001`, `clinicID=1` | Cross-clinic requests and clinical record operations |

Registration and enrollment must be performed through the Fabric CA administrator appropriate to each organization. Include each attribute with `:ecert` during registration or request the attributes during enrollment. Do not substitute ordinary `User1` certificates: those certificates do not prove the application role, actor, and clinic required by the chaincode.

After enrollment, set `BENCH_ADMIN_MSP_DIR`, `BENCH_PATIENT_MSP_DIR`, and `BENCH_DOCTOR_MSP_DIR` if the MSP folders differ from the default test-network locations, then run `./update-test-network-config.sh`.

Never commit generated MSP folders or `networks/fabric/test-network.yaml`. The generated profile contains private-key paths and is runtime material.
