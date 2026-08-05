import { buildMonthlySettlementView, applyPaymentsToBalances } from "../matrix/compute";
import { toWholeVnd } from "../money/whole-vnd";

export { applyPaymentsToBalances };

function roundVnd(value: unknown): number {
  return toWholeVnd(value);
}

function sumAmounts(items: Array<Record<string, unknown>>, field: string): number {
  return (items || []).reduce((sum, item) => {
    return sum + Number(item?.[field] || 0);
  }, 0);
}

function buildRentSummary(rent: Record<string, unknown> | null) {
  if (!rent) return null;

  const payerId = String(rent.payerId || "hung");
  const shares = { ...((rent.shares as Record<string, number>) || {}) };
  const paid = { ...((rent.paid as Record<string, number>) || {}) };
  const total = roundVnd(rent.total || 0);

  const collected = Object.entries(paid).reduce((sum, [memberId, value]) => {
    if (memberId === payerId) return sum;
    return sum + roundVnd(value);
  }, 0);

  const remaining = Object.entries(shares).reduce((sum, [memberId, value]) => {
    if (memberId === payerId) return sum;

    const share = roundVnd(value);
    const paidValue = roundVnd(paid[memberId] || 0);
    return sum + Math.max(share - paidValue, 0);
  }, 0);

  return {
    payerId,
    total,
    collected,
    remaining,
    shares,
    paid,
    note: String(rent.note || ""),
    updatedAt: rent.updatedAt || null,
  };
}

function buildMemberSummaries(
  roster: Array<{ id: string; name?: string }>,
  balances: Record<string, number>,
  rentSummary: ReturnType<typeof buildRentSummary>,
) {
  return (roster || []).map((member) => {
    const memberId = member.id;
    const rentShare = roundVnd(rentSummary?.shares?.[memberId] || 0);
    const rentPaid = roundVnd(rentSummary?.paid?.[memberId] || 0);
    const rentRemaining =
      memberId === rentSummary?.payerId
        ? 0
        : Math.max(rentShare - rentPaid, 0);

    return {
      memberId,
      name: member.name,
      netBalance: roundVnd(balances?.[memberId] || 0),
      rentShare,
      rentPaid,
      rentRemaining,
    };
  });
}

export function buildMonthlyReport({
  period,
  roster,
  expenses = [],
  payments = [],
  rent = null,
}: {
  period: string;
  roster: Array<{ id: string; name?: string }>;
  expenses?: Array<Record<string, unknown>>;
  payments?: Array<Record<string, unknown>>;
  rent?: Record<string, unknown> | null;
}) {
  const settlementView = buildMonthlySettlementView({
    roster,
    expenses: expenses as Array<{ payerId?: string; debts?: Record<string, number> }>,
    payments: payments as Array<{ amount?: number; fromId?: string; toId?: string }>,
  });
  const rentSummary = buildRentSummary(rent);
  const memberSummaries = buildMemberSummaries(
    roster,
    settlementView.balances,
    rentSummary,
  );

  return {
    period,
    stats: {
      expenseCount: expenses.length,
      paymentCount: payments.length,
      expenseTotal: roundVnd(sumAmounts(expenses, "amount")),
      paymentTotal: roundVnd(sumAmounts(payments, "amount")),
      rentTotal: roundVnd(rentSummary?.total || 0),
      settlementCount: settlementView.settlementPlan.length,
    },
    balances: settlementView.balances,
    settlementPlan: settlementView.settlementPlan,
    rentSummary,
    memberSummaries,
  };
}
