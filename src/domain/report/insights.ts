import { getMonthRange } from "../../core/period";
import { toWholeVnd } from "../money/whole-vnd";

export type InsightExpense = {
  id?: string;
  date?: string;
  amount?: number;
  payerId?: string;
  note?: string;
};

export type DailySpendRow = {
  date: string;
  total: number;
  count: number;
};

export type LargestExpenseRow = {
  id: string;
  date: string;
  amount: number;
  payerId: string;
  note: string;
};

export type MonthCompareResult = {
  currentPeriod: string;
  previousPeriod: string;
  currentTotal: number;
  previousTotal: number;
  currentCount: number;
  previousCount: number;
  deltaTotal: number;
  deltaPct: number | null;
};

export type RentCollectionRow = {
  memberId: string;
  share: number;
  paid: number;
  due: number;
};

export type RentCollectionInsight = {
  payerId: string;
  total: number;
  collected: number;
  remaining: number;
  rows: RentCollectionRow[];
};

function sumExpenseAmounts(expenses: InsightExpense[]): number {
  return toWholeVnd(
    (expenses || []).reduce((sum, item) => sum + toWholeVnd(item?.amount), 0),
  );
}

export function buildDailySpend(
  expenses: InsightExpense[] = [],
  period: string,
): DailySpendRow[] {
  const { start, end } = getMonthRange(period);
  const byDate = new Map<string, { total: number; count: number }>();

  for (const expense of expenses) {
    const date = String(expense?.date || "").trim();
    const amount = toWholeVnd(expense?.amount);
    if (!date || amount <= 0) continue;
    if (date < start || date >= end) continue;

    const current = byDate.get(date) || { total: 0, count: 0 };
    current.total += amount;
    current.count += 1;
    byDate.set(date, current);
  }

  return [...byDate.entries()]
    .map(([date, value]) => ({
      date,
      total: toWholeVnd(value.total),
      count: value.count,
    }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

export function buildLargestExpenses(
  expenses: InsightExpense[] = [],
  options: { limit?: number } = {},
): LargestExpenseRow[] {
  const rows = (expenses || [])
    .map((expense, index) => ({
      id: String(expense?.id || `expense-${index}`),
      date: String(expense?.date || ""),
      amount: toWholeVnd(expense?.amount),
      payerId: String(expense?.payerId || "").trim(),
      note: String(expense?.note || "").trim(),
    }))
    .filter((row) => row.amount > 0 && row.payerId)
    .sort(
      (a, b) =>
        b.amount - a.amount ||
        b.date.localeCompare(a.date) ||
        a.id.localeCompare(b.id),
    );

  const limit = options.limit;
  if (typeof limit === "number" && limit >= 0) {
    return rows.slice(0, limit);
  }
  return rows;
}

export function buildMonthCompare(
  currentExpenses: InsightExpense[] = [],
  previousExpenses: InsightExpense[] = [],
  currentPeriod: string,
  previousPeriod: string,
): MonthCompareResult {
  const currentTotal = sumExpenseAmounts(currentExpenses);
  const previousTotal = sumExpenseAmounts(previousExpenses);
  const currentCount = (currentExpenses || []).filter(
    (item) => toWholeVnd(item?.amount) > 0,
  ).length;
  const previousCount = (previousExpenses || []).filter(
    (item) => toWholeVnd(item?.amount) > 0,
  ).length;
  const deltaTotal = currentTotal - previousTotal;
  const deltaPct =
    previousTotal > 0 ? Math.round((deltaTotal / previousTotal) * 100) : null;

  return {
    currentPeriod,
    previousPeriod,
    currentTotal,
    previousTotal,
    currentCount,
    previousCount,
    deltaTotal,
    deltaPct,
  };
}

export function buildRentCollectionInsight(
  rent: Record<string, unknown> | null | undefined,
): RentCollectionInsight | null {
  if (!rent) return null;

  const payerId = String(rent.payerId || "").trim() || "hung";
  const shares = { ...((rent.shares as Record<string, number>) || {}) };
  const paidMap = { ...((rent.paid as Record<string, number>) || {}) };
  const total = toWholeVnd(rent.total || 0);
  const memberIds = [
    ...new Set([...Object.keys(shares), ...Object.keys(paidMap), payerId]),
  ].filter(Boolean);

  const rows: RentCollectionRow[] = memberIds
    .map((memberId) => {
      const share = toWholeVnd(shares[memberId] || 0);
      const paid = toWholeVnd(paidMap[memberId] || 0);
      const due = memberId === payerId ? 0 : Math.max(share - paid, 0);
      return { memberId, share, paid, due };
    })
    .sort((a, b) => b.due - a.due || a.memberId.localeCompare(b.memberId));

  const collected = rows.reduce((sum, row) => {
    if (row.memberId === payerId) return sum;
    return sum + row.paid;
  }, 0);
  const remaining = rows.reduce((sum, row) => sum + row.due, 0);

  return {
    payerId,
    total,
    collected: toWholeVnd(collected),
    remaining: toWholeVnd(remaining),
    rows,
  };
}
