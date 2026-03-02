export function parseVndInput(value) {
  if (value === null || value === undefined) return 0;

  let normalized = String(value).trim();
  if (!normalized) return 0;

  normalized = normalized.replace(/[₫đ\s]/gi, "");

  if (normalized.includes(".") && normalized.includes(",")) {
    normalized = normalized.replaceAll(".", "").replace(",", ".");
  } else {
    if (normalized.includes(",")) normalized = normalized.replace(",", ".");

    const dots = (normalized.match(/\./g) || []).length;
    if (dots >= 2) {
      normalized = normalized.replaceAll(".", "");
    }
  }

  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}
