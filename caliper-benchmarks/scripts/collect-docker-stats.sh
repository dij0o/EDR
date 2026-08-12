#!/usr/bin/env bash
set -euo pipefail

OUTPUT=$1
INTERVAL=${2:-1}
: > "${OUTPUT}"
while true; do
  timestamp=$(date -u +%Y-%m-%dT%H:%M:%S.%3NZ)
  docker stats --no-stream --format '{{json .}}' | while IFS= read -r row; do
    printf '{"captured_at":"%s","stats":%s}\n' "${timestamp}" "${row}" >> "${OUTPUT}"
  done
  sleep "${INTERVAL}"
done
