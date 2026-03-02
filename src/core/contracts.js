/**
 * @typedef {"owner" | "admin" | "member"} MemberRole
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
 * @property {boolean} isOwner
 * @property {boolean} canOperateMonth
 * @property {MemberProfile | null} memberProfile
 */

/**
 * @typedef {Object} MonthlyReportStats
 * @property {number} expenseCount
 * @property {number} paymentCount
 * @property {number} expenseTotal
 * @property {number} paymentTotal
 * @property {number} rentTotal
 * @property {number} settlementCount
 */

/**
 * @typedef {Object} MonthlyReportMemberSummary
 * @property {string} memberId
 * @property {string} name
 * @property {number} netBalance
 * @property {number} rentShare
 * @property {number} rentPaid
 * @property {number} rentRemaining
 */

/**
 * @typedef {Object} MonthlyReportSettlement
 * @property {string} fromId
 * @property {string} toId
 * @property {number} amount
 */

/**
 * @typedef {Object} MonthlyReportRentSummary
 * @property {string} payerId
 * @property {number} total
 * @property {number} collected
 * @property {number} remaining
 * @property {Record<string, number>} shares
 * @property {Record<string, number>} paid
 * @property {string=} note
 * @property {unknown=} updatedAt
 */

/**
 * @typedef {Object} MonthlyReport
 * @property {string} period
 * @property {MonthlyReportStats} stats
 * @property {Record<string, number>} balances
 * @property {MonthlyReportSettlement[]} settlementPlan
 * @property {MonthlyReportRentSummary | null} rentSummary
 * @property {MonthlyReportMemberSummary[]} memberSummaries
 * @property {{ source: "live" | "snapshot", snapshotAt?: unknown, snapshotBy?: string, reportVersion?: number, createdAt?: unknown, updatedAt?: unknown }} meta
 */

/**
 * @typedef {MonthlyReport} MonthlyReportSnapshot
 */

/**
 * @typedef {Object} PeriodSummary
 * @property {string} period
 * @property {unknown=} snapshotAt
 * @property {string=} snapshotBy
 * @property {unknown=} updatedAt
 * @property {MonthlyReportStats} stats
 */

/**
 * @typedef {Object} AdminMemberDiagnostic
 * @property {string} code
 * @property {string} label
 */

/**
 * @typedef {Object} AdminCurrentPeriodStatus
 * @property {boolean} rentExists
 * @property {boolean} reportSnapshotExists
 */

/**
 * @typedef {Object} AdminOverview
 * @property {string} groupId
 * @property {MemberProfile | null} owner
 * @property {MemberProfile | null} backupAdmin
 * @property {number} memberCount
 * @property {{
 *   missingMemberId: MemberProfile[],
 *   legacyRoles: MemberProfile[],
 *   emailMapMismatch: MemberProfile[],
 *   unknownRosterMembers: MemberProfile[]
 * }} diagnostics
 * @property {AdminCurrentPeriodStatus} currentPeriodStatus
 */

/**
 * @typedef {Object} SettlementLine
 * @property {string} fromId
 * @property {string} toId
 * @property {number} amount
 */

/**
 * @typedef {Object} MonthlySettlementView
 * @property {Record<string, Record<string, number>>} grossMatrix
 * @property {Record<string, number>} balances
 * @property {SettlementLine[]} settlementPlan
 * @property {Record<string, Record<string, number>>} settleMatrix
 */

/**
 * @typedef {Object} PaymentsPageState
 * @property {string} period
 * @property {boolean} loading
 * @property {boolean} saving
 * @property {string | null} editingPaymentId
 */

/**
 * @typedef {Object} MatrixPageState
 * @property {string} period
 * @property {boolean} loading
 * @property {number} expenseCount
 * @property {number} paymentCount
 */

export {};
