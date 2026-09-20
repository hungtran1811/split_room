import type { CalendarEntry, CalendarInfo, CalendarRef } from "./types";

export const GROUP_CALENDAR: CalendarRef = { kind: "group", id: "group" };

export function calendarKey(calendar: CalendarRef): string {
  return `${calendar.kind}:${calendar.id}`;
}

export function calendarEntryKey(entry: { id: string; calendar?: CalendarRef }): string {
  return `${calendarKey(entry.calendar || GROUP_CALENDAR)}:${entry.id}`;
}

export function canEditCalendarEntry(entry: Pick<CalendarEntry, "uid">, uid: string): boolean {
  return Boolean(uid && entry.uid === uid);
}

export function canManageCalendar(calendar: CalendarInfo, uid: string): boolean {
  return Boolean(uid && calendar.kind === "shared" && calendar.ownerUid === uid);
}
