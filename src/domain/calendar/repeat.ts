import { DAY_MS } from "./tz";
import type { CalendarInterval } from "./types";

export const REPEAT_MAX = 14;

export type RepeatFreq = "none" | "day" | "week";

export function clampRepeatCount(value: unknown): number {
  const count = Math.floor(Number(value));
  if (!Number.isFinite(count) || count < 1) return 1;
  return Math.min(REPEAT_MAX, count);
}

export function repeatStepDays(freq: RepeatFreq): number {
  if (freq === "day") return 1;
  if (freq === "week") return 7;
  return 0;
}

/** Số lần tính cả lần ghi đầu. `none` hoặc 1 lần → chỉ bản gốc. */
export function expandRepeatOccurrences(
  interval: CalendarInterval,
  freq: RepeatFreq,
  count: unknown,
): CalendarInterval[] {
  const times = clampRepeatCount(count);
  const step = repeatStepDays(freq);
  if (!step || times === 1) return [{ startAt: interval.startAt, endAt: interval.endAt }];

  const duration = interval.endAt - interval.startAt;
  if (!(duration > 0)) return [];

  return Array.from({ length: times }, (_, index) => {
    const startAt = interval.startAt + index * step * DAY_MS;
    return { startAt, endAt: startAt + duration };
  });
}
