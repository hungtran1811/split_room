import { addDaysYmd, DAY_MS } from "./tz";
import { weekBounds } from "./week";
import type { CalendarEntry } from "./types";

export function stableCopyId(sourceId: string, targetWeekStartYmd: string): string {
  const safeSource = String(sourceId || "").replace(/[^\w.-]/g, "_").slice(0, 80);
  const safeWeek = String(targetWeekStartYmd || "").replace(/[^\d-]/g, "");
  return `${safeSource}__${safeWeek}`.slice(0, 150);
}

export function shiftEntryByDays(entry: CalendarEntry, days: number): CalendarEntry {
  const delta = days * DAY_MS;
  return {
    ...entry,
    startAt: entry.startAt + delta,
    endAt: entry.endAt + delta,
  };
}

export function entriesStartingInWeek(
  entries: CalendarEntry[],
  weekStartYmd: string,
  uid?: string,
): CalendarEntry[] {
  const bounds = weekBounds(weekStartYmd);
  return entries.filter((entry) => {
    if (uid && entry.uid !== uid) return false;
    return entry.startAt >= bounds.startMs && entry.startAt < bounds.endMs;
  });
}

export function buildCopiedEntries(
  sources: CalendarEntry[],
  targetWeekStartYmd: string,
): Array<{ sourceId: string; destId: string; entry: CalendarEntry }> {
  const previousWeekStart = addDaysYmd(weekBounds(targetWeekStartYmd).startYmd, -7);
  return entriesStartingInWeek(sources, previousWeekStart).map((source) => {
    const shifted = shiftEntryByDays(source, 7);
    const destId = stableCopyId(source.id, targetWeekStartYmd);
    return {
      sourceId: source.id,
      destId,
      entry: {
        ...shifted,
        id: destId,
      },
    };
  });
}
