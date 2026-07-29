# BC Dentistry EDR Postman collection

Import `BC_Dentistry_EDR_Web_Mobile.postman_collection.json` into Postman.

The collection is divided into top-level **Web** and **Mobile** folders. Overlapping requests are intentionally duplicated. Every mobile request includes its purpose, identity/authorization rules, and relevant side effects.

## Setup

1. Set `databaseApiBaseUrl` and `blockchainApiBaseUrl` for the target environment.
2. Set only the test credentials you need. Do not save production credentials or patient data in the shared collection.
3. Run the appropriate Web or Mobile login request. Its test script stores the returned JWT and identity values in collection variables.
4. Fill the resource variables needed by a request, such as `requestId`, `appointmentId`, or `fileId`.

The example passwords are placeholders, not working credentials.

## Mobile session lifecycle

The mobile app currently uses:

- patient login;
- patient-scoped appointment listing;
- listing all patient data-access requests;
- grant consent;
- reject request;
- revoke consent.

The **Secure Session Lifecycle** folder documents the implemented rotating
refresh-token, server logout, current-session, active-device, and remote
revocation contracts. Native login and refresh test scripts store replacement
credentials in collection variables. Do not save real shared-environment
credentials when exporting the collection.

The current mobile sign-up screen is not connected to a backend API, so no working mobile registration request is represented.

## Regeneration

After changing the generator:

```powershell
node .\docs\postman\build-postman-collection.js
```
