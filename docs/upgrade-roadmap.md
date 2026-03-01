# Upgrade Roadmap

## Scope

This repo keeps the current stack: Vite, vanilla JavaScript, Firebase Auth, Firestore, Bootstrap.

The upgrade priorities are:

1. Move Firestore rules and indexes into the repo.
2. Make `members/{uid}.role` the source of truth for permissions.
3. Keep `groups/{groupId}/rents/{YYYY-MM}` as the canonical rent path.
4. Preserve backward compatibility with legacy rent data embedded under `periods/{period}.rent`.
5. Add tests and operational scripts so production changes are repeatable.

## Rollout Order

1. Deploy rules and indexes.
2. Run rent backfill.
3. Verify rent data integrity.
4. Deploy frontend.
5. Smoke test `#/dashboard`, `#/expenses`, `#/rent`, and Google login.

## Notes

- Default group is `P102`.
- Legacy fallback reads from `groups/{groupId}/periods/{period}.rent` remain in place during the migration window.
- New writes should target `groups/{groupId}/rents/{period}`.
