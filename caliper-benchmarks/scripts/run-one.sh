#!/usr/bin/env bash
set -euo pipefail

if [ "$#" -ne 3 ]; then
  echo "Usage: $0 <generated-config.yaml> <network-config.yaml> <output-directory>" >&2
  exit 2
fi
CONFIG=$1
NETWORK=$2
OUTPUT=$3
CONFIG_NAME=$(basename "${CONFIG}" .yaml)
SCENARIO_ID=$(printf '%s' "${CONFIG_NAME}" | cut -d- -f1-2 | tr '[:lower:]' '[:upper:]')
TX_LOAD=$(printf '%s' "${CONFIG_NAME}" | cut -d- -f3)
ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
cd "${ROOT}"
node scripts/preflight.js
mkdir -p "${OUTPUT}"
rm -f benchmark-output/current/raw-latency.jsonl
cp "${CONFIG}" "${OUTPUT}/benchmark-config.yaml"
node --version > "${OUTPUT}/tool-versions.txt"
npx --no-install caliper --version >> "${OUTPUT}/tool-versions.txt"
docker version --format '{{.Server.Version}}' >> "${OUTPUT}/tool-versions.txt"
./scripts/collect-docker-stats.sh "${OUTPUT}/docker-stats-raw.jsonl" 1 &
STATS_PID=$!
cleanup() { kill "${STATS_PID}" 2>/dev/null || true; wait "${STATS_PID}" 2>/dev/null || true; }
trap cleanup EXIT INT TERM
npx --no-install caliper launch manager --caliper-workspace . --caliper-benchconfig "${CONFIG}" --caliper-networkconfig "${NETWORK}" --caliper-report-path "${OUTPUT}/caliper-report.html" 2>&1 | tee "${OUTPUT}/caliper-run.log"
cleanup
trap - EXIT INT TERM
cp benchmark-output/current/raw-latency.jsonl "${OUTPUT}/raw-latency.jsonl"
node scripts/summarize-latency.js "${OUTPUT}/raw-latency.jsonl" "${OUTPUT}/latency-summary.json"
node scripts/summarize-docker-stats.js "${OUTPUT}/docker-stats-raw.jsonl" "${OUTPUT}/docker-stats-summary.csv" "${SCENARIO_ID}" "${TX_LOAD}"
echo "Run complete. Preserve the generated config, raw log, report, stats, and tool versions together."
