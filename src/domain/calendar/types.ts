export type CalendarRef = {
  kind: "group" | "private" | "shared";
  id: string;
};

export type CalendarInfo = CalendarRef & {
  name: string;
  ownerUid: string;
  memberUids: string[];
};

export type CalendarEntry = {
  id: string;
  calendar: CalendarRef;
  uid: string;
  title: string;
  description: string;
  location: string;
  startAt: number;
  endAt: number;
};

export type CalendarInterval = {
  startAt: number;
  endAt: number;
};

export type DaySegment = {
  entryId: string;
  entryKey: string;
  calendar: CalendarRef;
  uid: string;
  title: string;
  description: string;
  location: string;
  ymd: string;
  startAt: number;
  endAt: number;
  continuesFromPrev: boolean;
  continuesToNext: boolean;
};

export type PlacedSegment = DaySegment & {
  col: number;
  colCount: number;
};

export type FreeSlot = {
  ymd: string;
  startAt: number;
  endAt: number;
};

export type CopyWeekResult = {
  added: number;
  skipped: number;
  failed: Array<{
    sourceId: string;
    destId: string;
    sourceKey: string;
    destKey: string;
    calendar: CalendarRef;
    message: string;
  }>;
};
