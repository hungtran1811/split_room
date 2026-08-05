import { buildGrossMatrix } from "../settlement/grossMatrix";
import { computeNetBalances } from "../settlement/netBalance";
import { settleDebts } from "../settlement/settle";
import {
  normalizeWholeBalances,
  normalizeWholeMatrix,
  sumNumeric,
  toWholeVnd,
} from "../money/whole-vnd";

export type PaymentLike = {
  amount?: number;
  fromId?: string;
  toId?: string;
};

export type RosterMember = { id: string; name?: string };

export function applyPaymentsToBalances(
  balances: Record<string, number>,
  payments: PaymentLike[] = [],
): Record<string, number> {
  const next = { ...(balances || {}) };

  for (const payment of payments) {
    const amount = Number(payment?.amount || 0);
    const fromId = payment?.fromId;
    const toId = payment?.toId;

    if (!fromId || !toId || amount <= 0) continue;

    next[fromId] = Number(next[fromId] || 0) + amount;
    next[toId] = Number(next[toId] || 0) - amount;
  }

  return next;
}

export function buildSettleMatrix(
  memberIds: string[],
  settlementPlan: Array<{
    fromId?: string;
    toId?: string;
    from?: string;
    to?: string;
    debtorId?: string;
    creditorId?: string;
    amount?: number;
    amt?: number;
  }> = [],
): Record<string, Record<string, number>> {
  const matrix: Record<string, Record<string, number>> = {};

  for (const rowId of memberIds) {
    matrix[rowId] = {};
    for (const colId of memberIds) {
      matrix[rowId][colId] = 0;
    }
  }

  for (const item of settlementPlan) {
    const fromId = item?.fromId || item?.from || item?.debtorId;
    const toId = item?.toId || item?.to || item?.creditorId;
    const amount = toWholeVnd(item?.amount || item?.amt || 0);

    if (!fromId || !toId || amount <= 0) continue;
    if (!matrix[fromId] || matrix[fromId][toId] === undefined) continue;

    matrix[fromId][toId] = toWholeVnd(matrix[fromId][toId] + amount);
  }

  return matrix;
}

function buildWholeSettlementPlan(balances: Record<string, number> = {}) {
  return settleDebts(balances).map((item) => ({
    fromId: item.from,
    toId: item.to,
    amount: toWholeVnd(item.amount || 0),
  }));
}

function computeMatrixTotal(
  matrix: Record<string, Record<string, number>> = {},
  memberIds: string[] = [],
): number {
  return toWholeVnd(
    memberIds.reduce((sum, debtorId) => {
      return (
        sum +
        memberIds.reduce((rowSum, creditorId) => {
          if (debtorId === creditorId) return rowSum;
          return rowSum + Number(matrix?.[debtorId]?.[creditorId] || 0);
        }, 0)
      );
    }, 0),
  );
}

export function buildMonthlySettlementView({
  roster = [],
  expenses = [],
  payments = [],
}: {
  roster?: RosterMember[];
  expenses?: Array<{ payerId?: string; debts?: Record<string, number> }>;
  payments?: PaymentLike[];
}) {
  const memberIds = roster.map((member) => member.id);
  const rawGrossMatrix = buildGrossMatrix(memberIds, expenses);
  const grossMatrix = normalizeWholeMatrix(memberIds, rawGrossMatrix);
  const balancesBeforePayments = Object.fromEntries(
    Object.entries(computeNetBalances(memberIds, grossMatrix)).map(
      ([memberId, amount]) => [memberId, toWholeVnd(amount)],
    ),
  );
  const rawBalancesAfterPayments = applyPaymentsToBalances(
    balancesBeforePayments,
    payments,
  );
  const balances = normalizeWholeBalances(memberIds, rawBalancesAfterPayments);
  const settlementPlan = buildWholeSettlementPlan(balances);
  const settleMatrix = buildSettleMatrix(memberIds, settlementPlan);
  const paymentsAppliedTotal = toWholeVnd(
    sumNumeric((payments || []).map((payment) => payment?.amount || 0)),
  );

  return {
    grossMatrix,
    balancesBeforePayments,
    paymentsAppliedTotal,
    balances,
    settlementPlan,
    settleMatrix,
    totals: {
      grossDebtTotal: computeMatrixTotal(grossMatrix, memberIds),
      remainingDebtTotal: toWholeVnd(
        sumNumeric(settlementPlan.map((item) => item.amount)),
      ),
    },
  };
}
