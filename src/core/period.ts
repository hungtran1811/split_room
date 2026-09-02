export function getMonthRange(period: string): { start: string; end: string } {
  const [year, month] = String(period || "").split("-").map(Number);
  const start = `${String(year).padStart(4, "0")}-${String(month).padStart(
    2,
    "0",
  )}-01`;
  const next = new Date(year, month - 1, 1);
  next.setMonth(next.getMonth() + 1);

  return {
    start,
    end: `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(
      2,
      "0",
    )}-01`,
  };
}

export function lastDayOfPeriod(period: string): string {
  const [year, month] = String(period || "").split("-").map(Number);
  if (!year || !month) return "";
  const day = String(new Date(year, month, 0).getDate()).padStart(2, "0");
  return `${year}-${String(month).padStart(2, "0")}-${day}`;
}

export function todayYmd(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(
    now.getDate(),
  ).padStart(2, "0")}`;
}

export function currentPeriod(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

export function comparePeriod(left: string, right: string): number {
  return String(left).localeCompare(String(right));
}

export function isCurrentPeriod(period: string): boolean {
  return period === currentPeriod();
}

/** Khi mở app, bỏ tháng cũ lưu trong localStorage và chuyển sang tháng hiện tại. */
export function resolveActivePeriod(stored: string): string {
  const fallback = currentPeriod();
  if (!stored || !/^\d{4}-\d{2}$/.test(stored)) return fallback;
  return comparePeriod(stored, fallback) < 0 ? fallback : stored;
}

/** Ngày mặc định khi thêm khoản chi: hôm nay nếu tháng hiện tại, ngày cuối tháng nếu xem tháng cũ. */
export function defaultExpenseDateForPeriod(period: string): string {
  if (isCurrentPeriod(period)) return todayYmd();
  return lastDayOfPeriod(period);
}

/** Ngày mặc định khi lọc danh sách chi tiêu. */
export function defaultViewDateForPeriod(period: string): string {
  return defaultExpenseDateForPeriod(period);
}

export function shiftPeriod(period: string, delta: number): string {
  const [year, month] = String(period || "").split("-").map(Number);
  const date = new Date(year, month - 1 + delta, 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

export function periodStorageKey(groupId: string): string {
  return `splitroom.period.${groupId}`;
}
