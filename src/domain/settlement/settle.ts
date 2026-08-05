function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export type SettleItem = {
  from: string;
  to: string;
  amount: number;
};

/**
 * balances: + receive, - pay
 */
export function settleDebts(
  balances: Record<string, number> | null | undefined,
): SettleItem[] {
  const creditors: { id: string; amt: number }[] = [];
  const debtors: { id: string; amt: number }[] = [];

  for (const [id, bal] of Object.entries(balances || {})) {
    const b = round2(bal);
    if (b > 0) creditors.push({ id, amt: b });
    else if (b < 0) debtors.push({ id, amt: -b });
  }

  creditors.sort((a, b) => b.amt - a.amt);
  debtors.sort((a, b) => b.amt - a.amt);

  const result: SettleItem[] = [];
  let i = 0;
  let j = 0;

  while (i < debtors.length && j < creditors.length) {
    const d = debtors[i];
    const c = creditors[j];

    const pay = round2(Math.min(d.amt, c.amt));
    if (pay > 0) {
      result.push({ from: d.id, to: c.id, amount: pay });
      d.amt = round2(d.amt - pay);
      c.amt = round2(c.amt - pay);
    }

    if (d.amt <= 0.0001) i++;
    if (c.amt <= 0.0001) j++;
  }

  return result;
}
