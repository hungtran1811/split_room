import { beforeEach, describe, expect, it, vi } from "vitest";

const io = vi.hoisted(() => ({
  records: new Map(), reads: [], commits: [], commitError: null,
  getDocFromServer: vi.fn(), getDocsFromServer: vi.fn(), runTransaction: vi.fn(),
}));
vi.mock("../src/config/firebase", () => ({ db: {} }));
vi.mock("firebase/firestore", async (importOriginal) => ({
  ...await importOriginal(),
  collection: (_db, ...parts) => ({ path: parts.join("/") }),
  doc: (collection, id) => ({ path: `${collection.path}/${id}`, id }),
  query: (collection, ...constraints) => ({ ...collection, constraints }),
  where: (...parts) => ({ where: parts }),
  getDocFromServer: io.getDocFromServer,
  getDocsFromServer: io.getDocsFromServer,
  runTransaction: io.runTransaction,
}));

import { Timestamp } from "firebase/firestore";
import { previewCalendarDeletion, deleteCalendarEntries } from "../src/services/calendar.service";
import { DAY_MS } from "../src/domain/calendar/tz";

const uid = "test-a";
const groupId = "test-group";
const shared = { kind: "shared", id: "test-ab" };
const common = { kind: "group", id: "group" };
const privateCalendar = { kind: "private", id: "private_test-a" };
const startAt = Date.parse("2026-09-21T22:00:00+07:00");
const entryPath = (id, calendar = shared) => calendar.kind === "group"
  ? `groups/${groupId}/calendarEntries/${id}`
  : `groups/${groupId}/calendars/${calendar.id}/entries/${id}`;
function record(days = 0, changes = {}) {
  return {
    uid, title: "Ca tối", description: "Trực phòng", location: "Nhà",
    startAt: Timestamp.fromMillis(startAt + days * DAY_MS),
    endAt: Timestamp.fromMillis(startAt + days * DAY_MS + 8 * 60 * 60 * 1000),
    ...changes,
  };
}
const snapshot = (ref) => ({
  id: ref.id, exists: () => io.records.has(ref.path), data: () => io.records.get(ref.path),
});
const preview = (scope = "following-days", calendar = shared) =>
  previewCalendarDeletion(groupId, calendar, uid, "anchor", scope);

beforeEach(() => {
  vi.clearAllMocks();
  io.records.clear();
  io.reads.length = 0;
  io.commits.length = 0;
  io.commitError = null;
  io.records.set(entryPath("anchor"), record());
  io.records.set(entryPath("tomorrow"), record(1));
  io.records.set(entryPath("next-week"), record(7));
  io.getDocFromServer.mockImplementation(async (ref) => snapshot(ref));
  io.getDocsFromServer.mockImplementation(async (query) => ({
    docs: [...io.records.keys()]
      .filter((path) => path.startsWith(`${query.path}/`) && !path.slice(query.path.length + 1).includes("/"))
      // Intentionally return another author's records too: service filtering is checked independently.
      .map((path) => snapshot({ path, id: path.split("/").at(-1) })),
  }));
  io.runTransaction.mockImplementation(async (_db, callback) => {
    const writes = [];
    const result = await callback({
      get: async (ref) => {
        if (writes.length) throw new Error("All transaction reads must precede writes.");
        io.reads.push(ref.path);
        return snapshot(ref);
      },
      delete: (ref) => writes.push(ref.path),
    });
    if (io.commitError) throw io.commitError;
    writes.forEach((path) => io.records.delete(path));
    io.commits.push(writes);
    return result;
  });
});

describe("calendar deletion previews", () => {
  it.each([shared, common, privateCalendar])("reads the anchor from the server in %s", async (calendar) => {
    io.records.set(entryPath("anchor", calendar), record());
    const result = await preview("one", calendar);
    expect(result.entries.map((entry) => entry.id)).toEqual(["anchor"]);
    expect(result.anchor.calendar).toEqual(calendar);
    expect(io.getDocFromServer).toHaveBeenCalledWith({ path: entryPath("anchor", calendar), id: "anchor" });
    expect(io.getDocsFromServer).not.toHaveBeenCalled();
  });

  it("queries only the current calendar and author using a single indexed equality", async () => {
    io.records.set(entryPath("past"), record(-1));
    io.records.set(entryPath("someone-else"), record(2, { uid: "test-b" }));
    io.records.set(entryPath("same-start"), record());
    io.records.set(entryPath("another-calendar", common), record(1));
    const result = await preview();
    expect(result.entries.map((entry) => entry.id)).toEqual(["anchor", "tomorrow", "next-week"]);
    expect(io.getDocsFromServer).toHaveBeenCalledWith({
      path: `groups/${groupId}/calendars/${shared.id}/entries`,
      constraints: [{ where: ["uid", "==", uid] }],
    });
  });

  it("previews later weeks without including later weekdays", async () => {
    expect((await preview("following-weeks")).entries.map((entry) => entry.id)).toEqual(["anchor", "next-week"]);
  });

  it("rejects missing or other-author anchors with an actionable message", async () => {
    io.records.delete(entryPath("anchor"));
    await expect(preview()).rejects.toThrow("không còn tồn tại");
    io.records.set(entryPath("anchor"), record(0, { uid: "test-b" }));
    await expect(preview()).rejects.toThrow("do bạn tạo");
    expect(io.getDocsFromServer).not.toHaveBeenCalled();
  });

  it("does not fall back to cached data when server access fails", async () => {
    io.getDocFromServer.mockRejectedValueOnce({ code: "permission-denied" });
    await expect(preview()).rejects.toMatchObject({ code: "permission-denied" });
    io.getDocFromServer.mockRejectedValueOnce({ code: "unavailable" });
    await expect(preview()).rejects.toMatchObject({ code: "unavailable" });
    expect(io.getDocsFromServer).not.toHaveBeenCalled();
  });
});

describe("atomic deletion of the reviewed selection", () => {
  it("reads every selected entry before atomically deleting precisely the preview", async () => {
    const planned = await preview();
    io.records.set(entryPath("created-after-preview"), record(2));
    io.records.set(entryPath("other-author"), record(1, { uid: "test-b" }));
    const removed = await deleteCalendarEntries(groupId, shared, uid, planned);
    expect(removed).toBe(3);
    expect(io.reads).toEqual(["anchor", "tomorrow", "next-week"].map((id) => entryPath(id)));
    expect(io.commits).toEqual([io.reads]);
    expect([...io.records.keys()]).toEqual([entryPath("created-after-preview"), entryPath("other-author")]);
  });

  it("keeps the later matches when deleting just one entry", async () => {
    const planned = await preview("one");
    expect(await deleteCalendarEntries(groupId, shared, uid, planned)).toBe(1);
    expect([...io.records.keys()]).toEqual([entryPath("tomorrow"), entryPath("next-week")]);
  });

  it.each([
    ["title", { title: "Đã sửa" }], ["description", { description: "Đã sửa" }],
    ["location", { location: "Nơi khác" }], ["author", { uid: "test-b" }],
    ["start", { startAt: Timestamp.fromMillis(startAt + DAY_MS + 1000) }],
    ["end", { endAt: Timestamp.fromMillis(startAt + DAY_MS + 9 * 60 * 60 * 1000) }],
  ])("rolls back the whole selection when %s changes after preview", async (_name, changes) => {
    const planned = await preview();
    io.records.set(entryPath("tomorrow"), record(1, changes));
    await expect(deleteCalendarEntries(groupId, shared, uid, planned)).rejects.toThrow("Hãy tải lại danh sách");
    expect(io.records.size).toBe(3);
    expect(io.commits).toEqual([]);
  });

  it("does not delete anything else when a reviewed entry disappeared", async () => {
    const planned = await preview();
    io.records.delete(entryPath("tomorrow"));
    await expect(deleteCalendarEntries(groupId, shared, uid, planned)).rejects.toThrow("chưa có lịch nào bị xóa");
    expect([...io.records.keys()]).toEqual([entryPath("anchor"), entryPath("next-week")]);
    expect(io.commits).toEqual([]);
  });

  it("preserves all records when access is revoked before commit", async () => {
    const planned = await preview();
    io.commitError = { code: "permission-denied" };
    await expect(deleteCalendarEntries(groupId, shared, uid, planned)).rejects.toMatchObject({ code: "permission-denied" });
    expect(io.records.size).toBe(3);
    expect(io.commits).toEqual([]);
  });

  it.each([
    ["invalid scope", (planned) => ({ ...planned, scope: "all" })],
    ["missing anchor", (planned) => ({ ...planned, entries: planned.entries.slice(1) })],
    ["duplicate ID", (planned) => ({ ...planned, entries: [...planned.entries, planned.entries[0]] })],
    ["other author", (planned) => ({ ...planned, entries: [planned.anchor, { ...planned.entries[1], uid: "test-b" }] })],
    ["other calendar", (planned) => ({ ...planned, entries: [planned.anchor, { ...planned.entries[1], calendar: common }] })],
    ["changed content", (planned) => ({ ...planned, entries: [planned.anchor, { ...planned.entries[1], title: "Khác" }] })],
    ["path traversal", (planned) => ({ ...planned, entries: [planned.anchor, { ...planned.entries[1], id: "../another" }] })],
    ["past entry", (planned) => ({ ...planned, entries: [planned.anchor, {
      ...planned.entries[1], startAt: startAt - DAY_MS, endAt: startAt - DAY_MS + 8 * 60 * 60 * 1000,
    }] })],
  ])("rejects forged preview: %s", async (_name, mutate) => {
    await expect(deleteCalendarEntries(groupId, shared, uid, mutate(await preview()))).rejects.toThrow();
    expect(io.runTransaction).not.toHaveBeenCalled();
    expect(io.records.size).toBe(3);
  });

  it("refuses more than 450 entries without splitting a destructive operation", async () => {
    const planned = await preview("one");
    planned.scope = "following-days";
    planned.entries = Array.from({ length: 451 }, (_, index) => ({
      ...planned.anchor, id: index ? `future-${index}` : "anchor",
      startAt: planned.anchor.startAt + index * DAY_MS, endAt: planned.anchor.endAt + index * DAY_MS,
    }));
    await expect(deleteCalendarEntries(groupId, shared, uid, planned)).rejects.toThrow("450");
    expect(io.runTransaction).not.toHaveBeenCalled();
  });
});
