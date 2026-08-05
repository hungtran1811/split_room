import type { DebtMatrix } from "./grossMatrix";

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function computeNetBalances(
  memberIds: string[],
  grossMatrix: DebtMatrix,
): Record<string, number> {
  const balance: Record<string, number> = {};
  for (const id of memberIds) balance[id] = 0;

  for (const debtor of memberIds) {
    for (const creditor of memberIds) {
      const amt = grossMatrix?.[debtor]?.[creditor] || 0;
      if (!amt) continue;

      balance[debtor] -= amt;
      balance[creditor] += amt;
    }
  }

  for (const id of memberIds) balance[id] = round2(balance[id]);

  return balance;
}
