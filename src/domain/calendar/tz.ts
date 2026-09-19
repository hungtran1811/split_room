/** Múi giờ lịch nhóm — Việt Nam không dùng DST, offset cố định +07:00. */
export const CALENDAR_TZ = "Asia/Ho_Chi_Minh";
export const VN_OFFSET_MS = 7 * 60 * 60 * 1000;
export const DAY_MS = 24 * 60 * 60 * 1000;
export const WEEK_MS = 7 * DAY_MS;

export const WEEKDAY_SHORT_VI = ["T2", "T3", "T4", "T5", "T6", "T7", "CN"] as const;
export const WEEKDAY_LONG_VI = [
  "Thứ Hai",
  "Thứ Ba",
  "Thứ Tư",
  "Thứ Năm",
  "Thứ Sáu",
  "Thứ Bảy",
  "Chủ nhật",
] as const;

export type YmdParts = {
  year: number;
  month: number;
  day: number;
};

export type VnDateTimeParts = YmdParts & {
  hour: number;
  minute: number;
};

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

export function formatYmd(year: number, month: number, day: number): string {
  return `${String(year).padStart(4, "0")}-${pad2(month)}-${pad2(day)}`;
}

export function parseYmd(ymd: string): YmdParts | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(ymd || "").trim());
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (!year || month < 1 || month > 12 || day < 1 || day > 31) return null;
  const probe = new Date(Date.UTC(year, month - 1, day));
  if (
    probe.getUTCFullYear() !== year ||
    probe.getUTCMonth() !== month - 1 ||
    probe.getUTCDate() !== day
  ) {
    return null;
  }
  return { year, month, day };
}

export function addDaysYmd(ymd: string, delta: number): string {
  const parts = parseYmd(ymd);
  if (!parts) return ymd;
  const next = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + delta));
  return formatYmd(next.getUTCFullYear(), next.getUTCMonth() + 1, next.getUTCDate());
}

/** UTC weekday of a civil calendar date (0 = Sunday). Independent of browser TZ. */
export function weekdayUtcOfYmd(ymd: string): number {
  const parts = parseYmd(ymd);
  if (!parts) return 0;
  return new Date(Date.UTC(parts.year, parts.month - 1, parts.day)).getUTCDay();
}

/** 0 = Monday … 6 = Sunday for a civil date. */
export function mondayIndexOfYmd(ymd: string): number {
  return (weekdayUtcOfYmd(ymd) + 6) % 7;
}

export function vnWallTimeToUtcMs(
  year: number,
  month: number,
  day: number,
  hour = 0,
  minute = 0,
): number {
  return Date.UTC(year, month - 1, day, hour, minute) - VN_OFFSET_MS;
}

export function ymdStartMs(ymd: string): number {
  const parts = parseYmd(ymd);
  if (!parts) return NaN;
  return vnWallTimeToUtcMs(parts.year, parts.month, parts.day, 0, 0);
}

export function utcMsToVnParts(ms: number): VnDateTimeParts {
  const shifted = new Date(ms + VN_OFFSET_MS);
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
    hour: shifted.getUTCHours(),
    minute: shifted.getUTCMinutes(),
  };
}

export function ymdInTz(ms: number): string {
  const parts = utcMsToVnParts(ms);
  return formatYmd(parts.year, parts.month, parts.day);
}

export function formatHm(hour: number, minute: number): string {
  return `${pad2(hour)}:${pad2(minute)}`;
}

export function formatHmFromMs(ms: number): string {
  const parts = utcMsToVnParts(ms);
  return formatHm(parts.hour, parts.minute);
}

/** `YYYY-MM-DDTHH:mm` wall time in Vietnam. */
export function msToVnDateTimeLocal(ms: number): string {
  const parts = utcMsToVnParts(ms);
  return `${formatYmd(parts.year, parts.month, parts.day)}T${formatHm(parts.hour, parts.minute)}`;
}

export function vnDateTimeLocalToMs(value: string): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(String(value || "").trim());
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  if (month < 1 || month > 12 || day < 1 || day > 31 || hour > 23 || minute > 59) return null;
  if (!parseYmd(formatYmd(year, month, day))) return null;
  return vnWallTimeToUtcMs(year, month, day, hour, minute);
}

export function formatTimeRange(startAt: number, endAt: number, dayEndMs?: number): string {
  const start = formatHmFromMs(startAt);
  const end = dayEndMs !== undefined && endAt === dayEndMs ? "24:00" : formatHmFromMs(endAt);
  return `${start}–${end}`;
}

export function todayYmdVn(now: number = Date.now()): string {
  return ymdInTz(now);
}
