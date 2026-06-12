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

`role` is the permission source of truth and must be one of `admin` or `member`.

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
- `stats`
- `snapshot`
- `rent`
- `updatedAt`
