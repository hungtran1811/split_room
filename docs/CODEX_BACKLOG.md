# Codex Remediation Backlog

This backlog converts the current technical risks into small, reviewable Codex tasks. Complete tasks in order unless a production incident requires reprioritization.

## SR-01 — Replace hard-coded authorization

**Priority:** Critical

### Goal

Remove personal email and UID allowlists from Firestore Security Rules. Use group membership documents as the source of truth.

### Acceptance criteria

- No personal email address or fixed owner UID remains in `firestore.rules`.
- Group reads require membership in `groups/{groupId}/members/{uid}`.
- Members cannot promote their own role.
- Owner/admin permissions remain scoped to the current group.
- Existing rent and period validation remains intact.
- Emulator tests cover anonymous, non-member, member, admin, owner, and privilege-escalation cases.
- `npm test`, `npm run test:rules`, and `npm run build` pass.
- No production deploy or migration is performed.

## SR-02 — Add membership migration plan

**Priority:** High

### Goal

Prepare a safe, idempotent migration for existing users before new rules are deployed.

### Acceptance criteria

- Dry-run mode is the default.
- Script reports intended writes without changing production data.
- Existing member documents are not overwritten incorrectly.
- Migration includes rollback and verification instructions.
- Production execution requires explicit manual approval.

## SR-03 — Strengthen CI and deployment gates

**Priority:** High

### Goal

Verify the existing GitHub Actions workflow is green and suitable as a required status check.

### Acceptance criteria

- CI runs on pull requests and pushes to `main`.
- Unit tests, Firestore Rules tests, and Vite build all run.
- Node and Java versions are documented.
- No test command is skipped to make CI pass.
- README documents how to enable branch protection and required checks.

## SR-04 — Add Netlify security headers

**Priority:** Medium

### Goal

Add security headers without breaking Firebase, Bootstrap, fonts, or application routing.

### Acceptance criteria

- Add `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`, and frame protection.
- Add a tested Content Security Policy or begin with report-only mode when required.
- Preserve the SPA fallback redirect.
- `npm run build` passes.
- Manual test checklist covers login, Firestore reads/writes, navigation, and external assets.

## SR-05 — Audit money and debt invariants

**Priority:** Medium

### Goal

Protect the core expense-editing and settlement calculations from invalid totals.

### Acceptance criteria

- Persisted amounts remain whole VND integers.
- Total allocated debt never exceeds the expense amount.
- Empty participants, payer changes, rounding, zero values, and edited expenses are tested.
- Pure calculation logic remains outside UI components.

## Recommended Codex workflow

For each task:

1. Create `agent/<task-name>` from `main`.
2. Inspect relevant source and tests before editing.
3. Implement only the scoped change.
4. Run all required validation from `AGENTS.md`.
5. Open a draft pull request with evidence and remaining risks.
