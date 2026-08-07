# Smart Contract Remediation Deployment Evidence

Deployment date: 2026-08-07 UTC

Environment: EDR test server (`https://edr.bizcenter.tech/`)

Branch: `release/clean-deployable-20260717`

Commit: `af7ed5abbe02fcf2db9288fee2d90324c186ff65`

## Delivered remediation

The deployed release closes CR-001 through CR-005. It includes deterministic actor and
Emirates-ID uniqueness controls, privacy-safe Fabric events, bounded composite-key query
pages, service-side bookmark aggregation, resumable query-index backfill, batch-aware
clinic deactivation, and a zero-finding chaincode development dependency audit.

Existing application consumers retain the same array response payloads. Pagination is
handled within the private Blockchain API, behind the required boundary:

```text
Web/Mobile -> Database/Application API -> private Blockchain API -> Fabric
```

## Git and backup evidence

| Item | Verified result |
|---|---|
| Remote branch commit | `af7ed5abbe02fcf2db9288fee2d90324c186ff65` |
| Server checkout commit | `af7ed5abbe02fcf2db9288fee2d90324c186ff65` |
| Server checkout status | Clean and synchronized with origin |
| Pre-deployment backup | `/home/ubuntu/deployment-backups/20260807T201415Z-cr003-smart-contract` |

The backup includes the pre-deployment Git revision/status, `.env`, Compose override,
Fabric wallet and connection material, a transactional MySQL dump, the pre-deployment
Blockchain API image description, and a source archive.

## Fabric lifecycle evidence

| Item | Verified result |
|---|---|
| Channel / chaincode | `mychannel` / `basic` |
| Version / sequence | `1.0.28` / `30` |
| Org1MSP approval | `true` |
| Org2MSP approval | `true` |
| Lifecycle commit transaction | `d3d7963d9535c637579c85d3ece9854306b44ba73bbf71a1349a7d394ca61903` |
| Commit validation | `VALID` at Org1 peer and Org2 peer |
| Org1 ledger height | `1354` |
| Org2 ledger height | `1354` |
| Current block hash | Identical on both peers |

## Backfill and compatibility evidence

The system-role Fabric identity executed `BackfillQueryIndexes` with batches capped at
100 records. The operation returned:

```json
{"complete":true,"pages":3,"indexedRecords":0,"patientPageRecords":14,"patientPageHasBookmark":false}
```

`indexedRecords` is zero because the live records already had the required index entries;
the three-page traversal still verified the complete resumable migration path. The
post-backfill patient page returned all 14 current patients without a continuation
bookmark.

## Test and runtime results

| Check | Result |
|---|---|
| Client smart-contract cases | 25/25 passed |
| Chaincode regression suite | 42/42 passed |
| Private Blockchain API suite | 94/94 passed |
| ESLint | Passed |
| npm audit | 0 vulnerabilities |
| Frontend | HTTP 200 |
| Database API health | HTTP 200 |
| Internal Blockchain API health | HTTP 200 |
| Public Blockchain API route | HTTP 404 - expected private boundary |
| Compose services | All four healthy |

## Remaining scope boundary

The accepted test topology uses one peer per organization and one orderer. The deployment
proves multi-peer ledger agreement for the two organization peers, but it is not a
production high-availability or Kubernetes autoscaling certification. Production HA,
multi-orderer failover, and high-volume performance thresholds remain separate
infrastructure acceptance activities.
