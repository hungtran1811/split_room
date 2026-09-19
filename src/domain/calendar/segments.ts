import type { WeekBounds } from "./week";
import type { CalendarEntry, DaySegment } from "./types";

function clipInterval(
  startAt: number,
  endAt: number,
  dayStart: number,
  dayEnd: number,
): { startAt: number; endAt: number } | null {
  const start = Math.max(startAt, dayStart);
  const end = Math.min(endAt, dayEnd);
  if (end <= start) return null;
  return { startAt: start, endAt: end };
}

export function splitEntryAcrossDays(entry: CalendarEntry, week: WeekBounds): DaySegment[] {
  if (!(entry.endAt > entry.startAt)) return [];

  const segments: DaySegment[] = [];
  for (const day of week.days) {
    const clipped = clipInterval(entry.startAt, entry.endAt, day.startMs, day.endMs);
    if (!clipped) continue;
    segments.push({
      entryId: entry.id,
      uid: entry.uid,
      title: entry.title,
      description: entry.description,
      location: entry.location,
      ymd: day.ymd,
      startAt: clipped.startAt,
      endAt: clipped.endAt,
      continuesFromPrev: entry.startAt < day.startMs,
      continuesToNext: entry.endAt > day.endMs,
    });
  }
  return segments;
}

export function splitEntriesAcrossDays(entries: CalendarEntry[], week: WeekBounds): DaySegment[] {
  return entries.flatMap((entry) => splitEntryAcrossDays(entry, week));
}

export function segmentsForDay(segments: DaySegment[], ymd: string): DaySegment[] {
  return segments
    .filter((segment) => segment.ymd === ymd)
    .sort((left, right) => left.startAt - right.startAt || left.endAt - right.endAt);
}
