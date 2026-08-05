import { toWholeVnd } from "../money/whole-vnd";

export type TopPayerExpense = {
  payerId?: string;
  amount?: number;
};

export type TopPayerRow = {
  payerId: string;
  total: number;
  count: number;
};

export function buildTopPayers(
  expenses: TopPayerExpense[] = [],
  options: { limit?: number } = {},
): TopPayerRow[] {
  const totals = new Map<string, { total: number; count: number }>();

  for (const expense of expenses) {
    const payerId = String(expense?.payerId || "").trim();
    const amount = toWholeVnd(expense?.amount);
    if (!payerId || amount <= 0) continue;

    const current = totals.get(payerId) || { total: 0, count: 0 };
    current.total += amount;
    current.count += 1;
    totals.set(payerId, current);
  }

  const rows = [...totals.entries()]
    .map(([payerId, value]) => ({
      payerId,
      total: toWholeVnd(value.total),
      count: value.count,
    }))
    .sort((a, b) => b.total - a.total || a.payerId.localeCompare(b.payerId));

  const limit = options.limit;
  if (typeof limit === "number" && limit >= 0) {
    return rows.slice(0, limit);
  }
  return rows;
}
