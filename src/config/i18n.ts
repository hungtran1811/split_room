const VND_SUFFIX = "\u00A0đ";

type FormatCompactVNDOptions = {
  showPositiveSign?: boolean;
};

function normalizeVND(amount: number | null | undefined): number {
  if (amount === null || amount === undefined) return 0;

  const number = Math.round(Number(amount));
  return Number.isFinite(number) ? number : 0;
}

function withOptionalPositiveSign(value: string, amount: number, showPositiveSign: boolean): string {
  return showPositiveSign && amount > 0 ? `+${value}` : value;
}

export function formatVND(amount: number | null | undefined): string {
  const number = normalizeVND(amount);

  return (
    number.toLocaleString("vi-VN", {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }) + VND_SUFFIX
  );
}

export function formatCompactVND(
  amount: number | null | undefined,
  { showPositiveSign = false }: FormatCompactVNDOptions = {},
): string {
  const number = normalizeVND(amount);
  const absoluteNumber = Math.abs(number);

  if (absoluteNumber < 1_000_000) {
    return withOptionalPositiveSign(formatVND(number), number, showPositiveSign);
  }

  const divisor = absoluteNumber >= 1_000_000_000 ? 1_000_000_000 : 1_000_000;
  const suffix = divisor === 1_000_000_000 ? "tỷ" : "tr";
  const compactNumber = (number / divisor).toLocaleString("vi-VN", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });

  return withOptionalPositiveSign(`${compactNumber}\u00A0${suffix}`, number, showPositiveSign);
}
