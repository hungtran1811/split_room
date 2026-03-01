function sanitizeMoneyInput(value) {
  if (value === null || value === undefined) return 0;

  let text = String(value).trim();
  if (!text) return 0;

  text = text.replace(/[₫đ\s]/gi, "");

  if (text.includes(".") && text.includes(",")) {
    text = text.replaceAll(".", "").replace(",", ".");
  } else {
    if (text.includes(",")) text = text.replace(",", ".");
    const dots = (text.match(/\./g) || []).length;
    if (dots >= 2) text = text.replaceAll(".", "");
  }

  const number = Number(text);
  if (!Number.isFinite(number)) return 0;
  return Math.round(number);
}

export function clampNonNegative(value) {
  const number = Number(value || 0);
  return Number.isFinite(number) ? Math.max(0, number) : 0;
}

export function parseVndInt(value) {
  return sanitizeMoneyInput(value);
}

export function parseIntSafe(value) {
  const number = sanitizeMoneyInput(value);
  return Number.isFinite(number) ? number : 0;
}

export function sumValues(obj) {
  return Object.values(obj || {}).reduce((sum, value) => {
    return sum + Number(value || 0);
  }, 0);
}

export function buildEqualShares(total, ids) {
  const count = ids.length || 1;
  const base = Math.floor(total / count);
  let remainder = total - base * count;
  const shares = {};

  for (const id of ids) {
    shares[id] = base + (remainder > 0 ? 1 : 0);
    if (remainder > 0) remainder -= 1;
  }

  return shares;
}

export function computeRentCosts(items, meta, legacyFallback = null) {
  const headcount = clampNonNegative(meta?.headcount || 0);
  const legacyWater = Number(legacyFallback?.waterCost || 0);
  const legacyElectric = Number(legacyFallback?.electricCost || 0);

  const waterUnitPrice = clampNonNegative(meta?.water?.unitPrice || 0);
  const waterCost = waterUnitPrice ? waterUnitPrice * headcount : legacyWater;

  const oldKwh = clampNonNegative(meta?.electric?.oldKwh || 0);
  const newKwh = clampNonNegative(meta?.electric?.newKwh || 0);
  const electricUnitPrice = clampNonNegative(meta?.electric?.unitPrice || 0);
  const kwhUsed = electricUnitPrice ? Math.max(newKwh - oldKwh, 0) : 0;
  const electricCost = electricUnitPrice
    ? kwhUsed * electricUnitPrice
    : legacyElectric;

  return {
    waterCost,
    kwhUsed,
    electricCost,
    total: sumValues(items) + waterCost + electricCost,
  };
}

export function sanitizeRentPayload(period, payload, existingRent = null) {
  const hasFinalizedAt = Object.prototype.hasOwnProperty.call(
    payload || {},
    "finalizedAt",
  );
  const hasFinalizedBy = Object.prototype.hasOwnProperty.call(
    payload || {},
    "finalizedBy",
  );
  const hasStatus = Object.prototype.hasOwnProperty.call(payload || {}, "status");

  const items = {
    rent: clampNonNegative(payload?.items?.rent || 0),
    wifi: clampNonNegative(payload?.items?.wifi || 0),
    other: clampNonNegative(payload?.items?.other || 0),
  };

  const shares = Object.fromEntries(
    Object.entries(payload?.shares || {}).map(([memberId, amount]) => [
      memberId,
      clampNonNegative(amount),
    ]),
  );

  const paid = Object.fromEntries(
    Object.entries(payload?.paid || {}).map(([memberId, amount]) => [
      memberId,
      clampNonNegative(amount),
    ]),
  );

  return {
    ...existingRent,
    period,
    payerId: String(payload?.payerId || ""),
    items,
    total: clampNonNegative(payload?.total || 0),
    headcount: clampNonNegative(payload?.headcount || 0),
    water: {
      mode: payload?.water?.mode || "perPerson",
      unitPrice: clampNonNegative(payload?.water?.unitPrice || 0),
    },
    electric: {
      oldKwh: clampNonNegative(payload?.electric?.oldKwh || 0),
      newKwh: clampNonNegative(payload?.electric?.newKwh || 0),
      unitPrice: clampNonNegative(payload?.electric?.unitPrice || 0),
    },
    computed: {
      waterCost: clampNonNegative(payload?.computed?.waterCost || 0),
      kwhUsed: clampNonNegative(payload?.computed?.kwhUsed || 0),
      electricCost: clampNonNegative(payload?.computed?.electricCost || 0),
    },
    splitMode: payload?.splitMode === "custom" ? "custom" : "equal",
    shares,
    paid,
    note: String(payload?.note || "").trim(),
    status: hasStatus
      ? payload?.status === "finalized"
        ? "finalized"
        : "draft"
      : existingRent?.status === "finalized"
        ? "finalized"
        : "draft",
    finalizedAt: hasFinalizedAt
      ? payload?.finalizedAt ?? null
      : existingRent?.finalizedAt || null,
    finalizedBy: hasFinalizedBy
      ? payload?.finalizedBy ?? null
      : existingRent?.finalizedBy || null,
    createdBy: String(existingRent?.createdBy || payload?.createdBy || ""),
  };
}
