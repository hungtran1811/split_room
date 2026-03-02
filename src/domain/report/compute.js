import { buildGrossMatrix } from "../../engine/grossMatrix";
import { computeNetBalances } from "../../engine/netBalance";
import { computeSettlementPlan } from "../settlement/compute";

function roundVnd(value) {
  return Math.round(Number(value || 0));
}

function sumAmounts(items, field) {
  return (items || []).reduce((sum, item) => {
    return sum + Number(item?.[field] || 0);
  }, 0);
}

export function applyPaymentsToBalances(balances, payments = []) {
  const next = { ...balances };

  for (const payment of payments) {
    const amount = Number(payment?.amount || 0);
    const fromId = payment?.fromId;
    const toId = payment?.toId;

    if (!fromId || !toId || amount <= 0) continue;

    next[fromId] = roundVnd((next[fromId] || 0) + amount);
    next[toId] = roundVnd((next[toId] || 0) - amount);
  }

  return next;
}

function buildRentSummary(rent) {
  if (!rent) return null;

  const payerId = rent.payerId || "hung";
  const shares = { ...(rent.shares || {}) };
  const paid = { ...(rent.paid || {}) };
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
    note: rent.note || "",
    updatedAt: rent.updatedAt || null,
  };
}

function buildMemberSummaries(roster, balances, rentSummary) {
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
}) {
  const memberIds = (roster || []).map((member) => member.id);
  const gross = buildGrossMatrix(memberIds, expenses);
  const rawBalances = computeNetBalances(memberIds, gross);
  const balances = applyPaymentsToBalances(rawBalances, payments);
  const settlementPlan = computeSettlementPlan(balances).map((item) => ({
    ...item,
    amount: roundVnd(item.amount),
  }));
  const rentSummary = buildRentSummary(rent);
  const memberSummaries = buildMemberSummaries(roster, balances, rentSummary);

  return {
    period,
    stats: {
      expenseCount: expenses.length,
      paymentCount: payments.length,
      expenseTotal: roundVnd(sumAmounts(expenses, "amount")),
      paymentTotal: roundVnd(sumAmounts(payments, "amount")),
      rentTotal: roundVnd(rentSummary?.total || 0),
      settlementCount: settlementPlan.length,
    },
    balances: Object.fromEntries(
      Object.entries(balances).map(([memberId, value]) => [
        memberId,
        roundVnd(value),
      ]),
    ),
    settlementPlan,
    rentSummary,
    memberSummaries,
  };
}
