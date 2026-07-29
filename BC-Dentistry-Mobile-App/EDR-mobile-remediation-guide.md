# EDR Mobile App — Remediation Task Register & Solutions Guide

**Source:** `EDR_Mobile_Remediation_Task_Register_Task_Register_.csv`
**Total tasks:** 65 (MOB-001 → MOB-065)
**Stack assumed:** Expo (React Native), Node.js/Express backend, JWT auth

This document restates every task from the register grouped by workstream, and adds a concrete implementation approach for each — written for direct use by a dev or an IDE AI agent. P0 items are true blockers (security/compliance-critical for a healthcare app); P1 items are functional completeness/quality.

---

## How to use this doc

- Work top to bottom **within each workstream** — later tasks in a workstream usually depend on earlier ones (e.g. you can't do route guards before you have a session service).
- **Authentication → Authorization → API Platform → Routes** is the critical path. Almost everything else depends on this chain existing first.
- Items marked `Backend` need backend changes; `Mobile` is app-side; `Mobile + Backend` needs both, coordinated.

---

## 1. Authentication (MOB-001 → MOB-011) — P0

### MOB-001 — Define versioned login/refresh/logout/revocation API contracts
**Role:** Mobile
**Problem:** Backend currently only returns an access token — mobile can't implement refresh independently without an agreed contract.
**Solution:** Write an OpenAPI/Swagger spec (or a shared TypeScript types package) covering:
```
POST /v1/auth/login    → { accessToken, refreshToken, expiresIn, tokenType }
POST /v1/auth/refresh  → { accessToken, refreshToken, expiresIn }
POST /v1/auth/logout   → { success: true }
```
Include explicit status/error codes (401 expired, 403 revoked, 429 rate-limited). Store this contract in a shared repo/doc both mobile and backend reference — this unblocks MOB-002 through MOB-011.

### MOB-002 — Implement short-lived access JWT + rotating refresh-token issuance
**Role:** Backend
**Solution:** Access JWT: 15 min expiry, signed (RS256 preferred over HS256 for future key rotation). Refresh token: opaque random string (not JWT) stored hashed in DB, tied to a **token family ID**. On login, issue both; on refresh, issue a new refresh token and invalidate the old one within the same family.

### MOB-003 — Refresh-token rotation and reuse detection
**Role:** Backend
**Solution:** When a refresh token is used, mark it consumed. If a *consumed* token is presented again, treat it as a reuse/theft signal — revoke the entire token family immediately (all descendant tokens), forcing full re-login. Log the event for audit (MOB-004 dependency).

### MOB-004 — Authenticated logout + refresh-session revocation
**Role:** Backend
**Solution:** `POST /v1/auth/logout` must delete/invalidate the refresh token family server-side (not just tell the client to discard it). Write an audit log entry (actor, timestamp, action) — **without** logging the token value itself.

### MOB-005 — Replace in-memory auth context with a session service
**Role:** Mobile
**Problem:** Current `UserContext` loses session on app restart.
**Solution:** Introduce a dedicated `SessionService` (not tied to a React context lifecycle) responsible for: reading/writing tokens to secure storage, exposing current auth state, and notifying subscribers on change. React context/hooks (`useAuth()`) become a thin wrapper around this service rather than owning the state directly.

### MOB-006 — Store tokens in platform secure storage
**Role:** Mobile
**Solution:** Use `expo-secure-store` (iOS Keychain / Android Keystore-backed) — never `AsyncStorage` for tokens.
```bash
npx expo install expo-secure-store
```
```ts
import * as SecureStore from 'expo-secure-store';

export const tokenStorage = {
  async setTokens(access: string, refresh: string) {
    await SecureStore.setItemAsync('access_token', access);
    await SecureStore.setItemAsync('refresh_token', refresh);
  },
  async getAccessToken() { return SecureStore.getItemAsync('access_token'); },
  async getRefreshToken() { return SecureStore.getItemAsync('refresh_token'); },
  async clear() {
    await SecureStore.deleteItemAsync('access_token');
    await SecureStore.deleteItemAsync('refresh_token');
  },
};
```

### MOB-007 — Restore and validate session on app launch
**Role:** Mobile
**Problem:** Current flow uses a fixed timer redirect instead of real validation.
**Solution:** On app boot, read tokens from secure storage → if present, call a lightweight `/v1/auth/me` (or attempt silent refresh) to confirm validity before routing. Route to protected stack only on confirmed-valid session; otherwise route to sign-in. No `setTimeout`-based navigation.

### MOB-008 — Expiry-aware automatic access-token refresh
**Role:** Mobile
**Solution:** Decode JWT expiry client-side (no signature verification needed client-side, just read `exp`), and either (a) refresh proactively ~60s before expiry, or (b) refresh reactively on a 401 response. Centralize this in the HTTP client (see MOB-019), not per-screen.

### MOB-009 — Deduplicate concurrent refresh attempts
**Role:** Mobile
**Problem:** Multiple parallel 401s can each independently trigger a refresh, causing refresh storms.
**Solution:** Use a single in-flight refresh promise shared across all callers:
```ts
let refreshPromise: Promise<string> | null = null;

async function getValidAccessToken() {
  if (isExpiredOrMissing()) {
    if (!refreshPromise) {
      refreshPromise = doRefresh().finally(() => { refreshPromise = null; });
    }
    return refreshPromise;
  }
  return currentAccessToken;
}
```
Bound retries to exactly one retry per original request after a successful refresh — never loop.

### MOB-010 — Clear session and protected cache on refresh failure/revocation
**Role:** Mobile
**Solution:** On refresh failure (401/403 from `/v1/auth/refresh`), call `tokenStorage.clear()`, purge any in-memory/query cache holding protected data (React Query `queryClient.clear()` if used), reset navigation stack to the sign-in screen, and show a generic "Your session has expired" message — not the raw backend error.

### MOB-011 — Explicit logout + navigation reset
**Role:** Mobile
**Solution:** Logout action must: call `/v1/auth/logout`, clear secure storage, clear cache, and reset the navigation stack (`navigation.reset()` / expo-router's `router.replace()` into the auth group) so back-navigation can't return to protected screens.

---

## 2. Authorization (MOB-012 → MOB-014) — P0

### MOB-012 — Require patient role for mobile access
**Role:** Mobile
**Solution:** After login, check the role claim from the JWT/profile response. If not `patient`, reject immediately client-side **and** rely on backend enforcement (never trust client-only checks) — show "This app is for patient accounts" and log out, without caching any of that account's data first.

### MOB-013 — Authenticated route guards on all tabs/detail screens
**Role:** Mobile
**Problem:** Current layouts don't enforce protected navigation.
**Solution:** With `expo-router`, use route groups: `app/(auth)/` for public screens, `app/(protected)/` for everything else, with a layout-level guard in `app/(protected)/_layout.tsx`:
```tsx
export default function ProtectedLayout() {
  const { session, isLoading } = useAuth();
  if (isLoading) return <SplashScreen />;
  if (!session) return <Redirect href="/(auth)/sign-in" />;
  return <Slot />;
}
```
This blocks deep links and back-navigation into protected routes uniformly, rather than per-screen checks.

### MOB-014 — Use JWT-derived patient identity for patient-self routes
**Role:** Backend + Mobile
**Problem:** Caller-controlled patient IDs are a cross-patient data exposure risk (IDOR).
**Solution:** Backend: every "patient-self" endpoint must derive `patientId` from the verified JWT claim server-side — **never** accept a `patientId` param from the request body/URL for self-scoped routes. Mobile: stop passing `patientId` in these calls entirely; let the backend infer it. Add a contract test that sends a *different* patient's ID and confirms 403 + zero data leakage.

---

## 3. API Platform (MOB-015 → MOB-021) — P0

### MOB-015 — Consolidate `config/api.js` and `utils/api.js`
**Role:** Mobile
**Solution:** Pick one canonical module (e.g. `services/apiClient.ts`), migrate all imports to it, delete the other. Grep the codebase for both old import paths before deleting to catch stragglers.

### MOB-016 — Remove hardcoded host + unsafe HTTP fallbacks
**Role:** Mobile
**Solution:** Search for hardcoded strings (`openuae`, `http://`) in source. Replace with `EXPO_PUBLIC_API_URL` env var read at build time. Add a lint/CI grep step that fails the build if a raw `http://` (non-localhost) or hardcoded prod hostname appears in source (ties into MOB-062).

### MOB-017 — Explicit dev/staging/prod configuration
**Role:** Mobile + DevOps
**Solution:** Use EAS environment profiles in `eas.json`:
```json
{
  "build": {
    "development": { "env": { "EXPO_PUBLIC_API_URL": "https://staging-api.edr.example.com" } },
    "production": { "env": { "EXPO_PUBLIC_API_URL": "https://api.edr.example.com" } }
  }
}
```
Remember: anything prefixed `EXPO_PUBLIC_` is bundled into the client and publicly visible — never put secrets there, only non-sensitive config like base URLs.

### MOB-018 — Fail safely when required prod config is missing
**Role:** Mobile
**Solution:** At app startup, validate required env vars exist; if `EXPO_PUBLIC_API_URL` is undefined in a production build, show a blocking "Configuration Error" screen instead of silently falling back to `localhost` or a dev URL.

### MOB-019 — Centralized authenticated HTTP client
**Role:** Mobile
**Solution:** One Axios instance (or fetch wrapper) with interceptors handling: auth header injection, timeout, request cancellation (AbortController), and the refresh-on-401 logic from MOB-008/009. No screen should call `axios.get(...)` directly — only through this client.
```ts
const api = axios.create({ baseURL: process.env.EXPO_PUBLIC_API_URL, timeout: 15000 });
api.interceptors.request.use(async (config) => {
  const token = await getValidAccessToken();
  config.headers.Authorization = `Bearer ${token}`;
  return config;
});
```

### MOB-020 — Normalize canonical success/error envelopes
**Role:** Mobile
**Solution:** Define one response shape, e.g. `{ data, error: { code, message } | null }`, and a matching TypeScript type. Map all backend error responses through a single error-normalizing function so raw stack traces/internal messages from the backend never reach the UI — show `error.code`-mapped friendly text instead.

### MOB-021 — Safe retry and cancellation policy
**Role:** Mobile
**Solution:** GET requests: safe to retry automatically on network failure (idempotent). Mutations (POST/PUT/PATCH, especially consent decisions): **never** auto-retry without an idempotency key — either generate a client-side idempotency key per mutation attempt (sent as a header, deduped server-side) or require explicit user re-confirmation instead of silent retry.

---

## 4. Routes (MOB-022 → MOB-030)

### MOB-022 — Freeze canonical versioned endpoint contract — P0, Backend + Mobile
**Solution:** Same approach as MOB-001 but for the full resource API surface (requests, consent, documents, notifications, profile). Version-prefix all routes (`/v1/...`) so future breaking changes don't require another full remediation pass.

### MOB-023 — Canonical patient-self request listing route — P0, Backend
**Solution:** Implement `GET /v1/patients/me/requests` deriving identity from JWT (per MOB-014). Deprecate `getAllRequestsForPatient` — mark it `410 Gone` or remove once mobile migration (MOB-025) is confirmed complete.

### MOB-024 — Canonical consent grant/reject/revoke routes — P0, Backend
**Solution:** `POST /v1/consent/:id/grant`, `/reject`, `/revoke` — each owner-bound (JWT-derived patient), writing an immutable audit ledger entry per decision (actor, timestamp, action, reason if rejection).

### MOB-025 — Migrate mobile to canonical routes — P0, Mobile
**Solution:** Once MOB-023/024 exist, update all mobile API calls to the new endpoints, delete legacy route references, run a route-inventory grep in CI to catch regressions (ties into MOB-062).

### MOB-026 — Authenticated patient-self profile route — P1, Backend + Mobile
**Solution:** Backend: `GET /v1/patients/me/profile` returning full profile fields per SRS (login payload alone is insufficient). Mobile: fetch this on session restore rather than relying on cached login response data.

### MOB-027 — Real document/clinical-record routes — P1, Mobile
**Problem:** Documents screen currently reuses the access-request endpoint (wrong data source).
**Solution:** Point the documents screen at the actual `/v1/patients/me/documents` (or equivalent) endpoint once backend exposes it; remove the workaround.

### MOB-028 — Notification list + mark-as-read integration — P1, Mobile
**Solution:** `GET /v1/notifications`, `POST /v1/notifications/:id/read`. Show unread badge/count from server state. For push notification payloads (tying back to your Expo push work) — keep lock-screen previews generic ("You have a new update") rather than including PHI in the notification body itself; fetch details only after the user opens the app and authenticates.

### MOB-029 — Radiographic/DICOM list, integrity and content routes — P1, Mobile
**Solution:** Validate on both ends: backend enforces authorization + MIME allowlist + max file size; mobile validates filename/extension before upload/display and verifies checksum/integrity metadata returned by the API before rendering.

### MOB-030 — Patient-visible clinical access audit history — P1, Mobile
**Solution:** `GET /v1/patients/me/audit-log` surfaced as a read-only screen: actor, purpose/request reference, data type accessed, timestamp. This is a transparency/compliance feature — no write actions here, just display of the immutable ledger from MOB-024.

---

## 5. Legacy Cleanup (MOB-031 → MOB-035) — mostly P0

### MOB-031 — Remove broken public sign-up flow
**Role:** Mobile + Product
**Solution:** Delete the nonfunctional self-registration screen/nav entry entirely unless product confirms a real, approved onboarding workflow is being built to replace it. A broken or unintended public registration path is a real security gap for a healthcare app — don't leave it dormant in the bundle.

### MOB-032 — Remove sample data / placeholder avatars / fixture workflows
**Role:** Mobile
**Solution:** Delete `data.js` (or move fixtures into a `__mocks__`/dev-only path excluded from production bundles via env-gating). Grep for other hardcoded fixture imports across screens.

### MOB-033 — Remove sensitive/debug console logging
**Role:** Mobile
**Solution:** Grep for `console.log`, `console.warn` referencing patient email, medical data, documents, requests. Remove them or replace with redacted, non-PHI debug logs. Add an ESLint rule (`no-console` in production builds, or a custom rule) enforced in CI to prevent regression.

### MOB-034 — Replace hardcoded dashboard counts with live values
**Role:** Mobile
**Solution:** Replace static numbers with derived counts from the actual API response (`requests.filter(r => r.status === 'completed').length` etc., or a dedicated summary endpoint if volume is large enough to warrant server-side aggregation).

### MOB-035 — Correct malformed text / remove dead code — P1
**Role:** Mobile
**Solution:** Fix garbled login loading copy, delete commented-out code blocks. Run a lint pass (`expo lint`) and manual UI copy review as acceptance.

---

## 6. Appointments (MOB-036 → MOB-038) — P1

### MOB-036 — Complete upcoming appointment display
**Solution:** Fetch from patient-scoped API, implement loading/empty/error UI states explicitly (not just a spinner-forever or blank screen on failure). Render doctor, specialty, date, status per acceptance criteria.

### MOB-037 — Complete past/cancelled appointment display
**Solution:** Sort chronologically (descending for past), visually separate cancelled from completed (icon/tag, not color alone — see MOB-056).

### MOB-038 — Group appointments by specialty and date
**Solution:** Use real API-provided identifiers for grouping keys (not array index or derived strings prone to collision) — stable `sectionListData` keyed by specialty/date for a `SectionList`.

---

## 7. Consent (MOB-039 → MOB-042) — P1

### MOB-039 — Display complete incoming request details
**Solution:** Render doctor, clinic, requested data types, purpose, urgency, notes, timestamps, and status directly from API/ledger response — no field should be locally guessed or omitted.

### MOB-040 — Consent grant confirmation + duplicate-action prevention
**Solution:** Require explicit confirm step (dialog) before submitting a grant. Disable the action button immediately on tap (optimistic lock) until the API responds, to prevent double-submission creating two ledger entries. Refresh the affected list/screen after success.

### MOB-041 — Rejection with required reason
**Solution:** Reason field is mandatory — validate non-empty before submit, send with the rejection request, backend persists it against the ledger entry with the authenticated patient as actor.

### MOB-042 — Consent revocation confirmation
**Solution:** Same confirm-before-action pattern as MOB-040, plus explanatory copy on what revocation means (access is cut off going forward). Refresh dependent screens (e.g. document access state) post-revocation.

---

## 8. Architecture (MOB-043 → MOB-047) — P1

### MOB-043 — Reusable component library
**Solution:** Build a `components/ui/` folder: `Button`, `Input`, `Card`, `Header`, `Loader`, `Alert`, `EmptyState`, `ErrorState`, `Dialog`. Migrate feature screens to consume these instead of ad hoc inline styling.

### MOB-044 — Remove duplicate `CustomInput`/`CustomButton`
**Solution:** Grep for all definitions, pick the most complete/accessible one (or merge best parts), delete the rest, update imports project-wide.

### MOB-045 — Separate API/domain services from presentational components
**Solution:** Create `services/` modules: `authService`, `appointmentsService`, `consentService`, `notificationsService`, `profileService`, `documentsService`, `auditService`. Screens call these services (which use the centralized HTTP client from MOB-019); screens themselves hold no `axios`/`fetch` calls.

### MOB-046 — Typed API models and validation
**Solution:** Define TypeScript interfaces/types per resource, ideally generated from the OpenAPI contract (MOB-001/022) to stay in sync automatically. Add runtime validation (e.g. `zod`) at the API boundary so a malformed backend response fails predictably rather than crashing deep in a component.

### MOB-047 — Remove unused web-only dependencies
**Solution:** Audit `package.json` for packages like `@mui/material`, `@emotion/react`, `@emotion/styled` if they're leftover from a web-first version of this app and aren't actually used in the RN bundle (MUI is web-only, won't work in React Native views anyway — worth double-checking these aren't dead weight). Run `npx depcheck` to find genuinely unused packages, then remove and rebuild to confirm nothing breaks.

---

## 9. Security (MOB-048 → MOB-053)

### MOB-048 — Enforce HTTPS / production transport security — P0
**Role:** Mobile + DevOps
**Solution:** Android: review `network_security_config.xml`, ensure `cleartextTrafficPermitted="false"` for production domains. iOS: review `NSAppTransportSecurity` in `Info.plist` (via `app.json` → `ios.infoPlist`), remove any `NSAllowsArbitraryLoads` exceptions for production.

### MOB-049 — PHI cache policy — P1
**Solution:** Document what's cacheable (e.g. non-PHI UI state) vs. what must never persist beyond session (patient records, documents). Clear all protected-data caches on logout and on account switch (ties into MOB-010).

### MOB-050 — Redact PHI/credentials from crash reporting and telemetry — P1
**Solution:** If using Sentry/Bugsnag/etc., add `beforeSend` scrubbing for known PHI fields, and audit any custom telemetry/network-error logging (including notification payloads) for accidental PHI inclusion.

### MOB-051 — Validate deep links and external navigation inputs — P1
**Solution:** Whitelist expected deep-link route patterns; reject/ignore anything not matching. Sanitize and validate any parameters extracted from a deep link before using them in navigation or API calls.

### MOB-052 — Protect sensitive app-switcher previews — P1
**Solution:** iOS: use a privacy screen/blur overlay on `applicationDidEnterBackground` (via `expo-blur` or a native overlay) so the app-switcher snapshot doesn't show PHI. Android: `FLAG_SECURE` equivalent where supported. Document platform limitations where full prevention isn't possible.

### MOB-053 — Dependency and Expo SDK vulnerability review — P1
**Solution:** Run `npx expo-doctor` and `npm audit` (or `yarn audit`), remediate critical/high findings, confirm you're on a currently-supported Expo SDK version (check current EOL status against Expo's SDK support policy — worth verifying you're not several versions behind before this healthcare app ships).

---

## 10. Accessibility (MOB-054 → MOB-056) — P1

### MOB-054 — Accessibility semantics and touch targets
**Solution:** Add `accessibilityRole`, `accessibilityLabel`, `accessibilityHint`, `accessibilityState={{ selected }}` to interactive elements. Ensure touch targets meet the ~44x44pt (iOS) / 48x48dp (Android) minimum. Test screen-reader traversal order matches visual order with VoiceOver/TalkBack.

### MOB-055 — Dynamic text, safe areas, responsive layouts
**Solution:** Respect `react-native-safe-area-context` insets on all screens (you already have this dependency). Test with iOS/Android system font scaling turned up — verify no text clipping or overlap at supported device sizes/orientations.

### MOB-056 — Status not conveyed by color alone
**Solution:** Keep the green/red/blue status colors but pair each with a text label and/or icon (checkmark, X, clock) so colorblind users and screen readers both get the status without relying on hue alone.

---

## 11. Quality (MOB-057 → MOB-062)

### MOB-057 — Automated auth/session test suite — P0, QA + Mobile
**Solution:** Cover: token expiry handling, refresh success, refresh reuse/revocation, logout, role rejection, and route-guard bypass attempts. Use Jest + your existing `jest-expo` preset.

### MOB-058 — API contract and authorization integration tests — P0, QA + Backend + Mobile
**Solution:** Cover 401/403 responses, envelope shape conformance, timeout handling, malformed response handling, and cross-patient access attempts (the MOB-014 IDOR test belongs here).

### MOB-059 / MOB-060 — Android / iOS end-to-end workflow suites — P1, QA + Mobile
**Solution:** Real build (EAS dev build, same as your push notification testing setup) on representative device/emulator per platform, covering every acceptance scenario in this register end to end — not just unit-level coverage.

### MOB-061 — Offline/timeout/retry/duplicate-tap behavior — P1, QA + Mobile
**Solution:** Explicitly test: airplane-mode requests, slow/timeout responses, rapid double-tap on mutation buttons (should not create duplicate ledger entries, ties to MOB-040/021).

### MOB-062 — CI gates for lint/type-check/tests/release builds — P1, Mobile
**Solution:** GitHub Actions (or equivalent) pipeline: `expo lint` → `tsc --noEmit` → `jest --ci` (non-watch mode — note your current `"test": "jest --watchAll"` script needs a CI variant, e.g. add `"test:ci": "jest --ci --coverage"`) → EAS build on merge to main. Fail the pipeline on any step failure.

---

## 12. Documentation (MOB-063 → MOB-065) — P1

### MOB-063 — Endpoint contract and environment setup guide
**Role:** Mobile + Backend
**Solution:** Publish the frozen API contract (MOB-001/022) plus a setup doc distinguishing public config (`EXPO_PUBLIC_*`) from secrets, so a new developer can build dev/staging/prod from scratch using only the docs.

### MOB-064 — SRS-to-mobile traceability and evidence index
**Role:** Mobile + QA
**Solution:** Build a traceability matrix: SRS requirement ID → implementing task (MOB-xxx) → test evidence (screenshot/log/CI run link) on an actual mobile device. Explicitly do **not** reuse web/API test pass evidence as mobile proof — device-specific evidence only.

### MOB-065 — Truth-sync mobile status in baseline docs
**Role:** Product + QA
**Solution:** Reconcile any existing checklist/roadmap docs that currently overstate mobile completeness against verified device evidence from MOB-064 — update baseline docs to reflect actual state plus a clear list of remaining gaps.

---

## Suggested execution order (critical path)

1. **MOB-001, MOB-022** — freeze contracts first (unblocks everything downstream)
2. **MOB-002 → MOB-011** — auth foundation
3. **MOB-012 → MOB-014** — authorization on top of auth
4. **MOB-015 → MOB-021** — API platform/HTTP client (auth flows plug into this)
5. **MOB-023 → MOB-030** — canonical routes + mobile migration
6. **MOB-031 → MOB-035** — legacy cleanup (safe to parallelize once above is stable)
7. **MOB-036 → MOB-047** — feature completion + architecture cleanup (parallelizable)
8. **MOB-048 → MOB-056** — security + accessibility hardening
9. **MOB-057 → MOB-062** — test coverage (write incrementally alongside each phase above, not all at the end)
10. **MOB-063 → MOB-065** — documentation, done last once implementation is stable

**Note:** P0 items are concentrated almost entirely in Authentication, Authorization, API Platform, and Security — these are the sections to prioritize if timeline is constrained, since they represent real compliance/data-exposure risk for a healthcare app (IDOR via patient ID, tokens in AsyncStorage, cleartext HTTP, PHI in logs).
