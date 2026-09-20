import { vnDateTimeLocalToMs } from "./tz";
import type { CalendarEntry, CalendarInterval } from "./types";
import { calendarEntryKey } from "./access";

export const TITLE_MAX = 120;
export const DESCRIPTION_MAX = 2000;
export const LOCATION_MAX = 200;

export type CalendarEntryInput = {
  title: string;
  description?: string;
  location?: string;
  startAt: number;
  endAt: number;
};

export type CalendarValidation = {
  ok: boolean;
  error: string;
  title: string;
  description: string;
  location: string;
  startAt: number;
  endAt: number;
};

export function sanitizeCalendarText(raw: unknown, max: number): string {
  return String(raw || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

export function sanitizeMultiline(raw: unknown, max: number): string {
  return String(raw || "")
    .replace(/\r\n/g, "\n")
    .trim()
    .slice(0, max);
}

export function validateCalendarEntryInput(input: CalendarEntryInput): CalendarValidation {
  const title = sanitizeCalendarText(input.title, TITLE_MAX);
  const description = sanitizeMultiline(input.description, DESCRIPTION_MAX);
  const location = sanitizeCalendarText(input.location, LOCATION_MAX);
  const startAt = Number(input.startAt);
  const endAt = Number(input.endAt);

  if (!title) {
    return { ok: false, error: "Hãy nhập tiêu đề.", title, description, location, startAt, endAt };
  }
  if (!Number.isFinite(startAt) || !Number.isFinite(endAt)) {
    return {
      ok: false,
      error: "Ngày giờ không hợp lệ.",
      title,
      description,
      location,
      startAt,
      endAt,
    };
  }
  if (endAt <= startAt) {
    return {
      ok: false,
      error: "Thời điểm kết thúc phải sau thời điểm bắt đầu.",
      title,
      description,
      location,
      startAt,
      endAt,
    };
  }

  return { ok: true, error: "", title, description, location, startAt, endAt };
}

export function validateDateTimeLocalRange(startLocal: string, endLocal: string): CalendarValidation {
  const startAt = vnDateTimeLocalToMs(startLocal);
  const endAt = vnDateTimeLocalToMs(endLocal);
  return validateCalendarEntryInput({
    title: "placeholder",
    startAt: startAt ?? NaN,
    endAt: endAt ?? NaN,
  });
}

export function intervalsOverlap(left: CalendarInterval, right: CalendarInterval): boolean {
  return left.startAt < right.endAt && right.startAt < left.endAt;
}

export function hasSelfOverlap(
  entries: CalendarEntry[],
  uid: string,
  draft: CalendarInterval,
  excludeId?: string,
): boolean {
  return entries.some(
    (entry) =>
      entry.uid === uid &&
      calendarEntryKey(entry) !== excludeId &&
      (entry.calendar || entry.id !== excludeId) &&
      intervalsOverlap(entry, draft),
  );
}
