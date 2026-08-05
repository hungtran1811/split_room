function sanitizeMoneyInput(value: unknown): number {
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

export function clampNonNegative(value: unknown): number {
  const number = Number(value || 0);
  return Number.isFinite(number) ? Math.max(0, number) : 0;
}

export function parseVndInt(value: unknown): number {
  return sanitizeMoneyInput(value);
}

export function parseIntSafe(value: unknown): number {
  const number = sanitizeMoneyInput(value);
  return Number.isFinite(number) ? number : 0;
}

export function sumValues(obj: Record<string, unknown> | null | undefined): number {
  return Object.values(obj || {}).reduce<number>((sum, value) => {
    return sum + Number(value || 0);
  }, 0);
}

export function buildEqualShares(total: number, ids: string[]): Record<string, number> {
  const count = ids.length || 1;
  const base = Math.floor(total / count);
  let remainder = total - base * count;
  const shares: Record<string, number> = {};

  for (const id of ids) {
    shares[id] = base + (remainder > 0 ? 1 : 0);
    if (remainder > 0) remainder -= 1;
  }

  return shares;
}

export type RentMeta = {
  headcount?: number;
  water?: { unitPrice?: number; mode?: string };
  electric?: { oldKwh?: number; newKwh?: number; unitPrice?: number };
};

export function computeRentCosts(
  items: Record<string, number>,
  meta: RentMeta,
  legacyFallback: { waterCost?: number; electricCost?: number } | null = null,
) {
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

export type RentPayload = {
  payerId?: string;
  items?: { rent?: number; wifi?: number; other?: number };
  total?: number;
  headcount?: number;
  water?: { mode?: string; unitPrice?: number };
  electric?: { oldKwh?: number; newKwh?: number; unitPrice?: number };
  computed?: { waterCost?: number; kwhUsed?: number; electricCost?: number };
  splitMode?: string;
  shares?: Record<string, number>;
  paid?: Record<string, number>;
  note?: string;
  createdBy?: string;
  createdAt?: unknown;
};

export function sanitizeRentPayload(
  period: string,
  payload: RentPayload,
  existingRent: RentPayload | null = null,
) {
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
    createdBy: String(existingRent?.createdBy || payload?.createdBy || ""),
  };
}
