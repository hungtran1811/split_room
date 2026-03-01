/**
 * @typedef {"admin" | "member"} MemberRole
 */

/**
 * @typedef {Object} MemberProfile
 * @property {string} uid
 * @property {string} email
 * @property {string} displayName
 * @property {string} photoURL
 * @property {string} memberId
 * @property {MemberRole} role
 */

/**
 * @typedef {Object} ExpenseDoc
 * @property {string} id
 * @property {string} date
 * @property {number} amount
 * @property {string} payerId
 * @property {Record<string, number>} debts
 * @property {string=} note
 * @property {string=} createdBy
 */

/**
 * @typedef {Object} PaymentDoc
 * @property {string} id
 * @property {string} date
 * @property {string} fromId
 * @property {string} toId
 * @property {number} amount
 * @property {string=} note
 * @property {string=} createdBy
 */

/**
 * @typedef {Object} RentDoc
 * @property {string} period
 * @property {string} payerId
 * @property {Record<string, number>} items
 * @property {number} total
 * @property {number} headcount
 * @property {Record<string, number|string>} water
 * @property {Record<string, number>} electric
 * @property {Record<string, number>} computed
 * @property {"equal" | "custom"} splitMode
 * @property {Record<string, number>} shares
 * @property {Record<string, number>} paid
 * @property {string=} note
 * @property {"draft" | "finalized"=} status
 * @property {string=} createdBy
 */

/**
 * @typedef {Object} PeriodSnapshot
 * @property {string} period
 * @property {boolean=} lockedSoft
 * @property {string=} lockedBy
 * @property {Object=} snapshot
 * @property {RentDoc=} rent
 */

/**
 * @typedef {Object} PermissionState
 * @property {boolean} isAdmin
 * @property {MemberProfile | null} memberProfile
 */

export {};
