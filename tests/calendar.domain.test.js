import { describe, expect, it } from "vitest";
import {
  addDaysYmd,
  formatHmFromMs,
  mondayIndexOfYmd,
  msToVnDateTimeLocal,
  todayYmdVn,
  vnDateTimeLocalToMs,
  vnWallTimeToUtcMs,
  ymdInTz,
  ymdStartMs,
} from "../src/domain/calendar/tz";
import {
  currentWeekStartYmd,
  formatWeekRangeLabel,
  shiftWeekStart,
  weekBounds,
  weekStartMondayYmd,
} from "../src/domain/calendar/week";
import { splitEntryAcrossDays } from "../src/domain/calendar/segments";
import { assignOverlapColumns } from "../src/domain/calendar/overlap";
import { freeSlotsForMemberDay, isFreeAllDay, mergeBusyIntervals } from "../src/domain/calendar/freeSlots";
import { buildCopiedEntries, shiftEntryByDays, stableCopyId } from "../src/domain/calendar/copyWeek";
import { hasSelfOverlap, validateCalendarEntryInput } from "../src/domain/calendar/validate";

function entry(partial) {
  return {
    id: "e1",
    uid: "u1",
    title: "Bận",
    description: "",
    location: "",
    startAt: 0,
    endAt: 1,
    ...partial,
  };
}

describe("calendar timezone and week bounds", () => {
  it("treats Monday as week start across month and year", () => {
    expect(weekStartMondayYmd("2026-09-20")).toBe("2026-09-14");
    expect(mondayIndexOfYmd("2026-09-20")).toBe(6);
    expect(weekStartMondayYmd("2026-09-21")).toBe("2026-09-21");
    expect(weekStartMondayYmd("2027-01-01")).toBe("2026-12-28");
  });

  it("builds 7 days Mon-Sun with exclusive next-Monday end", () => {
    const week = weekBounds("2026-12-30");
    expect(week.startYmd).toBe("2026-12-28");
    expect(week.endYmdExclusive).toBe("2027-01-04");
    expect(week.days.map((day) => day.ymd)).toEqual([
      "2026-12-28",
      "2026-12-29",
      "2026-12-30",
      "2026-12-31",
      "2027-01-01",
      "2027-01-02",
      "2027-01-03",
    ]);
    expect(week.endMs - week.startMs).toBe(7 * 24 * 60 * 60 * 1000);
    expect(formatWeekRangeLabel(week)).toBe("28/12/2026 – 3/1/2027");
  });

  it("converts Vietnam wall time independently of UTC", () => {
    const ms = vnDateTimeLocalToMs("2026-09-21T07:00");
    expect(ms).toBe(vnWallTimeToUtcMs(2026, 9, 21, 7, 0));
    expect(ymdInTz(ms)).toBe("2026-09-21");
    expect(formatHmFromMs(ms)).toBe("07:00");
    expect(msToVnDateTimeLocal(ms)).toBe("2026-09-21T07:00");
  });

  it("uses current Vietnam calendar date for this week", () => {
    const now = vnWallTimeToUtcMs(2026, 9, 20, 1, 0);
    expect(todayYmdVn(now)).toBe("2026-09-20");
    expect(currentWeekStartYmd(now)).toBe("2026-09-14");
    expect(shiftWeekStart("2026-09-14", 1)).toBe("2026-09-21");
  });
});

describe("calendar overnight segments", () => {
  it("splits an overnight entry across Saturday and Sunday", () => {
    const week = weekBounds("2026-09-14");
    const saturdayStart = vnWallTimeToUtcMs(2026, 9, 19, 22, 0);
    const sundayEnd = vnWallTimeToUtcMs(2026, 9, 20, 2, 0);
    const segments = splitEntryAcrossDays(
      entry({ id: "night", startAt: saturdayStart, endAt: sundayEnd }),
      week,
    );

    expect(segments.map((item) => item.ymd)).toEqual(["2026-09-19", "2026-09-20"]);
    expect(formatHmFromMs(segments[0].startAt)).toBe("22:00");
    expect(formatHmFromMs(segments[0].endAt)).toBe("00:00");
    expect(segments[0].continuesToNext).toBe(true);
    expect(formatHmFromMs(segments[1].startAt)).toBe("00:00");
    expect(formatHmFromMs(segments[1].endAt)).toBe("02:00");
    expect(segments[1].continuesFromPrev).toBe(true);
  });

  it("keeps an entry ending at 00:00 on the previous day only", () => {
    const week = weekBounds("2026-09-14");
    const startAt = vnWallTimeToUtcMs(2026, 9, 19, 22, 0);
    const endAt = ymdStartMs("2026-09-20");
    const segments = splitEntryAcrossDays(entry({ startAt, endAt }), week);

    expect(segments).toHaveLength(1);
    expect(segments[0].ymd).toBe("2026-09-19");
    expect(formatHmFromMs(segments[0].endAt)).toBe("00:00");
    expect(segments[0].continuesToNext).toBe(false);
  });
});

describe("calendar overlap and free slots", () => {
  it("places overlapping segments in adjacent columns", () => {
    const ymd = "2026-09-14";
    const placed = assignOverlapColumns([
      {
        entryId: "a",
        uid: "u1",
        title: "A",
        description: "",
        location: "",
        ymd,
        startAt: 100,
        endAt: 300,
        continuesFromPrev: false,
        continuesToNext: false,
      },
      {
        entryId: "b",
        uid: "u2",
        title: "B",
        description: "",
        location: "",
        ymd,
        startAt: 200,
        endAt: 400,
        continuesFromPrev: false,
        continuesToNext: false,
      },
    ]);

    expect(placed.map((item) => item.col).sort()).toEqual([0, 1]);
    expect(placed.every((item) => item.colCount === 2)).toBe(true);
  });

  it("merges overlapping busy intervals when computing free time", () => {
    const week = weekBounds("2026-09-14");
    const monday = week.days[0];
    const entries = [
      entry({
        id: "a",
        startAt: vnWallTimeToUtcMs(2026, 9, 14, 8, 0),
        endAt: vnWallTimeToUtcMs(2026, 9, 14, 10, 0),
      }),
      entry({
        id: "b",
        startAt: vnWallTimeToUtcMs(2026, 9, 14, 9, 30),
        endAt: vnWallTimeToUtcMs(2026, 9, 14, 11, 0),
      }),
    ];

    const free = freeSlotsForMemberDay(entries, "u1", monday);
    expect(isFreeAllDay(free, monday)).toBe(false);
    expect(formatHmFromMs(free[0].startAt)).toBe("00:00");
    expect(formatHmFromMs(free[0].endAt)).toBe("08:00");
    expect(formatHmFromMs(free[1].startAt)).toBe("11:00");
    expect(formatHmFromMs(free[1].endAt)).toBe("00:00");
  });

  it("treats a day with no busy entries as free all day", () => {
    const monday = weekBounds("2026-09-14").days[0];
    const free = freeSlotsForMemberDay([], "u1", monday);
    expect(isFreeAllDay(free, monday)).toBe(true);
  });

  it("merges touching busy intervals", () => {
    const merged = mergeBusyIntervals([
      { startAt: 10, endAt: 20 },
      { startAt: 20, endAt: 30 },
    ]);
    expect(merged).toEqual([{ startAt: 10, endAt: 30 }]);
  });

  it("detects self overlap but still allows validation of the draft", () => {
    const draft = {
      startAt: vnWallTimeToUtcMs(2026, 9, 14, 9, 0),
      endAt: vnWallTimeToUtcMs(2026, 9, 14, 11, 0),
    };
    const existing = [
      entry({
        id: "old",
        startAt: vnWallTimeToUtcMs(2026, 9, 14, 10, 0),
        endAt: vnWallTimeToUtcMs(2026, 9, 14, 12, 0),
      }),
    ];
    expect(hasSelfOverlap(existing, "u1", draft)).toBe(true);
    expect(hasSelfOverlap(existing, "u1", draft, "old")).toBe(false);
    expect(validateCalendarEntryInput({ title: "Họp", ...draft }).ok).toBe(true);
  });
});

describe("calendar copy helpers", () => {
  it("builds a stable destination id and shifts both timestamps by 7 days", () => {
    const source = entry({
      id: "src1",
      startAt: vnWallTimeToUtcMs(2026, 9, 16, 19, 0),
      endAt: vnWallTimeToUtcMs(2026, 9, 17, 1, 0),
    });
    const shifted = shiftEntryByDays(source, 7);
    expect(ymdInTz(shifted.startAt)).toBe("2026-09-23");
    expect(ymdInTz(shifted.endAt)).toBe("2026-09-24");
    expect(formatHmFromMs(shifted.startAt)).toBe("19:00");
    expect(stableCopyId("src1", "2026-09-21")).toBe("src1__2026-09-21");
  });

  it("copies only entries that start in the previous week", () => {
    const previous = entry({
      id: "keep",
      startAt: vnWallTimeToUtcMs(2026, 9, 16, 8, 0),
      endAt: vnWallTimeToUtcMs(2026, 9, 16, 9, 0),
    });
    const older = entry({
      id: "old",
      startAt: vnWallTimeToUtcMs(2026, 9, 9, 8, 0),
      endAt: vnWallTimeToUtcMs(2026, 9, 9, 9, 0),
    });
    const copies = buildCopiedEntries([previous, older], "2026-09-21");
    expect(copies).toHaveLength(1);
    expect(copies[0].destId).toBe("keep__2026-09-21");
    expect(copies[0].sourceId).toBe("keep");
    expect(ymdInTz(copies[0].entry.startAt)).toBe("2026-09-23");
  });
});
