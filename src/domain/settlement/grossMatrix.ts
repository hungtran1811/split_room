export type DebtMatrix = Record<string, Record<string, number>>;

export function createZeroMatrix(memberIds: string[]): DebtMatrix {
  const matrix: DebtMatrix = {};
  for (const r of memberIds) {
    matrix[r] = {};
    for (const c of memberIds) matrix[r][c] = 0;
  }
  return matrix;
}

export function toMoney(x: unknown): number {
  const n = typeof x === "string" ? Number(x) : Number(x);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100) / 100;
}

export type ExpenseLike = {
  payerId?: string;
  debts?: Record<string, number>;
};

export function buildGrossMatrix(
  memberIds: string[],
  expenses: ExpenseLike[] = [],
): DebtMatrix {
  const matrix = createZeroMatrix(memberIds);

  for (const ex of expenses) {
    const creditor = ex.payerId;
    const debts = ex.debts || {};
    if (!creditor) continue;

    for (const [debtor, amountRaw] of Object.entries(debts)) {
      const amount = toMoney(amountRaw);
      if (!amount || amount <= 0) continue;
      if (debtor === creditor) continue;

      if (!matrix[debtor]) continue;
      if (matrix[debtor][creditor] === undefined) continue;

      matrix[debtor][creditor] += amount;
    }
  }

  return matrix;
}
