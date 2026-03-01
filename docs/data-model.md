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
