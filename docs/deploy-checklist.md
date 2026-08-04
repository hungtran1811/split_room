# Deploy Checklist

## Before Deploy

1. Backup Firestore.
2. Run `npm run build`.
3. Run `npm run test`.
4. Run `npm run test:rules`.

`npm run test:rules` requires:

- A JDK available in `PATH` or a local JDK installation discoverable by `scripts/run-firestore-emulator.mjs`
- Local project dependencies installed via `npm install`

`npm run test:rules` now runs against the demo project `demo-split-room-test`, so `firebase login` is not required for local rules tests.

The following commands still require real Firebase credentials against your target project:

- `npm run backfill:rents -- P102`
- `npm run verify:data -- P102`

Use one of these authentication methods before running the data scripts:

- `GOOGLE_APPLICATION_CREDENTIALS` pointing to a service account JSON
- Application Default Credentials configured for your machine

## Deployment Order

1. Deploy Firestore rules and indexes.
2. Run `npm run backfill:rents -- P102` if rent migration is needed.
3. Run `npm run verify:data -- P102`.
4. Deploy frontend.

## Smoke Test

1. Login with Google.
2. Open `#/dashboard`.
3. Open `#/expenses`.
4. Open `#/rent`.
5. Create or update a rent month as admin.
6. Verify an existing legacy rent month still loads.
