export type CalendarEntry = {
  id: string;
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
  failed: Array<{ sourceId: string; destId: string; message: string }>;
};
