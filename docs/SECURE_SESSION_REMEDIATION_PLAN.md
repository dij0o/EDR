# Secure Authentication and Session Remediation Plan

Status: Implemented in source; database/application deployment and live
runtime verification remain pending.

Applies to:

- `backend` database/authentication API
- `dental-backend` blockchain API
- `bc-dentistry-frontend` web client
- `BC-Dentistry-Mobile-App` patient mobile client
- MySQL schema, deployment configuration, tests, and Postman documentation

## 1. Current verified risks

The current implementation:

- issues one bearer JWT from `POST /login`;
- uses an environment-configured JWT lifetime currently set to eight hours;
- stores the web JWT and user profile in `localStorage`;
- keeps the mobile JWT only in React state;
- has no refresh-token contract;
- has no server-side session record;
- has no backend logout or token-revocation endpoint;
- allows a copied JWT to remain usable until its expiry, even after the user selects Log out;
- does not provide users or administrators with active-session visibility or remote revocation;
- does not revoke outstanding JWTs automatically after password changes, user deactivation, or clinic deactivation.

The web logout button currently unregisters the browser push token and clears local browser storage. Mobile currently has no logout action.

## 2. Target security architecture

Use a server-managed session model with short-lived signed access tokens and one-time-use rotating refresh tokens.

### 2.1 Access tokens

- Lifetime: 10 minutes initially; make configurable with a maximum production value.
- Claims: `iss`, `aud`, `sub`, `sid`, `jti`, `iat`, `nbf`, `exp`, normalized role, clinic ID, and verified blockchain actor ID.
- Sign with an asymmetric key such as ES256 or RS256.
- Only the authentication service holds the private signing key.
- Database and blockchain APIs verify tokens using the public key and an expected issuer/audience.
- Include a key ID (`kid`) and support overlapping public keys for controlled key rotation.
- Both protected APIs must verify that the `sid` still represents an active server-side session.

The session lookup means logout, password changes, account deactivation, and administrative revocation take effect immediately instead of waiting for JWT expiry.

### 2.2 Refresh tokens

- Generate at least 256 bits using a cryptographically secure random source.
- Store only a SHA-256 or keyed-HMAC hash in MySQL; never store the raw token.
- Rotate the refresh token on every successful refresh.
- Mark the previous token used and link it to its replacement.
- Treat reuse of an already-used refresh token as likely theft and revoke the entire token family/session.
- Give refresh tokens an absolute expiry and an idle expiry.
- Do not put refresh tokens in URLs, JWT claims, application logs, analytics, or error messages.

Suggested initial limits:

- Web session: 8-hour absolute lifetime and 30-minute idle lifetime.
- Mobile session: 30-day absolute lifetime and 7-day idle lifetime.
- Require full credential reauthentication for sensitive operations and after either limit.

These values must be reviewed against the organization’s security and clinical workflow requirements before production use.

### 2.3 Web transport and storage

- Do not expose access or refresh tokens to browser JavaScript.
- Serve the web application, database API, and blockchain API through one HTTPS origin using the existing Nginx layer.
- Store the access token in a host-only `HttpOnly; Secure; SameSite=Strict; Path=/` cookie.
- Store the refresh token in a separate host-only `HttpOnly; Secure; SameSite=Strict` cookie.
- Do not set a broad `Domain` attribute.
- Use a synchronizer CSRF token associated with the server session for every state-changing request.
- Keep the CSRF token in application memory, send it in `X-CSRF-Token`, and validate it server-side.
- Additionally reject unsafe cross-origin requests using strict `Origin`/`Referer` validation and Fetch Metadata headers where supported.
- Set `Cache-Control: no-store` on authentication responses and protected responses containing patient information.
- Return `Clear-Site-Data` as appropriate during logout, with care not to remove unrelated same-origin application data.

### 2.4 Mobile transport and storage

- Keep the short-lived access token in memory.
- Store only the refresh token and minimal non-sensitive session metadata in Expo SecureStore, backed by iOS Keychain and Android Keystore.
- Never use AsyncStorage, unencrypted files, React state persistence, logs, deep links, or clipboard storage for refresh tokens.
- Restore a session by reading the refresh token from SecureStore and calling the refresh endpoint.
- Clear SecureStore and all in-memory identity data on logout or unrecoverable refresh failure.
- Serialize refresh attempts so concurrent `401` responses cannot rotate the same refresh token multiple times.
- Retry the original request once after a successful refresh; never create an infinite refresh loop.
- Require device reauthentication/biometric confirmation for locally sensitive features if the product requirement calls for it.

## 3. Required database changes

Add a versioned migration creating these tables.

### 3.1 `Auth_Session`

Required fields:

- `Session_ID` UUID/128-bit identifier, primary key
- `User_ID`, foreign key to `User.ID`
- `Client_Type`: `web`, `ios`, or `android`
- `Device_Label`
- `Token_Family_ID`
- `Created_At`
- `Last_Seen_At`
- `Idle_Expires_At`
- `Absolute_Expires_At`
- `Revoked_At`, nullable
- `Revocation_Reason`, nullable
- `Created_IP_Hash`, nullable
- `Last_IP_Hash`, nullable
- `User_Agent_Hash`, nullable

Indexes:

- active sessions by `User_ID`
- `Token_Family_ID`
- expiry/revocation cleanup indexes

Do not store raw IP addresses or complete user-agent strings unless a documented retention requirement justifies them. Prefer keyed hashes or minimized metadata.

### 3.2 `Auth_Refresh_Token`

Required fields:

- `Token_ID`, primary key
- `Session_ID`, foreign key to `Auth_Session`
- `Token_Hash`, unique
- `Parent_Token_ID`, nullable
- `Replaced_By_Token_ID`, nullable
- `Issued_At`
- `Expires_At`
- `Used_At`, nullable
- `Revoked_At`, nullable

Retain used token hashes until the token family expires so reuse can be detected. A scheduled cleanup job should remove expired session/token history according to the approved audit-retention policy.

### 3.3 User security version

Add `Security_Version` or `Sessions_Invalid_Before` to `User`.

Use it to invalidate every existing session after:

- password reset;
- suspected compromise;
- user deactivation;
- material role or clinic assignment change;
- administrator “log out all devices.”

## 4. Required authentication API contracts

Keep `/login` temporarily as a compatibility alias, but make `/auth/*` canonical.

### 4.1 `POST /auth/login`

Input:

- email
- password
- client type
- optional device label

Behavior:

- rate-limit by account and network source;
- return the same public failure message for unknown user and incorrect password;
- create an `Auth_Session` and first refresh-token record;
- issue a 10-minute access token containing `sid` and `jti`;
- set secure cookies for web clients;
- return access/refresh credentials in the JSON body only for approved native clients;
- never return password hashes or raw session database identifiers unnecessarily;
- audit success and failure without logging credentials or tokens.

### 4.2 `POST /auth/refresh`

Behavior:

- accept the web refresh cookie or native refresh token;
- hash and locate the submitted token;
- reject expired, revoked, or unknown tokens;
- atomically mark the token used and issue its replacement;
- revoke the whole family if a used token is presented again;
- re-check user, clinic, role, password-change, and security-version status;
- issue a new access token and rotated refresh token;
- update idle expiry and last-seen metadata;
- return `Cache-Control: no-store`.

Rotation must execute in one database transaction with row locking so two requests cannot both succeed.

### 4.3 `POST /auth/logout`

Behavior:

- idempotently revoke the current `sid` and refresh-token family;
- invalidate the current web cookies;
- unregister the supplied/associated push token where appropriate;
- return `204 No Content`;
- record a session-destruction audit event.

The access token must fail on both APIs immediately after logout.

### 4.4 `POST /auth/logout-all`

Behavior:

- require recent authentication;
- revoke every active session for the authenticated user;
- increment `Security_Version` or update `Sessions_Invalid_Before`;
- clear the current client cookies/credentials;
- record the action in the audit log.

### 4.5 `GET /auth/sessions`

Return the user’s active devices with minimized metadata:

- session identifier safe for display/revocation
- client type and device label
- created time
- last-used time
- approximate location only if approved
- whether it is the current session

Never return refresh-token hashes, raw IP addresses, or complete bearer tokens.

### 4.6 `DELETE /auth/sessions/:sessionId`

Allow a user to revoke one owned session. Administrators require an explicitly authorized support/security route; clinic administrators must not automatically gain cross-clinic session-control powers.

### 4.7 `GET /auth/me`

Return the current authoritative user profile and session status. Clients should not trust a profile persisted from a previous login without server revalidation.

## 5. Backend implementation changes

### 5.1 Shared authentication module

Create one tested authentication package/module used by `backend` and `dental-backend` for:

- access-token verification;
- issuer/audience/algorithm allow-list enforcement;
- claim normalization and validation;
- active-session and security-version validation;
- role and actor-ID enforcement;
- standard `401` and `403` error responses;
- CSRF/origin enforcement for cookie-authenticated browser requests.

Explicitly reject:

- tokens using an unexpected algorithm;
- missing `iss`, `aud`, `sub`, `sid`, `jti`, or `exp`;
- inactive or expired sessions;
- sessions belonging to inactive users or clinics;
- tokens issued before the user’s invalidation timestamp/security version.

### 5.2 Password and account lifecycle

- Password change: revoke every other session and rotate the current session.
- Password reset: revoke all sessions.
- User deactivation: revoke all user sessions in the same business operation.
- Clinic deactivation: revoke sessions belonging to clinic administrators and affected clinic users according to the approved policy.
- Role, clinic, or blockchain identity changes: revoke or rotate affected sessions so stale claims cannot remain active.
- Forced first-password change: permit only `/auth/me`, `/change-password`, refresh if policy permits it, and logout.

### 5.3 CORS and proxy hardening

- Replace wildcard-capable CORS behavior with an exact production-origin allow-list.
- Set `credentials: true` only for the approved web origin.
- Reject `CORS_ORIGIN=*` in production startup validation.
- Ensure Nginx terminates HTTPS and forwards the original scheme correctly.
- Configure Express `trust proxy` narrowly so secure cookies work without trusting arbitrary proxy headers.
- Apply HSTS, CSP, `frame-ancestors`, MIME-sniffing protection, and restrictive referrer policy at Nginx/application level.

### 5.4 Rate limits and abuse controls

Add rate limits and progressive delay to:

- login;
- refresh;
- password change/reset;
- session-listing and revocation routes.

Do not implement permanent account lockout that can be abused for denial of service. Produce security alerts for credential stuffing, repeated refresh-token reuse, and unusual session creation.

## 6. Web-client changes

Remove:

- `localStorage.setItem('token', ...)`;
- `localStorage.getItem('token')`;
- client-side JWT decoding as the authority for session validity;
- manual `Authorization` bearer-header construction.

Add:

- `credentials: 'include'` for database and blockchain API requests;
- an in-memory CSRF token/header;
- a central API client that performs one refresh attempt after an access-token `401`;
- an application bootstrap call to `/auth/me`, followed by refresh when appropriate;
- a real logout call before local UI cleanup;
- active-session/device management UI;
- “Log out all devices”;
- session-expired and session-revoked user messaging;
- cross-tab logout/session synchronization using `BroadcastChannel` without broadcasting tokens;
- cleanup of cached patient state on logout.

Web push-token removal must remain best-effort, but server session revocation must occur even if Firebase cleanup fails.

## 7. Mobile-client changes

Add the compatible Expo SecureStore dependency and create one canonical API/session client.

The session provider must implement explicit states:

- `restoring`
- `authenticated`
- `unauthenticated`
- `refreshing`
- `revoked`

Required flows:

- login and save rotated refresh token securely;
- restore session on startup;
- refresh shortly before access-token expiry or once after `401`;
- update SecureStore atomically after rotation;
- clear state and navigate to sign-in after revocation/expiry;
- explicit logout that calls `/auth/logout`, unregisters the push token, then clears SecureStore even if the network call fails;
- deferred server cleanup marker when logout occurs offline;
- account switching without reusing the previous account’s device token;
- active-device listing and revocation where required.

Remove the production HTTP fallback URLs. Production mobile builds must require HTTPS API configuration and fail closed when configuration is missing.

## 8. Blockchain API changes

The blockchain API must not rely only on a correctly signed but potentially revoked JWT.

Required changes:

- validate the access-token public signature and strict claims;
- query/cache the central session status using `sid`;
- keep revocation-cache TTL shorter than the desired logout-propagation limit;
- invalidate cache entries on logout/revocation events;
- reject requests from deactivated users/clinics and stale security versions;
- preserve existing patient-self, doctor-self, and clinic-scope checks;
- include `sid`, actor, action, request ID, and outcome in security audit events, but never include tokens.

If the blockchain API cannot safely access the session repository, introduce an internal authenticated token-introspection endpoint. Do not expose introspection publicly.

## 9. Configuration and secrets

Add validated configuration for:

- `ACCESS_TOKEN_TTL`
- `WEB_SESSION_IDLE_TTL`
- `WEB_SESSION_ABSOLUTE_TTL`
- `MOBILE_SESSION_IDLE_TTL`
- `MOBILE_SESSION_ABSOLUTE_TTL`
- `JWT_ISSUER`
- `JWT_AUDIENCE`
- signing key path/secret reference and active `kid`
- accepted public verification keys
- refresh-token hash pepper, stored in a secret manager
- exact web origin
- cookie names and production secure-cookie enforcement
- session cleanup/audit retention

Remove the shared symmetric `JWT_SECRET` after the asymmetric-key migration. Never place private keys or token peppers in source control, images, frontend environment variables, or mobile bundles.

Startup must fail in production if:

- HTTPS/secure-cookie assumptions are not satisfied;
- wildcard CORS is configured;
- issuer/audience/key configuration is missing;
- development fallback secrets are present;
- session TTLs exceed approved maximums.

## 10. Test changes and acceptance criteria

### 10.1 Backend contract tests

- Login creates exactly one active session and one refresh-token record.
- Refresh rotates the token; the previous token cannot refresh again.
- Concurrent refresh attempts allow only one success.
- Refresh-token reuse revokes the complete family.
- Logout is idempotent and immediately blocks both APIs.
- Logout-all blocks every previously issued access and refresh token.
- Password change/reset revokes the required sessions.
- User and clinic deactivation invalidate affected sessions.
- Tokens with wrong issuer, audience, algorithm, key, session, user, role, or security version fail.
- Expired access and refresh tokens fail with stable error codes.
- Raw tokens never appear in application logs or database records.

### 10.2 Web security tests

- No JWT or refresh token exists in local/session storage, IndexedDB, URLs, DOM, or JavaScript-readable cookies.
- Cookies have `HttpOnly`, `Secure`, correct `SameSite`, host-only scope, and appropriate paths.
- State-changing requests without a valid CSRF token fail.
- Disallowed origins cannot make credentialed requests.
- Logout clears cookies, cached patient state, and invalidates server access.
- A stolen pre-logout access token fails immediately after logout.
- Cross-tab logout updates every open tab.

### 10.3 Mobile security tests

- Refresh token exists only in SecureStore/Keychain/Keystore-backed storage.
- Application logs and crash output contain no tokens.
- Cold start restores a valid session without exposing credentials.
- Offline, expired, revoked, and reused-token cases return safely to sign-in.
- Concurrent API failures cause one refresh operation.
- Logout clears secure storage and in-memory patient data.
- Account switching cannot retain the previous account’s session or push token.
- Android backup and iOS migration behavior are explicitly configured and tested.

### 10.4 Operational acceptance

- Database migration and rollback are tested on a production-like copy.
- Signing-key rotation is rehearsed.
- Session cleanup and security-event monitoring run successfully.
- Existing web and mobile feature flows pass after the auth transport changes.
- Postman collection contains implemented login, refresh, logout, logout-all, session-list, and session-revocation requests with working tests.
- Runtime evidence confirms logout invalidation on both database and blockchain APIs.

## 11. Recommended implementation sequence

1. Approve session TTLs, reauthentication rules, audit retention, and web cookie architecture.
2. Add schema migrations and the shared server-side session/authentication module.
3. Add asymmetric signing and strict verification to both APIs.
4. Implement login, refresh rotation/reuse detection, logout, logout-all, and session management endpoints.
5. Wire password/account/clinic lifecycle events to session revocation.
6. Migrate the web client to secure cookies, CSRF protection, `/auth/me`, refresh, and real logout.
7. Migrate mobile to SecureStore, startup restoration, serialized refresh, and real logout.
8. Add automated backend, web, mobile, and security regression tests.
9. Update Postman and deployment documentation.
10. Deploy behind HTTPS/Nginx, run production-like verification, and only then remove legacy `/login`/bearer-storage compatibility.

Do not remove the legacy contract until web, mobile, automated tests, scripts, Postman documentation, and the deployed runtime have all migrated.
