import { describe, expect, it } from "vitest";
import { calendarEntryKey, canEditCalendarEntry, canManageCalendar } from "../src/domain/calendar/access";
import { buildCopiedEntries } from "../src/domain/calendar/copyWeek";
import { splitEntriesAcrossDays } from "../src/domain/calendar/segments";
import { hasSelfOverlap } from "../src/domain/calendar/validate";
import { weekBounds } from "../src/domain/calendar/week";
import { vnDateTimeLocalToMs } from "../src/domain/calendar/tz";
import { resolveCalendarMemberLabel } from "../src/features/calendar/members";

const group = { kind: "group", id: "group" };
const personal = { kind: "private", id: "private_test-a" };
const shared = { kind: "shared", id: "test-ab" };
function entry(calendar, overrides = {}) {
  return {
    id: "same-document-id", calendar, uid: "test-a", title: "Ca làm", description: "", location: "",
    startAt: vnDateTimeLocalToMs("2026-09-20T22:00"),
    endAt: vnDateTimeLocalToMs("2026-09-21T06:00"), ...overrides,
  };
}

describe("calendar privacy identities", () => {
  it("labels members outside the static roster by their profile instead of their UID", () => {
    const members = [{ uid: "new-member", displayName: "Thành viên mới" }];
    expect(resolveCalendarMemberLabel(members, "new-member", (key) => key)).toBe("Thành viên mới");
    expect(resolveCalendarMemberLabel(members, "new-member", () => "Biệt danh")).toBe("Biệt danh");
  });
  it("keeps equal document IDs in different calendars independently selectable", () => {
    const entries = [entry(group), entry(personal), entry(shared)];
    expect(new Set(entries.map(calendarEntryKey)).size).toBe(3);
    const pieces = splitEntriesAcrossDays(entries, weekBounds("2026-09-21"));
    expect(new Set(pieces.map((piece) => piece.entryKey)).size).toBe(3);
    expect(pieces.map((piece) => piece.calendar)).toEqual([group, personal, shared]);
  });

  it("does not exclude same-ID events in other calendars from overlap warnings", () => {
    const a = entry(group);
    const b = entry(personal);
    expect(hasSelfOverlap([a, b], "test-a", a, calendarEntryKey(a))).toBe(true);
    expect(hasSelfOverlap([a], "test-a", a, calendarEntryKey(a))).toBe(false);
  });

  it("preserves each calendar and the full overnight duration when copying", () => {
    const sources = [entry(group), entry(personal), entry(shared)];
    const copied = buildCopiedEntries(sources, "2026-09-21");
    expect(copied).toHaveLength(3);
    expect(copied.map((item) => item.entry.calendar)).toEqual([group, personal, shared]);
    expect(new Set(copied.map((item) => calendarEntryKey(item.entry))).size).toBe(3);
    for (const item of copied) {
      expect(item.entry.endAt - item.entry.startAt).toBe(8 * 60 * 60 * 1000);
      expect(item.entry.uid).toBe("test-a");
    }
  });

  it("distinguishes calendar management from another contributor's event", () => {
    const calendar = { ...shared, name: "A–B", ownerUid: "test-a", memberUids: ["test-a", "test-b"] };
    const authoredByB = entry(shared, { uid: "test-b" });
    expect(canManageCalendar(calendar, "test-a")).toBe(true);
    expect(canManageCalendar(calendar, "test-b")).toBe(false);
    expect(canEditCalendarEntry(authoredByB, "test-a")).toBe(false);
    expect(canEditCalendarEntry(authoredByB, "test-b")).toBe(true);
    expect(canManageCalendar({ ...calendar, ...personal }, "test-a")).toBe(false);
  });
});
