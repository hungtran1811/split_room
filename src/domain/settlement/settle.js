/**
 * From balances -> minimal settlement list:
 * [{ from, to, amount }]
 *
 * balances:
 *  + : should receive
 *  - : should pay
 */
export function settleDebts(balances) {
  const creditors = [];
  const debtors = [];

  for (const [id, bal] of Object.entries(balances || {})) {
    const b = round2(bal);
    if (b > 0) creditors.push({ id, amt: b });
    else if (b < 0) debtors.push({ id, amt: -b }); // store positive needed to pay
  }

  // optional: sort to keep stable output (largest first)
  creditors.sort((a, b) => b.amt - a.amt);
  debtors.sort((a, b) => b.amt - a.amt);

  const result = [];
  let i = 0,
    j = 0;

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

function round2(n) {
  return Math.round(n * 100) / 100;
}
