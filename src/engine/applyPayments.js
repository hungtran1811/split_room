/**
 * Apply payment events onto gross matrix.
 * payment: { fromId, toId, amount }
 *
 * Rule:
 * - reduce debtor->creditor
 * - if debtor->creditor is not enough, keep remainder as "overpay" by flipping
 *   (optional). For now: clamp to 0 and ignore extra.
 */
export function applyPaymentsToGross(grossMatrix, payments = []) {
  // deep clone matrix (avoid mutating original)
  const matrix = cloneMatrix(grossMatrix);

  for (const p of payments) {
    const from = p.fromId;
    const to = p.toId;
    const amount = toMoney(p.amount);
    if (!amount || amount <= 0) continue;

    if (!matrix[from] || matrix[from][to] === undefined) continue;

    const cur = matrix[from][to];
    const next = Math.max(0, round2(cur - amount));
    matrix[from][to] = next;
  }

  return matrix;
}

function cloneMatrix(m) {
  const out = {};
  for (const r of Object.keys(m || {})) {
    out[r] = {};
    for (const c of Object.keys(m[r] || {})) out[r][c] = m[r][c];
  }
  return out;
}

function toMoney(x) {
  const n = typeof x === "string" ? Number(x) : x;
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100) / 100;
}

function round2(n) {
  return Math.round(n * 100) / 100;
}
