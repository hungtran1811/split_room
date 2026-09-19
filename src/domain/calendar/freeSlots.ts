import { DAY_MS } from "./tz";
import type { WeekDay } from "./week";
import type { CalendarEntry, FreeSlot } from "./types";

type Interval = { startAt: number; endAt: number };

function clipToDay(entry: CalendarEntry, day: WeekDay): Interval | null {
  const startAt = Math.max(entry.startAt, day.startMs);
  const endAt = Math.min(entry.endAt, day.endMs);
  if (endAt <= startAt) return null;
  return { startAt, endAt };
}

export function mergeBusyIntervals(intervals: Interval[]): Interval[] {
  if (!intervals.length) return [];
  const sorted = [...intervals].sort((left, right) => left.startAt - right.startAt);
  const merged: Interval[] = [{ ...sorted[0] }];

  for (let index = 1; index < sorted.length; index += 1) {
    const current = sorted[index];
    const last = merged[merged.length - 1];
    if (current.startAt <= last.endAt) {
      last.endAt = Math.max(last.endAt, current.endAt);
    } else {
      merged.push({ ...current });
    }
  }

  return merged;
}

export function invertBusyToFree(day: WeekDay, busy: Interval[]): FreeSlot[] {
  const merged = mergeBusyIntervals(busy);
  const free: FreeSlot[] = [];
  let cursor = day.startMs;

  for (const interval of merged) {
    if (interval.startAt > cursor) {
      free.push({ ymd: day.ymd, startAt: cursor, endAt: interval.startAt });
    }
    cursor = Math.max(cursor, interval.endAt);
  }

  if (cursor < day.endMs) {
    free.push({ ymd: day.ymd, startAt: cursor, endAt: day.endMs });
  }

  return free;
}

export function freeSlotsForMemberDay(
  entries: CalendarEntry[],
  uid: string,
  day: WeekDay,
): FreeSlot[] {
  return freeSlotsFromEntries(
    entries.filter((entry) => entry.uid === uid),
    day,
  );
}

export function freeSlotsFromEntries(entries: CalendarEntry[], day: WeekDay): FreeSlot[] {
  const busy = entries
    .map((entry) => clipToDay(entry, day))
    .filter((interval): interval is Interval => Boolean(interval));
  return invertBusyToFree(day, busy);
}

export function isFreeAllDay(slots: FreeSlot[], day: WeekDay): boolean {
  return (
    slots.length === 1 &&
    slots[0].startAt === day.startMs &&
    slots[0].endAt === day.endMs
  );
}

export function dayDurationMs(): number {
  return DAY_MS;
}
