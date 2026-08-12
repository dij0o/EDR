#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
REPO_ROOT=$(cd "${SCRIPT_DIR}/.." && pwd)
FABRIC_TEST_NETWORK_DIR="${FABRIC_TEST_NETWORK_DIR:-${REPO_ROOT}/fabric-samples/test-network}"
ORG1_DIR="${FABRIC_TEST_NETWORK_DIR}/organizations/peerOrganizations/org1.example.com"
ORG2_DIR="${FABRIC_TEST_NETWORK_DIR}/organizations/peerOrganizations/org2.example.com"
OUTPUT_PATH="${SCRIPT_DIR}/networks/fabric/test-network.yaml"

ADMIN_MSP="${BENCH_ADMIN_MSP_DIR:-${ORG1_DIR}/users/BenchAdminOrigin@org1.example.com/msp}"
PATIENT_MSP="${BENCH_PATIENT_MSP_DIR:-${ORG1_DIR}/users/BenchPatient@org1.example.com/msp}"
DOCTOR_MSP="${BENCH_DOCTOR_MSP_DIR:-${ORG2_DIR}/users/BenchDoctor@org2.example.com/msp}"

first_key() {
  local msp=$1
  local key
  key=$(find "${msp}/keystore" -maxdepth 1 -type f 2>/dev/null | head -n 1 || true)
  if [ -z "${key}" ] || [ ! -f "${msp}/signcerts/cert.pem" ]; then
    echo "Missing benchmark identity material under ${msp}" >&2
    echo "Enroll certificates with the required role, actorID, and clinicID ecert attributes before generating the profile." >&2
    exit 1
  fi
  printf '%s' "${key}"
}

ADMIN_KEY=$(first_key "${ADMIN_MSP}")
PATIENT_KEY=$(first_key "${PATIENT_MSP}")
DOCTOR_KEY=$(first_key "${DOCTOR_MSP}")
for profile in "${ORG1_DIR}/connection-org1.yaml" "${ORG2_DIR}/connection-org2.yaml"; do
  [ -f "${profile}" ] || { echo "Missing ${profile}" >&2; exit 1; }
done

cat > "${OUTPUT_PATH}" <<EOF
name: EDR Caliper Benchmark Network
version: "2.0.0"
caliper:
  blockchain: fabric
channels:
  - channelName: mychannel
    contracts:
      - id: basic
organizations:
  - mspid: Org1MSP
    identities:
      certificates:
        - name: BenchAdminOrigin
          clientPrivateKey:
            path: "${ADMIN_KEY}"
          clientSignedCert:
            path: "${ADMIN_MSP}/signcerts/cert.pem"
        - name: BenchPatient
          clientPrivateKey:
            path: "${PATIENT_KEY}"
          clientSignedCert:
            path: "${PATIENT_MSP}/signcerts/cert.pem"
    connectionProfile:
      path: "${ORG1_DIR}/connection-org1.yaml"
      discover: true
  - mspid: Org2MSP
    identities:
      certificates:
        - name: BenchDoctor
          clientPrivateKey:
            path: "${DOCTOR_KEY}"
          clientSignedCert:
            path: "${DOCTOR_MSP}/signcerts/cert.pem"
    connectionProfile:
      path: "${ORG2_DIR}/connection-org2.yaml"
      discover: true
EOF

chmod 600 "${OUTPUT_PATH}"
echo "Updated ${OUTPUT_PATH} with three role-specific benchmark identities"
