import {
  addDaysYmd,
  DAY_MS,
  mondayIndexOfYmd,
  parseYmd,
  todayYmdVn,
  WEEKDAY_LONG_VI,
  WEEKDAY_SHORT_VI,
  WEEK_MS,
  ymdInTz,
  ymdStartMs,
} from "./tz";

export type WeekDay = {
  ymd: string;
  weekdayIndex: number;
  shortLabel: string;
  longLabel: string;
  startMs: number;
  endMs: number;
};

export type WeekBounds = {
  startYmd: string;
  endYmdExclusive: string;
  startMs: number;
  endMs: number;
  days: WeekDay[];
};

export function weekStartMondayYmd(ymd: string): string {
  const parts = parseYmd(ymd);
  if (!parts) return ymd;
  const offset = mondayIndexOfYmd(ymd);
  return addDaysYmd(ymd, -offset);
}

export function weekStartMondayFromMs(ms: number): string {
  return weekStartMondayYmd(ymdInTz(ms));
}

export function currentWeekStartYmd(now: number = Date.now()): string {
  return weekStartMondayYmd(todayYmdVn(now));
}

export function shiftWeekStart(startYmd: string, weekDelta: number): string {
  return addDaysYmd(weekStartMondayYmd(startYmd), weekDelta * 7);
}

export function weekBounds(weekStartYmd: string): WeekBounds {
  const startYmd = weekStartMondayYmd(weekStartYmd);
  const startMs = ymdStartMs(startYmd);
  const endMs = startMs + WEEK_MS;
  const endYmdExclusive = addDaysYmd(startYmd, 7);
  const days: WeekDay[] = [];

  for (let index = 0; index < 7; index += 1) {
    const ymd = addDaysYmd(startYmd, index);
    const dayStart = startMs + index * DAY_MS;
    days.push({
      ymd,
      weekdayIndex: index,
      shortLabel: WEEKDAY_SHORT_VI[index],
      longLabel: WEEKDAY_LONG_VI[index],
      startMs: dayStart,
      endMs: dayStart + DAY_MS,
    });
  }

  return { startYmd, endYmdExclusive, startMs, endMs, days };
}

export function formatWeekRangeLabel(bounds: WeekBounds): string {
  const first = bounds.days[0];
  const last = bounds.days[6];
  if (!first || !last) return bounds.startYmd;

  const [startYear, startMonth, startDay] = first.ymd.split("-");
  const [endYear, endMonth, endDay] = last.ymd.split("-");
  const start = `${Number(startDay)}/${Number(startMonth)}`;
  const end = `${Number(endDay)}/${Number(endMonth)}/${endYear}`;
  if (startYear !== endYear) {
    return `${start}/${startYear} – ${end}`;
  }
  return `${start} – ${end}`;
}

export function isMsInWeek(ms: number, bounds: WeekBounds): boolean {
  return ms >= bounds.startMs && ms < bounds.endMs;
}
