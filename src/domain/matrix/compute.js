import { buildGrossMatrix } from "../../engine/grossMatrix";
import { computeNetBalances } from "../../engine/netBalance";
import { settleDebts } from "../../engine/settle";

function roundMoney(value) {
  const parsed = Number(value || 0);
  if (!Number.isFinite(parsed)) return 0;
  return Math.round(parsed * 100) / 100;
}

export function applyPaymentsToBalances(balances, payments = []) {
  const next = { ...(balances || {}) };

  for (const payment of payments) {
    const amount = roundMoney(payment?.amount || 0);
    const fromId = payment?.fromId;
    const toId = payment?.toId;

    if (!fromId || !toId || amount <= 0) continue;

    next[fromId] = roundMoney((next[fromId] || 0) + amount);
    next[toId] = roundMoney((next[toId] || 0) - amount);
  }

  return next;
}

export function buildSettleMatrix(memberIds, settlementPlan = []) {
  const matrix = {};

  for (const rowId of memberIds) {
    matrix[rowId] = {};
    for (const colId of memberIds) {
      matrix[rowId][colId] = 0;
    }
  }

  for (const item of settlementPlan) {
    const fromId = item?.fromId || item?.from || item?.debtorId;
    const toId = item?.toId || item?.to || item?.creditorId;
    const amount = roundMoney(item?.amount || item?.amt || 0);

    if (!fromId || !toId || amount <= 0) continue;
    if (!matrix[fromId] || matrix[fromId][toId] === undefined) continue;

    matrix[fromId][toId] = roundMoney(matrix[fromId][toId] + amount);
  }

  return matrix;
}

export function buildMonthlySettlementView({
  roster = [],
  expenses = [],
  payments = [],
}) {
  const memberIds = roster.map((member) => member.id);
  const grossMatrix = buildGrossMatrix(memberIds, expenses);
  const rawBalances = computeNetBalances(memberIds, grossMatrix);
  const balances = applyPaymentsToBalances(rawBalances, payments);
  const settlementPlan = settleDebts(balances).map((item) => ({
    fromId: item.fromId || item.from || item.debtorId,
    toId: item.toId || item.to || item.creditorId,
    amount: roundMoney(item.amount || item.amt || 0),
  }));
  const settleMatrix = buildSettleMatrix(memberIds, settlementPlan);

  return {
    grossMatrix,
    balances: Object.fromEntries(
      Object.entries(balances).map(([memberId, value]) => [
        memberId,
        roundMoney(value),
      ]),
    ),
    settlementPlan,
    settleMatrix,
  };
}
