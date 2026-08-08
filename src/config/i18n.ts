const VND_SUFFIX = "\u00A0đ";

export function formatVND(amount: number | null | undefined): string {
  if (amount === null || amount === undefined) return `0${VND_SUFFIX}`;

  const number = Math.round(Number(amount));
  if (!Number.isFinite(number)) return `0${VND_SUFFIX}`;

  return (
    number.toLocaleString("vi-VN", {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }) + VND_SUFFIX
  );
}
