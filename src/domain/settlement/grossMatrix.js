/**
 * Build gross matrix from expenses.
 * matrix[debtorId][creditorId] = amount
 *
 * Expense format (mock):
 * {
 *   id, date,
 *   payerId: "hung",
 *   debts: { thao: 100, thuy: 50 } // ONLY debtors (payer not included)
 * }
 */
export function buildGrossMatrix(memberIds, expenses = []) {
  const matrix = createZeroMatrix(memberIds);

  for (const ex of expenses) {
    const creditor = ex.payerId;
    const debts = ex.debts || {};

    for (const [debtor, amountRaw] of Object.entries(debts)) {
      const amount = toMoney(amountRaw);
      if (!amount || amount <= 0) continue;
      if (debtor === creditor) continue; // payer never owes himself

      if (!matrix[debtor]) continue;
      if (matrix[debtor][creditor] === undefined) continue;

      matrix[debtor][creditor] += amount;
    }
  }

  return matrix;
}

export function createZeroMatrix(memberIds) {
  const matrix = {};
  for (const r of memberIds) {
    matrix[r] = {};
    for (const c of memberIds) matrix[r][c] = 0;
  }
  return matrix;
}

export function toMoney(x) {
  const n = typeof x === "string" ? Number(x) : x;
  if (!Number.isFinite(n)) return 0;
  // round 2 decimals to avoid floating issues
  return Math.round(n * 100) / 100;
}
