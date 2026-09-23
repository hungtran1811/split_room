import { describe, expect, it } from "vitest";
import {
  buildCalendarDeletePreview, isCalendarDeleteScope, matchesCalendarDeletion, sameCalendarDeletionEntry,
} from "../src/domain/calendar/delete";
import { DAY_MS, WEEK_MS, vnDateTimeLocalToMs } from "../src/domain/calendar/tz";

const calendar = { kind: "shared", id: "test-ab" };
const anchor = {
  id: "anchor", calendar, uid: "test-a", title: "Ca tối", description: "Trực phòng", location: "Nhà",
  startAt: vnDateTimeLocalToMs("2026-09-21T22:00"),
  endAt: vnDateTimeLocalToMs("2026-09-22T06:00"),
};
const next = (id, days, changes = {}) => ({
  ...anchor, id, startAt: anchor.startAt + days * DAY_MS, endAt: anchor.endAt + days * DAY_MS, ...changes,
});

describe("matching later calendar entries for deletion", () => {
  it("offers only one, following days and following weeks", () => {
    expect(["one", "following-days", "following-weeks"].every(isCalendarDeleteScope)).toBe(true);
    expect(isCalendarDeleteScope("all")) .toBe(false);
  });

  it("deletes only the anchor for the single-entry scope", () => {
    const result = buildCalendarDeletePreview(anchor, [anchor, next("tomorrow", 1), next("next-week", 7)], "one");
    expect(result.entries).toEqual([anchor]);
  });

  it("matches later days at the same start time and preserves the whole overnight interval", () => {
    const tomorrow = next("tomorrow", 1);
    const laterWeek = next("next-week", 7);
    const result = buildCalendarDeletePreview(anchor,
      [laterWeek, anchor, next("past", -1), next("same-start-duplicate", 0), tomorrow, next("later-time", 1.5)],
      "following-days");
    expect(result.entries).toEqual([anchor, tomorrow, laterWeek]);
    expect(result.entries.every((entry) => entry.endAt - entry.startAt === 8 * 60 * 60 * 1000)).toBe(true);
  });

  it("matches only the same weekday and time in later weeks", () => {
    const nextWeek = next("next-week", 7);
    const twoWeeks = next("two-weeks", 14);
    const result = buildCalendarDeletePreview(anchor,
      [twoWeeks, next("tomorrow", 1), nextWeek, next("last-week", -7), next("eight-days", 8)],
      "following-weeks");
    expect(result.entries).toEqual([anchor, nextWeek, twoWeeks]);
    expect(nextWeek.startAt - anchor.startAt).toBe(WEEK_MS);
  });

  it.each([
    ["different author", { uid: "test-b" }],
    ["different calendar", { calendar: { kind: "private", id: "private_test-a" } }],
    ["different calendar kind", { calendar: { kind: "private", id: calendar.id } }],
    ["different title", { title: "Ca chiều" }],
    ["different title case", { title: "ca tối" }],
    ["different description", { description: "Trực thay" }],
    ["different location", { location: "Văn phòng" }],
    ["different duration", { endAt: anchor.endAt + DAY_MS + 60 * 60 * 1000 }],
  ])("excludes %s even when the start time matches", (_name, changes) => {
    expect(matchesCalendarDeletion(anchor, next("tomorrow", 1, changes), "following-days")).toBe(false);
  });

  it("requires the anchor's complete reviewed content even when its ID is unchanged", () => {
    expect(sameCalendarDeletionEntry(anchor, { ...anchor })).toBe(true);
    expect(matchesCalendarDeletion(anchor, { ...anchor, description: "Đã thay đổi" }, "one")).toBe(false);
    expect(sameCalendarDeletionEntry(anchor, { ...anchor, startAt: anchor.startAt + 1000 })).toBe(false);
  });
});
