import { calendarKey } from "./access";
import { DAY_MS, WEEK_MS } from "./tz";
import type { CalendarEntry } from "./types";

export type CalendarDeleteScope = "one" | "following-days" | "following-weeks";

export type CalendarDeletePreview = {
  anchor: CalendarEntry;
  scope: CalendarDeleteScope;
  entries: CalendarEntry[];
};

export const MAX_CALENDAR_DELETIONS = 450;

export function isCalendarDeleteScope(value: unknown): value is CalendarDeleteScope {
  return value === "one" || value === "following-days" || value === "following-weeks";
}

/** Compare what the person reviewed, including the calendar and complete time interval. */
export function sameCalendarDeletionEntry(a: CalendarEntry, b: CalendarEntry): boolean {
  return a.id === b.id && calendarKey(a.calendar) === calendarKey(b.calendar)
    && a.uid === b.uid && a.title === b.title && a.description === b.description
    && a.location === b.location && a.startAt === b.startAt && a.endAt === b.endAt;
}

/** Existing repeats are separate documents, so match their visible content and VN wall time. */
export function matchesCalendarDeletion(
  anchor: CalendarEntry, candidate: CalendarEntry, scope: CalendarDeleteScope,
): boolean {
  if (!isCalendarDeleteScope(scope)) return false;
  if (candidate.id === anchor.id && calendarKey(candidate.calendar) === calendarKey(anchor.calendar)) {
    return sameCalendarDeletionEntry(anchor, candidate);
  }
  if (scope === "one") return false;
  if (calendarKey(candidate.calendar) !== calendarKey(anchor.calendar)
    || candidate.uid !== anchor.uid || candidate.title !== anchor.title
    || candidate.description !== anchor.description || candidate.location !== anchor.location
    || candidate.endAt - candidate.startAt !== anchor.endAt - anchor.startAt) return false;

  // Vietnam has no DST; whole UTC day/week offsets preserve the same local start time.
  const step = scope === "following-days" ? DAY_MS : WEEK_MS;
  const delta = candidate.startAt - anchor.startAt;
  return delta > 0 && Number.isInteger(delta / step);
}

export function buildCalendarDeletePreview(
  anchor: CalendarEntry, candidates: CalendarEntry[], scope: CalendarDeleteScope,
): CalendarDeletePreview {
  const entries = [anchor, ...candidates.filter((entry) => entry.id !== anchor.id
    && matchesCalendarDeletion(anchor, entry, scope))];
  entries.sort((a, b) => a.startAt - b.startAt || a.id.localeCompare(b.id));
  return { anchor, scope, entries };
}
