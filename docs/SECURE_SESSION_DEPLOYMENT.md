# Secure Session Deployment Runbook

This upgrades the existing deployed MySQL database. It does not create,
replace, or remove the production database volume.

## Preconditions

- Take and verify a MySQL backup.
- Keep the current application containers available for rollback.
- Generate an RSA signing key outside source control.
- Base64-encode the complete private and public PEM values without line breaks.
- Generate independent random `REFRESH_TOKEN_PEPPER` and
  `SESSION_METADATA_PEPPER` values.
- Store private keys and peppers only in the deployment secret channel.

Required production configuration:

```text
JWT_PRIVATE_KEY_BASE64
JWT_PUBLIC_KEY_BASE64
JWT_ALGORITHM=RS256
JWT_ACTIVE_KID=primary
JWT_ISSUER=bc-dentistry-auth
JWT_AUDIENCE=bc-dentistry-api
REFRESH_TOKEN_PEPPER
SESSION_METADATA_PEPPER
ACCESS_TOKEN_TTL=10m
WEB_SESSION_IDLE_TTL=30m
WEB_SESSION_ABSOLUTE_TTL=8h
MOBILE_SESSION_IDLE_TTL=7d
MOBILE_SESSION_ABSOLUTE_TTL=30d
SESSION_RETENTION_DAYS=90
CORS_ORIGIN=https://<the-exact-web-origin>
```

Do not reuse `JWT_SECRET` as either pepper. The legacy secret remains only
during the compatibility window and should be removed after rollout evidence
confirms that no legacy clients remain.

## Existing database upgrade

From the deployed checkout:

```bash
chmod +x scripts/apply-secure-auth-migration.sh
./scripts/apply-secure-auth-migration.sh
```

The final line must be `SECURE_AUTH_SCHEMA_OK`. The script is repeat-safe and
preserves existing users and clinical records.

## Application rollout

After schema verification:

```bash
docker compose config --quiet
docker compose build database-api blockchain-api web-frontend
docker compose up -d database-api blockchain-api web-frontend
docker compose ps
```

Do not remove or recreate the MySQL volume.

## Runtime verification

Verify:

1. Both API health responses report `sessionSchema: true`.
2. Web login sets host-only `HttpOnly; Secure; SameSite=Strict` access and
   refresh cookies plus the readable CSRF cookie.
3. No JWT exists in browser storage, URLs, or rendered markup.
4. Mobile login returns native credentials only for `ios` or `android`.
5. Refresh rotates the token; reuse revokes the session family.
6. Logout immediately blocks the previous access token on both APIs.
7. Password change blocks other sessions and rotates the current one.
8. Clinic deactivation blocks affected sessions.
9. Device listing and selected-device revocation work.
10. `Auth_Session_Event` contains lifecycle metadata but no raw tokens.

## Rollback

If application rollout fails, restore the previous application containers and
retain the additive session tables and columns. Do not delete audit evidence.
Restore the database backup only if comparison proves the migration damaged
existing data. Old application code ignores these additive schema objects, so
application rollback does not require destructive schema rollback.
