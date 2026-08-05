# Data Model

## Group

Path: `groups/{groupId}`

Fields:

- `name`
- `createdAt`

## Member Profile

Path: `groups/{groupId}/members/{uid}`

Fields:

- `uid`
- `email`
- `displayName`
- `photoURL`
- `memberId`
- `role`
- `createdAt`
- `updatedAt`

`role` is the permission source of truth and must be one of `owner`, `admin`, or `member`.

## RentDoc

Path: `groups/{groupId}/rents/{period}`

`period` is the document id in `YYYY-MM` format.

Fields:

- `period`
- `payerId`
- `items`
- `total`
- `headcount`
- `water`
- `electric`
- `computed`
- `splitMode`
- `shares`
- `paid`
- `note`
- `status`
- `finalizedAt`
- `finalizedBy`
- `createdBy`
- `createdAt`
- `updatedAt`

## Expense

Path: `groups/{groupId}/expenses/{expenseId}`

Fields:

- `date` (`YYYY-MM-DD`)
- `amount` (integer VND)
- `payerId` (member id)
- `participants` (array of member ids)
- `debts` (map memberId -> amount owed to payer)
- `note`
- `createdBy`
- `createdAt`
- `updatedAt`

## Payment

Path: `groups/{groupId}/payments/{paymentId}`

Fields:

- `date` (`YYYY-MM-DD`)
- `amount` (integer VND)
- `fromId` (debtor member id)
- `toId` (creditor member id)
- `note`
- `createdBy`
- `createdAt`
- `updatedAt`

## Period Snapshot

Path: `groups/{groupId}/periods/{period}`

Used for snapshots, locking, and legacy compatibility reads.

Fields may include:

- `period`
- `lockedSoft`
- `lockedAt`
- `lockedBy`
- `closedAt`
- `closedBy`
- `closeSource` (`manual` | `schedule`)
- `snapshotType` (`month-close`; legacy docs may still have `monthly-report`)
- `stats`
- `snapshot`
- `rent`
- `updatedAt`

Month-close snapshots set `lockedSoft: true` and `snapshotType: "month-close"`.
The `snapshot` map typically holds `balances`, `settlementPlan`, `rent`, and `members`.
There is no Reports UI or CSV export in the React app; period snapshots exist for soft-lock and settlement freeze.

## Notification

Path: `groups/{groupId}/notifications/{notificationId}`

In-app inbox per authenticated member.

Fields:

- `uid` (recipient Firebase Auth uid)
- `memberId` (roster id)
- `type` (e.g. `month-closed`)
- `period` (`YYYY-MM`)
- `title`
- `body`
- `settlement` (optional array of settlement rows relevant to the member)
- `createdAt`
- `readAt` (null until the recipient marks read)

Security: members can read only their own docs; they may update only `readAt`.
Operators may create; owners may delete.

## Mail Outbox

Path: `groups/{groupId}/mailOutbox/{mailId}`

Email queue for Cloud Functions (`processMailOutbox`). Clients never send SMTP directly.

Fields:

- `to`
- `uid`
- `memberId`
- `period`
- `groupId`
- `type` (e.g. `month-closed`)
- `subject`
- `text`
- `html`
- `status` (`pending` on create; Functions update to `sent` / `failed`)
- `createdAt`
- `sentAt` / `failedAt` / `error` / `provider` / `providerId` (set by Admin SDK)

Security: operators may create with `status: "pending"`; client updates/deletes are denied.
Functions use the Admin SDK to update delivery status (bypasses rules).
