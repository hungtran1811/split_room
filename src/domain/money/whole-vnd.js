export function toWholeVnd(value) {
  const parsed = Number(value || 0);
  if (!Number.isFinite(parsed)) return 0;
  return Math.round(parsed);
}

export function sumNumeric(values = []) {
  return values.reduce((sum, value) => sum + Number(value || 0), 0);
}

export function allocateWholeAmounts(entries = [], targetTotal = null) {
  const prepared = entries
    .map((entry, index) => ({
      id: entry?.id,
      amount: Math.max(0, Number(entry?.amount || 0)),
      index,
    }))
    .filter((entry) => entry.id);

  if (!prepared.length) return {};

  const rawTotal = sumNumeric(prepared.map((entry) => entry.amount));
  const desiredTotal =
    targetTotal === null ? toWholeVnd(rawTotal) : Math.max(0, toWholeVnd(targetTotal));

  const allocations = {};
  let floorTotal = 0;

  for (const entry of prepared) {
    const floorValue = Math.floor(entry.amount);
    allocations[entry.id] = floorValue;
    floorTotal += floorValue;
  }

  let remainder = Math.max(0, desiredTotal - floorTotal);
  const ranked = [...prepared].sort((left, right) => {
    const diff =
      right.amount - Math.floor(right.amount) - (left.amount - Math.floor(left.amount));
    if (Math.abs(diff) > Number.EPSILON) return diff;
    return left.index - right.index;
  });

  for (let index = 0; remainder > 0 && index < ranked.length; index += 1) {
    allocations[ranked[index].id] += 1;
    remainder -= 1;
  }

  return allocations;
}

export function buildWholeEqualShares(total, ids = []) {
  const memberIds = [...ids];
  if (!memberIds.length) return {};

  const wholeTotal = Math.max(0, toWholeVnd(total));
  const base = Math.floor(wholeTotal / memberIds.length);
  let remainder = wholeTotal - base * memberIds.length;
  const shares = {};

  for (const memberId of memberIds) {
    shares[memberId] = base + (remainder > 0 ? 1 : 0);
    if (remainder > 0) remainder -= 1;
  }

  return shares;
}

export function normalizeWholeBalances(memberIds = [], balances = {}) {
  const result = Object.fromEntries(memberIds.map((memberId) => [memberId, 0]));
  const positives = [];
  const negatives = [];

  for (const memberId of memberIds) {
    const amount = Number(balances?.[memberId] || 0);
    if (amount > 0) positives.push({ id: memberId, amount });
    else if (amount < 0) negatives.push({ id: memberId, amount: Math.abs(amount) });
  }

  const positiveTotal = sumNumeric(positives.map((entry) => entry.amount));
  const negativeTotal = sumNumeric(negatives.map((entry) => entry.amount));
  const targetTotal = toWholeVnd((positiveTotal + negativeTotal) / 2);
  const positiveAllocations = allocateWholeAmounts(positives, targetTotal);
  const negativeAllocations = allocateWholeAmounts(negatives, targetTotal);

  for (const [memberId, amount] of Object.entries(positiveAllocations)) {
    result[memberId] = amount;
  }

  for (const [memberId, amount] of Object.entries(negativeAllocations)) {
    result[memberId] = -amount;
  }

  return result;
}

export function normalizeWholeMatrix(memberIds = [], matrix = {}) {
  const normalized = {};

  for (const debtorId of memberIds) {
    normalized[debtorId] = {};

    for (const creditorId of memberIds) {
      normalized[debtorId][creditorId] = 0;
    }

    const rowEntries = memberIds
      .filter((creditorId) => creditorId !== debtorId)
      .map((creditorId) => ({
        id: creditorId,
        amount: Number(matrix?.[debtorId]?.[creditorId] || 0),
      }))
      .filter((entry) => entry.amount > 0);

    const rowTotal = sumNumeric(rowEntries.map((entry) => entry.amount));
    const allocations = allocateWholeAmounts(rowEntries, rowTotal);

    for (const creditorId of memberIds) {
      if (creditorId === debtorId) continue;
      normalized[debtorId][creditorId] = allocations[creditorId] || 0;
    }
  }

  return normalized;
}
