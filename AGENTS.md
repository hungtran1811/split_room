# Split Room — Agent Instructions

## Project context

Split Room is a Vite + Firebase application for managing shared-room expenses, payments, rent periods, and member balances.

Production mapping:

- GitHub: `hungtran1811/split_room`
- Netlify project: `splitfam`
- Production URL: `https://splitfam.netlify.app`
- Default branch: `main`

## Working rules

1. Never commit directly to `main`.
2. Use one focused branch and one pull request per risk or feature.
3. Do not deploy Firebase rules, run production migrations, or modify Netlify environment variables without explicit approval.
4. Do not add personal email addresses, Firebase UIDs, API keys, secrets, or production data to source control.
5. Preserve Vietnamese UI copy unless the task explicitly changes product language.
6. Avoid unrelated refactors in bug-fix pull requests.

## Required validation

Before opening or updating a pull request, run:

```bash
npm ci
npm test
npm run test:rules
npm run build
```

If a command fails, report the root cause. Do not bypass, disable, or weaken a failing test merely to make CI pass.

## Architecture boundaries

- Keep money calculations in `src/core` or `src/domain` rather than UI components.
- Keep Firebase access behind service/repository modules.
- UI components should not contain authorization decisions.
- Firestore Security Rules are the source of truth for data access; frontend guards are only user-experience controls.
- Store monetary values as whole VND integers. Avoid floating-point arithmetic for persisted money.

## Firestore security requirements

- Membership must be derived from `groups/{groupId}/members/{uid}`.
- Users must not be able to elevate their own role.
- Owners/admins may perform operator actions only within groups where they hold that role.
- New rule behavior requires Firebase Emulator tests.
- Do not hard-code allowlisted personal emails or owner UIDs.

## Pull request expectations

Every pull request should include:

- Problem and root cause
- Scope of changes
- Security or data-migration impact
- Commands run and results
- Manual test steps
- Known limitations or follow-up tasks
