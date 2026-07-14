# EDR Remediation Change Log

## Phase 3 - REST API Parity With SRS (2026-07-11)

- Added the six SRS Section 5 canonical Blockchain API routes with documented legacy aliases.
- Added Admin-only patient update/delete and doctor update/delete routes plus identity-scoped doctor read.
- Added separate clinic-bound admin rejection and owner-bound patient rejection endpoints.
- Preserved Phase 2 JWT-to-wallet identity selection for every new handler and strengthened chaincode delete operations with stored-record clinic checks.
- Standardized canonical success/error envelopes and JWT/role error envelopes across both APIs.
- Added `dental-backend/test/phase3RouteParity.test.js`; API syntax and 7 route/identity checks pass locally.
- No database migration was required. AWS deployment passed on 2026-07-11: checkout `b30cae6`, PM2 Blockchain API online, and chaincode `basic` version `1.0.2` sequence `4` committed with Org1MSP/Org2MSP approvals. The 13-check authenticated smoke suite passed canonical reads, validation failures, role denials, actor mismatch, and Doctor-without-consent HTTP 403 handling. Predeployment backup: `/home/ubuntu/deployment-backups/20260711-phase3-predeploy`.

Prepared by: Codex  
Date: 2026-07-07  
Workspace: `C:\Workbench\EDR_Source`

## Scope and Method

This document records the code, configuration, Fabric setup, and documentation changes applied in:

- `C:\Workbench\EDR_Source\Source_Code_Remediation`

The original source snapshot was used as the comparison baseline and was not edited:

- `C:\Workbench\EDR_Source\Source_Code`

Line numbers below refer to the updated files in `Source_Code_Remediation` as of 2026-07-07. Generated artifacts such as `node_modules`, frontend `dist`, Fabric runtime organizations, wallets, logs, screenshots, and binaries are not treated as source-code changes, but runtime artifacts are noted separately where relevant.

## Code Changes

| ID | File | Updated line(s) | Original logic | Updated logic | Reason / fix |
|---|---|---:|---|---|---|
| C-01 | `backend/server.js` | 10-31, 127-131, 299-303 | JWT signing used `process.env.JWT_SECRET || <hardcoded fallback secret>`. If env was missing, the app silently used a bundled secret. | `SECRET_KEY` must come from `JWT_SECRET`. Login and protected routes return a configuration error if it is missing. | Removes unsafe hardcoded secret fallback and makes missing runtime config visible. |
| C-02 | `backend/server.js` | 13-22 | CORS was hardcoded as `origin: '*'`. | Added `parseCorsOrigin()` and reads comma-separated `CORS_ORIGIN` from env. | Allows controlled frontend origins for `5173`, `5174`, and loopback variants instead of unrestricted CORS. |
| C-03 | `backend/server.js` | 318-324 | `/syncOnChainPatients` always called `http://localhost:8081/getAllPatients`. This fails when the Database API runs in Docker because `localhost` points to the container. | Added `BLOCKCHAIN_API_URL` and calls `${BLOCKCHAIN_API_URL}/getAllPatients`. | Makes the Database API able to reach the Blockchain API in host-run or container-run setups. |
| C-04 | `backend/server.js` | 395-449 | Admin registration used nested callbacks. It inserted the user first and then inserted the admin row. If the organization already had an admin, user creation could be partially completed before the admin insert failed. | Registration now uses an explicit DB connection, transaction, duplicate email check, duplicate organization-admin check, rollback, commit, and duplicate-key handling. | Prevents partial registration records and returns a clean error when an organization already has an admin. |
| C-05 | `dental-backend/index.js` | 10-37, 44-74 | Fabric connection profile was loaded synchronously from a hardcoded path at startup; wallet, identity, channel, chaincode, and discovery settings were hardcoded; the full connection profile content was logged. | Added dotenv loading, env-driven Fabric paths/settings, lazy connection profile loading, wallet path logging only, and `sendFabricError()`. | Lets the Blockchain API start with clear errors when Fabric artifacts are missing and removes sensitive/noisy profile content logging. |
| C-06 | `dental-backend/index.js` | 61-83 | Each route opened its own wallet/gateway/network/contract using repeated hardcoded values. | Added `withContract()` helper to centralize wallet, gateway, discovery, channel, and chaincode access. | Reduces duplicated Fabric connection logic and ensures routes use the same env-driven config. |
| C-07 | `dental-backend/index.js` | 85-93 | Route handlers manually checked only some request fields, and missing-field handling was inconsistent. | Added `requireFields()` to validate required payload fields and return a 400-style error. | Makes write endpoints fail predictably when required fields are missing. |
| C-08 | `dental-backend/index.js` | 95-146 | `POST /addPatient` was not available as an active API route for the frontend. | Added `POST /addPatient`, maps request body to chaincode `addPatient`, serializes doctor array, and returns parsed chaincode JSON with HTTP 201. | Enables the frontend "Add Patient" workflow to create on-chain patients. |
| C-09 | `dental-backend/index.js` | 148-196 | `POST /addDoctor` existed only as commented-out code and did not match the current chaincode signature. | Added active `POST /addDoctor` with Emirates ID, clinic ID, speciality, worksAt, contact details, default created date, and serialized patient list. | Enables doctor registration against the chaincode API. |
| C-10 | `dental-backend/index.js` | 198-226 | No REST route exposed `registerPatientInClinic` or `assignPatientToDoctor`. | Added `POST /registerPatientInClinic` and `POST /assignPatientToDoctor`. | Enables patient clinic registration and doctor-patient assignment workflows through the API. |
| C-11 | `dental-backend/index.js` | 232-575 | Read/request/consent routes used repeated hardcoded `appUser`, `mychannel`, `basic`, and inline profile loading. Error responses used raw string responses. | Routes now use env-driven wallet/profile/channel/chaincode settings and `sendFabricError()` for structured JSON errors. | Makes Blockchain API route behavior consistent and configurable. |
| C-12 | `fabric-samples/dental-record-sharing/chaincode-javascript/lib/dentalRecordSharing.js` | 14-31 | Array-like arguments such as `patients` and `doctors` were stored as provided. JSON strings from REST calls could remain strings instead of arrays. | Added `parseArrayArgument()` to accept arrays, JSON arrays, scalar values, or empty values safely. | Prevents malformed on-chain doctor/patient lists from REST submissions. |
| C-13 | `fabric-samples/dental-record-sharing/chaincode-javascript/lib/dentalRecordSharing.js` | 495, 500, 542 | `clinicID`, `patients`, and `doctors` were stored inconsistently, with clinic IDs potentially remaining strings and arrays potentially remaining serialized strings. | Doctor `clinicID` is parsed to integer; doctor `patients` and patient `doctors` use `parseArrayArgument()`. | Makes chaincode records type-consistent and compatible with assignment/query logic. |
| C-14 | `fabric-samples/dental-record-sharing/chaincode-javascript/lib/dentalRecordSharing.js` | 921-922 | `assignPatientToDoctor` compared patient clinic IDs to doctor clinic ID without normalizing types. String/number mismatch caused valid assignments to fail. | Converts doctor clinic ID and patient clinic IDs to numbers before comparison. | Fixes patient-to-doctor assignment when REST payloads provide clinic IDs as strings. |
| C-15 | `fabric-samples/dental-record-sharing/chaincode-javascript/lib/dentalRecordSharing.js` | 1184 | Processed patient request query filtered for `PENDING_PATIENT_CONSENT`, which is a pending status rather than processed. | Processed query now returns `CONSENT_GRANTED` and `REJECTED`. | Makes consented/rejected requests appear after patient action. |
| C-16 | `bc-dentistry-frontend/src/assets/config/api.js` | 1-24 | No shared API config existed. Components hardcoded URLs such as `http://localhost:8080` and `http://localhost:8081`. | Added `DATABASE_API_URL`, `BLOCKCHAIN_API_URL`, `databaseUrl()`, and `blockchainUrl()` using Vite env variables with local fallbacks. | Centralizes API base URLs and removes scattered hardcoded localhost usage. |
| C-17 | `bc-dentistry-frontend/src/assets/utils/auth.js` | 1-19 | Components called `JSON.parse(localStorage.getItem("user"))` directly. Missing/invalid localStorage crashed pages. | Added `getStoredUser()` and `getStoredUserRole()` with null handling and invalid JSON cleanup. | Fixes clean-browser startup and protected-page crashes. |
| C-18 | `bc-dentistry-frontend/src/App.jsx` | 6-29 | App parsed localStorage immediately and executed `user.role.toLowerCase()` before login. Topbar/nav/page cover still rendered on login/signup. | Uses `getStoredUserRole()`, treats `/`, `/login`, and `/signup` as unauthenticated pages, and renders shell only outside those pages. | Fixes the original blocker where the app could not load/login with no stored user. |
| C-19 | `bc-dentistry-frontend/src/assets/Context/RoleContext.jsx` | 1-18 | Role context initialized to `null` only, so refreshes lost role state even if login data existed. | Initializes role from `getStoredUserRole()`. | Keeps admin/doctor routing state after page refresh. |
| C-20 | `bc-dentistry-frontend/src/assets/Sections/LoginSection.jsx` | 7-48 | Login posted directly to `http://localhost:8080/login` and did not update role context after storing user. | Login posts to `databaseUrl('/login')` and updates `setUserRole()` from the returned user role. | Makes login environment-driven and immediately updates role-specific UI. |
| C-21 | `bc-dentistry-frontend/src/assets/Pages/Patients.jsx` | 42-97 | Page parsed localStorage directly and hardcoded Blockchain API URLs. It assumed `user.role` always existed. | Uses `getStoredUser()`, derives role safely, uses `blockchainUrl()`, refreshes when stored user fields change, and shows a login message if no user exists. | Prevents protected page crashes and verifies admin/doctor patient list API calls. |
| C-22 | `bc-dentistry-frontend/src/assets/Pages/Patient.jsx` | 48-96 | Patient detail used hardcoded `/ReadPatient/:id` with wrong route casing and assumed `sharedWith` existed. | Uses `blockchainUrl('/readPatient/:id')`, safe stored user parsing, login guard, and `Array.isArray()` before checking sharing. | Fixes route mismatch with Express and prevents crashes on missing optional fields. |
| C-23 | `bc-dentistry-frontend/src/assets/Pages/DataRequests.jsx` | 46-95 | Admin requests page parsed localStorage directly, assumed admin clinic ID existed, and hardcoded the Blockchain API URL. | Uses `getStoredUser()`, guards missing `organizationId`, fetches through `blockchainUrl()`, and shows an admin-login message if needed. | Prevents data-request page crash and makes request fetch environment-driven. |
| C-24 | `bc-dentistry-frontend/src/assets/Sections/DataRequests/DataRequestsOrders.jsx` | 34-137 | Data request order fetch/approval used direct localStorage parsing and hardcoded Blockchain API URLs. | Uses `getStoredUser()`, guards missing clinic/admin IDs, fetches through `blockchainUrl()`, and posts approvals through `blockchainUrl('/approveRequest')`. | Makes admin approval flow functional and environment-driven. |
| C-25 | `bc-dentistry-frontend/src/assets/components/Patients/RequestPatientCard.jsx` | 81-123 | Doctor request form parsed localStorage directly, assumed doctor ID existed, and hardcoded `/requestDataAccess`. | Uses `getStoredUser()`, validates doctor/patient/clinic values, and posts to `blockchainUrl('/requestDataAccess')`. | Makes doctor data-access requests work from the frontend. |
| C-26 | `bc-dentistry-frontend/src/assets/components/Patients/NewPatientDialog.jsx` | 4-58, 81-148, 277-279 | Add-patient dialog only displayed static fields and did not submit a real patient payload to the backend. | Added form state, field change handler, required-field validation, name splitting, `POST /addPatient` call, patient ID and clinic ID fields, and submit wiring. | Enables frontend add-patient workflow against Fabric. |
| C-27 | `bc-dentistry-frontend/src/assets/components/InputComponent.jsx` | 1-23 | Inputs were uncontrolled and did not expose `name`, `value`, or `onChange`. Select options used value `"1"` for every option. | Inputs/selects accept controlled props; select placeholder uses empty value; option values use their actual label. | Allows add-patient form state to capture real field values. |
| C-28 | `bc-dentistry-frontend/src/assets/components/Patients/NewPatientDialog2.jsx` | 7, 61-86 | Dialog section did not pass form props to inputs. Submit button called an appointment placeholder handler through an anchor. | Passes values/change handlers into `InputComponent` and calls `onSubmit` directly for Submit. | Connects the multi-step dialog to actual add-patient submission. |
| C-29 | `bc-dentistry-frontend/src/assets/Pages/Signup.jsx` | 2-46, 118-124 | Signup imported only `useLocation`, called hardcoded `/register`, omitted required organization ID, and used `navigate` without importing it. | Imports `useNavigate`, uses `databaseUrl('/register')`, tracks `organizationId`, submits it, and adds an Organization ID field. | Makes admin signup payload match the Database API registration contract. |
| C-30 | `bc-dentistry-frontend/src/assets/components/Dashboard/AppointmentsTable.jsx` | 3, 13 | Dashboard appointments fetched `http://localhost:8080/Appointment`. | Fetches `databaseUrl('/Appointment')`. | Removes hardcoded Database API URL. |
| C-31 | `bc-dentistry-frontend/src/assets/Sections/Appointments/AppointmentsSection.jsx` | 4, 14 | Appointment section fetched `http://localhost:8080/Appointment`. | Fetches `databaseUrl('/Appointment')`. | Removes hardcoded Database API URL. |
| C-32 | `bc-dentistry-frontend/src/assets/Sections/LabResults/LabResults.jsx` | 5, 24 | Lab results fetched `http://localhost:8080/Lab_Results`. | Fetches `databaseUrl('/Lab_Results')`. | Removes hardcoded Database API URL. |
| C-33 | `bc-dentistry-frontend/src/assets/components/UserType.jsx` | 19, 25, 30-33 | User type component parsed localStorage directly and rendered even if no user data existed. | Uses `getStoredUser()` and returns `null` when no user data exists. | Prevents login-shell crash before authentication. |
| C-34 | `bc-dentistry-frontend/src/index.css` | 131, 140-146 | Login/signup overlay pseudo-element could sit above form controls and intercept clicks. | Adds relative positioning, z-index layering, and `pointer-events: none` for the overlay. | Fixes visible login page that could not be clicked. |
| C-35 | `backend/server.js` | 11-25, 136-149, 328-603, 676-682 | JWT expiry was hardcoded, token claims omitted organization context, and most Database API business routes were public. | Added `JWT_EXPIRES_IN`, normalized role helpers, richer JWT claims, role middleware, protected Database API routes, auth forwarding for patient sync, and removed password hashes from `/users` output. | Starts SRS Phase 1 API-layer auth/RBAC coverage for Database API routes. |
| C-36 | `dental-backend/index.js` | 9, 36-162, 225-679 | Blockchain API routes trusted request body IDs and did not validate JWTs or roles. | Added JWT validation, normalized role middleware, admin clinic-claim checks, doctor self checks, and route-level Admin/Doctor/Patient/System permissions. | Prevents unauthenticated calls and obvious role/body impersonation at the Blockchain API boundary. |
| C-37 | `bc-dentistry-frontend/src/assets/config/api.js` and protected web call sites | 26-36; multiple imports/calls | Web protected calls used only API base URL helpers and did not attach JWT headers. | Added `authHeaders()`/`jsonHeaders()` and applied them to patient, request, approval, add-patient, appointment, and lab-result calls. | Lets the web app continue to use protected Database/Blockchain API routes after server-side auth enforcement. |
| C-38 | `BC-Dentistry-Mobile-App/Context/UserContext.jsx`, `BC-Dentistry-Mobile-App/utils/api.js`, mobile request/consent screens | multiple | Mobile sign-in matched email against `/getAllPatients`, used hardcoded API constants, and request/consent screens called protected routes as `Patient1` without auth. | Added mobile API helper, token context, real `/login` sign-in, JWT headers on protected calls, and patient identity helper usage instead of hardcoded request IDs. | Removes the mobile local-auth bypass and aligns protected mobile calls with SRS JWT authentication. |
| C-39 | `BC-Dentistry-Mobile-App/app/documents.jsx` | 27 | Documents screen used an un-awaited request and a filter callback that never returned a value. | Awaits the authenticated request and returns `data.documents` from the filter callback. | Fixes a touched mobile screen bug while moving it to JWT-authenticated calls. |

## Configuration Changes

| ID | File | Updated line(s) | Original configuration | Updated configuration | Reason / fix |
|---|---|---:|---|---|---|
| CFG-01 | `backend/Dockerfile` | 5-6, 10 | Copied entire backend folder before dependency install and ran `npm install`. This could copy Windows `node_modules` into the Linux container. | Copies `package*.json`, runs `npm ci --omit=dev`, then copies source. Exposes `8080`. | Fixes native module issues such as invalid Linux container binaries for dependencies like `bcrypt`. |
| CFG-02 | `backend/.dockerignore` | 1-4 | File did not exist. Docker build context could include `node_modules`, `.env`, logs, and audit outputs. | Added ignores for `node_modules`, audit output folders, `.env`, and logs. | Keeps Docker builds reproducible and prevents local secrets/dependencies from entering images. |
| CFG-03 | `docker-compose.yml` | 55-59 | Database API had no container-to-host Blockchain API URL. | Adds `BLOCKCHAIN_API_URL: http://host.docker.internal:8081` and maps `8080:8080`. | Lets the containerized Database API call the host-run Blockchain API. |
| CFG-04 | `backend/.env.example` | 6, 23-29 | Env template did not document Blockchain API URL or multi-origin CORS. | Adds `PORT=8080`, `BLOCKCHAIN_API_URL`, and CORS origins for `5173`, `5174`, and loopback variants. | Documents the correct local setup for DB API and frontend access. |
| CFG-05 | `backend/.env` | 1-8 | Local runtime env file was not present in the original source snapshot. | Added local development values for port, DB connection, JWT secret placeholder, Blockchain API URL, and CORS origins. | Supports verified local runtime in the remediation copy. This file should be treated as local config, not production secret material. |
| CFG-06 | `dental-backend/.env.example` | 6, 11-13, 26 | Template used old port `3000`, omitted Fabric identity/discovery settings, and allowed only one frontend origin. | Sets `PORT=8081`, adds Fabric identity/discovery values, and expands CORS origins. | Aligns Blockchain API config with the verified runtime and frontend ports. |
| CFG-07 | `dental-backend/.env` | 1-11 | Local runtime env file was not present in the original source snapshot. | Added local Blockchain API port, Fabric channel/chaincode/identity, connection profile, wallet path, JWT placeholder, expiry, and CORS origins. | Supports verified local Fabric API runtime. |
| CFG-08 | `dental-backend/package.json` | 7, 16 | No `start` script and no `dotenv` dependency. | Adds `"start": "node index.js"` and `dotenv`. | Makes `npm start` available and supports env-driven Blockchain API config. |
| CFG-09 | `dental-backend/package-lock.json` | dependency lock entries | Lock file did not include `dotenv`. | Lock file updated for `dotenv`. | Keeps dependency installation reproducible. |
| CFG-10 | `bc-dentistry-frontend/.env.example` | 6-7 | Frontend pointed to stale `/api` URLs on ports `3000` and `3001`. | Sets `VITE_BLOCKCHAIN_API_URL=http://localhost:8081` and `VITE_DATABASE_API_URL=http://localhost:8080`. | Aligns frontend with actual API ports. |
| CFG-11 | `bc-dentistry-frontend/.env` | 1-2 | Local runtime env file was not present in the original source snapshot. | Adds local Vite API base URLs for Blockchain API and Database API. | Supports verified local frontend runtime. |
| CFG-12 | `BC-Dentistry-Mobile-App/.env.example` | 11-12 | Mobile template pointed to stale ports `3001/api` and `3000/api`. | Sets `API_BASE_URL` to `8080` and `BLOCKCHAIN_API_URL` to `8081` without stale `/api` suffixes. | Documents correct LAN API ports for mobile development. |
| CFG-13 | `dental-backend/package.json`, `dental-backend/package-lock.json` | dependency entries | Blockchain API did not declare `jsonwebtoken`. | Adds `jsonwebtoken` `^9.0.2` and matching lockfile entries. | Makes JWT validation dependency explicit and reproducible for Blockchain API installs/builds. |

## Fabric and Docker Version Alignment Changes

| ID | File | Updated line(s) | Original configuration | Updated configuration | Reason / fix |
|---|---|---:|---|---|---|
| FAB-01 | `fabric-samples/test-network/network.config` | 3, 6 | `IMAGETAG="default"` and `CA_IMAGETAG="default"`, allowing Docker images to drift to latest/default versions. | `IMAGETAG="2.5.16"` and `CA_IMAGETAG="1.5.21"`. | Pins image versions to the installed local Fabric binaries and avoids Fabric/Docker compatibility drift. |
| FAB-02 | `fabric-samples/test-network/network.sh` | 76, 122 | Prerequisite checks compared local binaries against `hyperledger/fabric-tools:latest` and `hyperledger/fabric-ca:latest`. | Checks use `hyperledger/fabric-tools:${IMAGETAG}` and `hyperledger/fabric-ca:${CA_IMAGETAG}`. | Ensures version checks validate the pinned image set, not whatever latest currently resolves to. |
| FAB-03 | `fabric-samples/test-network/network.sh` | 481-483 | Git Bash on Windows could leave Docker socket as `/var/run/docker.sock`, which Docker Desktop does not mount correctly from that shell context. | Converts `/var/run/docker.sock` to `//var/run/docker.sock` on MSYS/Cygwin shells. | Fixes Fabric test-network startup under Windows Git Bash. |
| FAB-04 | `fabric-samples/test-network/compose/compose-test-net.yaml` | 21, 63, 102, 141 | Orderer, peers, and CLI used `hyperledger/fabric-*:latest`. | Uses `${IMAGETAG:-2.5.16}` for orderer, peer, and tools images. | Pins normal test-network containers to Fabric `2.5.16`. |
| FAB-05 | `fabric-samples/test-network/compose/compose-ca.yaml` | 15, 35, 55 | Fabric CA containers used `hyperledger/fabric-ca:latest`. | Uses `${CA_IMAGETAG:-1.5.21}`. | Pins Fabric CA containers to the verified CA version. |
| FAB-06 | `fabric-samples/test-network/compose/docker/docker-compose-test-net.yaml` | 10, 15, 24, 29, 38 | Docker override used `latest` peer/tools images and did not set Docker API compatibility override. | Uses `${IMAGETAG:-2.5.16}` and adds `DOCKER_API_VERSION=1.40` to peer containers. | Fixes JavaScript chaincode container launch against Docker Engine 29, where older Docker API clients fail. |
| FAB-07 | `fabric-samples/test-network/compose/compose-bft-test-net.yaml` | 19, 61, 103, 145, 190, 229, 268 | BFT sample services used `latest` Fabric images. | Uses `${IMAGETAG:-2.5.16}` for orderers, peers, and tools. | Removes hidden version drift from the BFT sample configuration. |
| FAB-08 | `fabric-samples/test-network/compose/docker/docker-compose-bft-test-net.yaml` | 10, 17, 24, 31, 38 | BFT Docker override used `latest` and lacked Docker API override. | Uses `${IMAGETAG:-2.5.16}` and `DOCKER_API_VERSION=1.40`. | Keeps BFT Docker override aligned with the verified Fabric/Docker matrix. |
| FAB-09 | `fabric-samples/test-network/addOrg3/compose/compose-ca-org3.yaml` | 14 | Org3 CA used `hyperledger/fabric-ca:latest`. | Uses `${CA_IMAGETAG:-1.5.21}`. | Pins Org3 CA sample config. |
| FAB-10 | `fabric-samples/test-network/addOrg3/compose/compose-org3.yaml` | 19 | Org3 peer used `hyperledger/fabric-peer:latest`. | Uses `${IMAGETAG:-2.5.16}`. | Pins Org3 peer sample config. |
| FAB-11 | `fabric-samples/test-network/addOrg3/compose/docker/docker-compose-org3.yaml` | 16, 23 | Org3 Docker override used `latest` and lacked Docker API override. | Uses `${IMAGETAG:-2.5.16}` and `DOCKER_API_VERSION=1.40`. | Aligns Org3 Docker chaincode launch behavior with the main network. |
| FAB-12 | `fabric-samples/test-network/addOrg3/compose/podman/podman-compose-ca-org3.yaml` | 14 | Org3 Podman CA config used `latest`. | Uses `${CA_IMAGETAG:-1.5.21}`. | Removes version drift from the Podman sample config. |
| FAB-13 | `fabric-samples/test-network/addOrg3/compose/podman/podman-compose-org3.yaml` | 19 | Org3 Podman peer config used `latest`. | Uses `${IMAGETAG:-2.5.16}`. | Removes version drift from the Podman sample config. |

## Phase 2 Identity And Chaincode Security Changes

| ID | File | Updated area | Original behavior | Updated behavior | Reason / fix |
|---|---|---|---|---|---|
| P2-01 | `fabric-samples/dental-record-sharing/chaincode-javascript/lib/dentalRecordSharing.js` | Identity helpers and restricted transactions | Chaincode trusted API authorization or incomplete role checks; public initialization/helper and several read/clinical paths lacked certificate enforcement. | Validates Org1MSP/Org2MSP, role, actorID, and admin clinicID; protects initialization, enumeration, clinical records, consent/request, dental file, and helper paths. | Enforces SEC-02 and role ownership inside Fabric rather than only at REST boundaries. |
| P2-02 | `dental-backend/index.js`, `fabricIdentity.js` | Gateway connection identity | Gateway requests relied on a shared `appUser` assumption. | JWT claims select `admin-<organizationId>`, `doctor-<blockchainID>`, `patient-<blockchainID>`, or `role-system`; missing wallet identities return 503 before connection. | Binds API sessions to role/actor-specific X.509 transaction identities. |
| P2-03 | `dental-backend/registerRoleIdentities.js` | Fabric CA enrollment | Only admin/appUser enrollment scripts existed. | Provisions clinic-bound admin, actor-bound doctor/patient, and system certificates with ecert attributes. | Makes chaincode role, actor, and clinic checks cryptographically available. |
| P2-04 | Chaincode/API tests and setup docs | Verification and operations | No complete role/MSP violation suite or role-identity setup path. | Adds 16 chaincode tests, 4 resolver tests, 9 live gateway checks, and role-bound wallet setup documentation. | Provides repeatable evidence and deployment guidance for Phase 2. |

## Documentation Changes

| ID | File | Updated line(s) | Original documentation | Updated documentation | Reason / fix |
|---|---|---:|---|---|---|
| DOC-01 | `README.md` | 144-149 | Prerequisites listed generic Docker `26.0.0+`, Compose `v2+`, Node `22.5.1`, and did not state exact Fabric/CA tested versions. | Documents Docker Desktop `4.79.0`, Engine `29.5.3`, Docker API `1.54`/min `1.40`, Compose `v5.1.4`, Fabric `2.5.16`, Fabric CA `1.5.21`, and jq. | Makes the Fabric/Docker version matrix explicit for reproducible setup. |
| DOC-02 | `README.md` | 155 | No warning explained the Fabric `2.5.4` and Docker Engine 29 chaincode failure. | Adds a Fabric/Docker compatibility note and the observed `client version 1.25 is too old` failure mode. | Prevents teams from using broad/latest Fabric setup guidance that fails with newer Docker. |
| DOC-03 | `README.md` | 197, 212 | Fabric install command used `--fabric-version 2.5.4` and CA fallback used `1.5.7`. | Install command uses `--fabric-version 2.5.16 --ca-version 1.5.21`; CA retry uses `1.5.21`. | Aligns setup commands with verified runtime. |
| DOC-04 | `README.md` | 840-849 | Tech stack listed Fabric `2.5.0`, Blockchain/Database API Node `22.5.1`, Docker Engine `26.0.0`, and no Fabric CA row. | Lists Fabric `2.5.16`, Fabric CA `1.5.21`, Node `18+` for APIs, and Docker Engine tested `29.5.3`. | Keeps summary stack consistent with verified setup. |
| DOC-05 | `docs/SETUP.md` | 102-103 | Service port table listed Blockchain API `3000` and Database API `3001`. | Lists Blockchain API `8081` and Database API `8080`. | Corrects setup documentation to match actual services. |
| DOC-06 | `docs/SETUP.md` | 282, 294 | Manual startup comments referenced `localhost:3000` and `localhost:3001`. | Startup comments reference `localhost:8081` and `localhost:8080`. | Prevents developers from starting/testing against stale ports. |
| DOC-07 | `docs/SETUP.md` | 432-433 | CORS troubleshooting mentioned only `http://localhost:5174`. | CORS troubleshooting includes `http://localhost:5173,http://localhost:5174`. | Covers both Vite dev ports observed during testing. |

## Runtime Artifacts and Generated Files

These were created or refreshed to run and verify the remediation copy. They are not all intended as commit-ready source changes.

| ID | Path | Type | What changed | Purpose / note |
|---|---|---|---|---|
| R-01 | `dental-backend/connection/connection-org1.json` | Fabric runtime profile | Copied from the generated Fabric test-network organization profile. | Required by the Blockchain API to connect to the live Fabric network. |
| R-02 | `dental-backend/wallet/` | Fabric identity wallet | Generated by `node enrollAdmin.js` and `node registerUser.js`. | Required for `appUser` to submit/evaluate transactions. |
| R-03 | `fabric-samples/bin/` | Fabric binaries | Windows Fabric binaries and `jq.exe` are present in the remediation copy. | Required for Git Bash/Windows Fabric test-network operations and scripts that depend on jq. |
| R-04 | `fabric-samples/test-network/organizations/` | Fabric runtime material | Generated CA/MSP/TLS material for the running test network. | Needed for local verification, but should be regenerated for a clean environment. |
| R-05 | `bc-dentistry-frontend/dist/` | Build output | Generated by Vite production build. | Confirms build success; not source logic. |
| R-06 | `Outputs/*.png` | Evidence screenshots | Browser screenshots captured for login, dashboard, patient, add patient, request, and approval flows. | Evidence for the verification report. |
| R-07 | `Outputs/EDR_Remediation_Verification.md` | Report | Updated from blocked status to verified running status. | Summarizes runtime verification and remaining caveats. |
| R-08 | `Outputs/EDR_Remediation_Thread_Prompt.md` | Handoff prompt | Updated to reflect the current verified state. | Provides a prompt for a future Codex thread to continue from the latest state. |

## Verification Linked to These Changes

| Verification item | Result |
|---|---|
| Frontend login page with clean browser state | Pass. Login page loads and input controls are clickable. |
| Admin login through Database API | Pass. `POST /login` returned HTTP 200 with token/user JSON. |
| Patient list through frontend | Pass. Admin patient list called `/getPatientsByClinic/1` and rendered data. |
| Add patient through frontend | Pass. UI submitted `POST /addPatient`; patient was readable on-chain. |
| Doctor request workflow | Pass. Doctor UI submitted `POST /requestDataAccess` and returned a request ID. |
| Admin approval workflow | Pass. Admin UI called `/getRequestsForAdmin/2` and approved through `/approveRequest`. |
| Patient consent/processed request flow | Pass via API. `/provideConsent` succeeded and processed requests returned `CONSENT_GRANTED`. |
| Fabric version alignment | Pass. Fabric containers run `2.5.16`, Fabric CA containers run `1.5.21`, and no test-network Fabric image references use `latest`. |
| Frontend production build | Pass with warnings for unresolved Inter font paths, Cornerstone `fs/path` externalization, and large bundle size. |
| Phase 2 chaincode unit suite | Pass. 16 admin/doctor/patient/system/MSP tests passed in an isolated AWS test directory. |
| Phase 2 gateway identity mapping | Pass. 4 dependency-free Node tests passed. |
| Phase 2 live Fabric identity suite | Pass. 9 direct gateway checks passed against role-bound certificates and deployed chaincode. |
| Phase 2 AWS deployment | Pass. `basic` version `1.0.1`, sequence `3`, committed with Org1MSP and Org2MSP approvals; API regression smoke tests remained green. |
| Git-synchronized AWS redeployment | Pass. VM checkout was backed up and aligned to pushed commit `4892875`; Database API, Blockchain API, and Nginx frontend were rebuilt/restarted; Phase 1 public smoke tests and Phase 2 identity checks passed again. |
| Chaincode test execution after Git sync | Pass with warning. Direct Mocha execution passed all 16 tests; the inherited `npm test` ESLint pre-hook still rejects object spread syntax and needs a parser/`ecmaVersion` configuration update. |

## Known Items Not Fully Remediated

| Item | Status |
|---|---|
| Clinic creation | Doctor registration and patient-in-clinic registration work, but a distinct create-clinic/organization workflow was not confirmed in the UI/API/chaincode. |
| Identity lifecycle automation | Current AWS admin/doctor/patient/system certificates are provisioned. Enrollment and revocation must be automated when user/clinic lifecycle management expands. |
| Mobile app runtime | Mobile env template was corrected, but mobile screen logic with hardcoded values was not fully remediated in this pass. |
| Frontend build warnings | Build succeeds, but font path, Cornerstone, and bundle-size warnings remain. |
| Fabric ledger cleanliness | Verification created smoke-test ledger records. For a clean demo, reset the Fabric network and reinitialize the ledger. |
| Chaincode lint pre-hook | The deployed chaincode and all direct tests pass, but the standard `npm test` command stops before Mocha because the inherited ESLint parser does not accept object spread syntax. |
| Dependency audit findings | Clean AWS installs reported 28 vulnerabilities in `dental-backend` (3 critical), 33 in the frontend (1 critical), and 19 in chaincode (1 critical). Review dependency upgrades with compatibility tests; do not apply forced production upgrades. |
# Phase 4 Patient Management Completion - 2026-07-11

- Added MySQL-backed SRS patient fields and migration `database/migrations/2026-07-11-phase4-patient-management.sql`.
- Added admin-coordinated patient create, list, owner/admin read, update, assignment, and delete routes in `backend/server.js`.
- Added server-generated `Patient-<UUID>` identifiers and SHA-256 hashes of the authoritative off-chain patient payload.
- Added `AddPatientMetadata` and `UpdatePatientMetadata` chaincode transactions plus JWT/MSP-bound Blockchain API routes. These store only identifiers, clinic/doctor metadata, opaque MySQL reference, hash, timestamps, and storage policy.
- Replaced the add-patient UI with complete SRS fields and added admin update, assignment, and confirmed delete actions.
- Added `dental-backend/test/phase4PatientManagement.test.js`; all 10 Phase 2-4 API/identity tests and Node syntax checks pass.
- Deployed 2026-07-11: migration applied, chaincode `basic` 1.0.3 sequence 5 committed, mapped patient state sanitized, APIs/frontend deployed, and authenticated CRUD/assignment smoke flow passed.

# Phase 5 Doctor Management Completion - 2026-07-12

- Added doctor license number, Emirates ID, clinic ID, and modification metadata to `database/dump.sql` plus migration `database/migrations/2026-07-12-phase5-doctor-management.sql`.
- Replaced split registration with coordinated `POST /doctors` and compatible `/registerDoctor`: server-generated `Doctor-<UUID>`, clinic from authenticated admin, MySQL transaction, and Fabric registration before commit.
- Added clinic-scoped doctor list/read/update/delete APIs. Coordinated delete refuses doctors with assigned patients and removes Fabric state before MySQL commit.
- Extended Blockchain API and chaincode doctor create/update contracts with license and Emirates ID while retaining Phase 2 admin clinic and actor certificate enforcement.
- Added parameter-free `GET /doctor/me/assigned-patients`; the API derives doctor identity solely from the JWT and chaincode revalidates the certificate actor ID.
- Added admin Doctor Management UI with list/search, create/update/delete, confirmation, loading/empty/success/error states, and role-gated navigation.
- Added Phase 5 source tests and corrected a Phase 4 test assertion to scope its delete-order check to the patient route. Node syntax and all 14 Phase 2-5 source tests pass.
- Deployed 2026-07-12 from `4da2e8e` after backup `/home/ubuntu/deployment-backups/20260712-101141-phase5-predeploy`. Migration applied; chaincode `basic` 1.0.4 sequence 6 committed with both MSP approvals; Database API, Blockchain API, frontend, and Nginx deployed. Disposable create/list/license/update/read/self/spoof-denial/delete smoke checks passed and cleanup was verified. Legacy Doctor1/Doctor2 regulated fields remain null until authoritative values are supplied; Fabric CA lifecycle automation remains open.

# Phase 7 DICOM And Integrity Source Completion - 2026-07-12

- Selected private configurable filesystem storage for large DICOM/radiographic bytes; Fabric stores only opaque reference, metadata, and SHA-256. No MySQL migration is required.
- Added doctor-only raw binary upload with 512 MiB configurable limit, UUID storage keys, streaming SHA-256, and file rollback if Fabric anchoring fails.
- Added `AddDentalFileMetadata`, access-controlled `GetDentalFile`/`getDentalFiles`, and disabled the legacy unhashed CID write path.
- Added JWT/MSP-protected integrity verification returning `verified`, `mismatch`, `missing file`, or `unknown`.
- Added patient detail UI for metadata, integrity status, and assigned/consented doctor upload.
- Added upload/hash/success/mismatch/missing/unknown/metadata-only/unauthorized source tests. Blockchain API syntax and all 17 source tests pass.
- Deployed to AWS 2026-07-12 after backups `/home/ubuntu/deployment-backups/20260712-111048-phase7-source-precopy` and `/home/ubuntu/deployment-backups/20260712-111209-phase7-predeploy`. Configured `/var/lib/edr/radiographic-files` mode `0700`; committed chaincode `basic` 1.0.5 sequence 7 with both MSP approvals; 17 API tests, 18 chaincode tests, frontend build, PM2/Nginx rollout, and full doctor/patient/admin upload/verified/mismatch/missing/unauthorized smoke checks passed. No MySQL migration was required.

# Phase 6 Clinical Record Completion - 2026-07-12

- Added `Clinical_Record` migration/schema for authoritative off-chain medical and dental JSON payloads with SHA-256 hashes.
- Replaced legacy full-payload chaincode writes with metadata-only `AddMedicalRecord` and `AddDentalChartEntry`; canonical/legacy retrieval aliases enforce assignment, consent, and patient ownership.
- Added coordinated Database API create/read routes, Blockchain API metadata/access routes, required medical/dental field validation, and immutable automatic `LogClinicalAccess` records.
- Added patient detail clinical record UI for doctor creation and doctor/patient history display.
- Added Phase 6 tests; 20 API/source tests and 18 chaincode tests pass.
- Deployed migration, APIs, frontend, and `basic` 1.0.7 sequence 9 on AWS. Authenticated medical/dental create, assigned-doctor read, unauthorized-doctor denial, patient-owner read, and automatic audit-log smoke checks passed. Backup: `/home/ubuntu/deployment-backups/20260712-171801-phase6-completion-predeploy`.
# Phase 7A Web Frontend Stabilization Deployment Completion - 2026-07-13

- Scoped legacy appointment and doctor compatibility reads by authenticated clinic/actor identity and removed unrestricted row/column exposure.
- Added JWT-derived doctor assigned-patient projection with Fabric actor revalidation, and connected doctor patient list/detail to scoped Database API routes.
- Added protected/role-aware routes, expiry clearing, logout, unauthorized handling, production data states, and removal of patient/identity console output.
- Removed or explicitly disabled false dashboard metrics, sample lab data, and mock appointment creation; implemented Settings and Info navigation.
- Repaired ESLint, local font bundling, production console stripping, and patient/DICOM lazy loading.
- Added a multi-stage Nginx frontend image, health check, and same-origin Database/Blockchain API proxying in Compose.
- Verification: frontend 4/4 tests, combined API/source 24/24 tests, lint with zero warnings, Vite production build, Compose configuration, and local static HTTP serving passed.
- Deployment: commit `d6ecc1b` is live after backup `/home/ubuntu/deployment-backups/20260713-075154-phase7a-predeploy`; Database API rebuilt, frontend rebuilt/copied to `/var/www/edr`, Nginx validated/reloaded, and the existing Blockchain API remained online.
- AWS evidence: API/source 24/24, frontend 4/4, lint/build, frontend/proxy HTTP 200, and authenticated admin/doctor/patient runtime smoke passed, including authorization-scoped lists and disabled sample labs.
- Remaining evidence: interactive browser UI/responsive/keyboard capture, real DICOM browser execution, Phase 10 WCAG review, and Phase 11 all-services container alignment. Mobile was excluded.

## Appointments White-Page Hotfix - 2026-07-13

- Standalone Playwright reproduced the deployed `/Appointments` failure as an empty body with `e.map is not a function` and no `#AppointmentsSection`.
- Corrected `AppointmentsSection.jsx` to unwrap the scoped `{ success, data }` API envelope, validate the array, handle 401/error responses, and render loading/empty/error states.
- Added a fifth Phase 7A frontend regression preventing direct envelope assignment.
- Commit `767400d` was deployed after backup `/home/ubuntu/deployment-backups/20260713-124634-appointments-hotfix-predeploy`; frontend tests 5/5, lint, build, Nginx validation, and reload passed.
- Post-deployment standalone Playwright confirmed the appointments section renders `No appointments found` with zero page errors and zero console errors. Screenshot: `Outputs/verification/appointments-live-playwright.png`.

# Phase 8 Consent, Sharing, Notifications, And Audit Source Completion - 2026-07-13

- Added enriched cross-clinic access request metadata in chaincode and the Blockchain API: requester, requesting clinic, holding clinic, data type, purpose/reason, details JSON, timestamps, and actor metadata.
- Added ledger-backed notification records for admin review, patient consent, doctor grant/reject, and revocation events, with authenticated notification read/update API routes.
- Added patient owner-bound consent revocation that removes active sharing when no other granted request exists for the same patient/doctor pair.
- Added consent decision evidence on-chain, including patient actor ID, MSP ID, transaction ID, and decision timestamps.
- Extended immutable clinical access logging with access basis, request ID, purpose, and data type where available, and added admin/patient audit retrieval routes plus a web audit panel.
- Updated web workflows for doctor request creation, holding-clinic admin approve/reject, notification badge/read status, consent status colors, and audit lookup.
- Updated mobile patient request screens to display real request details and added revocation from the granted-request view.
- Added `dental-backend/test/phase8ConsentNotificationsAudit.test.js`.
- Verification: Blockchain API syntax check passed, chaincode syntax check passed, backend/API source tests 28/28 passed, frontend source tests 5/5 passed, frontend ESLint passed with zero warnings, and Vite production build passed. Existing DICOM/Cornerstone browser-compatibility and large-chunk build warnings remain.
- Deployment note: no MySQL migration is expected for Phase 8. AWS rollout must upgrade Fabric chaincode, redeploy the Blockchain API, rebuild/copy the web frontend, refresh the mobile app package/runtime, and smoke-test Doctor -> Admin -> Patient -> access/audit workflows.

# Phase 8 Consent, Sharing, Notifications, And Audit Deployment Completion - 2026-07-14

- Deployed the Phase 8 source set to the AWS VM using a targeted payload into `/home/ubuntu/EDR` after backup `/home/ubuntu/deployment-backups/20260714-064709-phase8-predeploy`.
- No MySQL migration was required for Phase 8.
- Fixed a Fabric JavaScript contract metadata issue discovered during smoke testing by removing default parameter syntax from `RequestDataAccess`, `RevokeConsent`, and `GetNotificationsForActor` transaction signatures and applying defaults inside the function bodies. Initial deployed `basic` 1.0.8 sequence 10 was superseded by final `basic` 1.0.9 sequence 11.
- Final Fabric lifecycle state: `basic` version `1.0.9`, sequence `11`, committed with Org1MSP and Org2MSP approvals.
- Redeployed the Blockchain API under PM2, rebuilt the web frontend, copied the build output to `/var/www/edr`, and validated/reloaded Nginx in the accepted current topology.
- Deployment verification passed on the VM: backend/API tests 28/28, direct chaincode tests 18/18, frontend tests 5/5, frontend lint, and Vite production build.
- Authenticated smoke passed for public frontend HTTP 200, doctor/admin/patient login, pre-consent denial, doctor request creation, admin notification and approval, patient notification and read-status update, patient consent metadata, doctor access after consent, immutable audit retrieval, revocation, and denied access after revocation.
- Final smoke marker: `PHASE8_CONSENT_AUDIT_SMOKE_OK`.
