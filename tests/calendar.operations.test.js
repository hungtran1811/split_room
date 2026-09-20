import { beforeEach, describe, expect, it, vi } from "vitest";

const io = vi.hoisted(() => ({
  records: new Map(),
  readErrors: new Map(),
  reads: [],
  commits: [],
  nextId: 0,
  commitError: null,
  now: { serverTimestamp: true },
  runTransaction: vi.fn(),
  setDoc: vi.fn(),
  deleteDoc: vi.fn(),
  updateDoc: vi.fn(),
  getDocsFromServer: vi.fn(),
}));

vi.mock("../src/config/firebase", () => ({ db: {} }));
vi.mock("firebase/firestore", async (importOriginal) => {
  const actual = await importOriginal();
  function ref(...args) {
    const path = [args[0]?.path || "", ...args.slice(1)].filter(Boolean).join("/");
    return { path, id: path.split("/").at(-1) };
  }
  return {
    ...actual,
    collection: ref,
    doc: (...args) => args.length === 1 ? ref(args[0], `new-${++io.nextId}`) : ref(...args),
    query: (collection, ...constraints) => ({ ...collection, constraints }),
    where: (...parts) => ({ where: parts }),
    orderBy: (...parts) => ({ orderBy: parts }),
    serverTimestamp: () => io.now,
    runTransaction: io.runTransaction,
    setDoc: io.setDoc,
    deleteDoc: io.deleteDoc,
    updateDoc: io.updateDoc,
    getDocsFromServer: io.getDocsFromServer,
  };
});

import { Timestamp } from "firebase/firestore";
import {
  copyPreviousWeekEntries,
  moveCalendarEntry,
  previewCopyFromPreviousWeek,
} from "../src/services/calendar.service";

const GROUP_ID = "test-group";
const UID = "test-author";
const WEEK = "2026-09-21";
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const group = { kind: "group", id: "group", name: "Cả nhóm", ownerUid: "", memberUids: [] };
const privateCalendar = { kind: "private", id: `private_${UID}`, name: "Cá nhân", ownerUid: UID, memberUids: [UID] };
const shared = { kind: "shared", id: "shared-ab", name: "Lịch A–B", ownerUid: "test-owner", memberUids: [UID, "test-owner"] };
const sourceStart = Date.parse("2026-09-16T09:00:00+07:00");

function entryPath(calendar, id) {
  return calendar.kind === "group"
    ? `groups/${GROUP_ID}/calendarEntries/${id}`
    : `groups/${GROUP_ID}/calendars/${calendar.id}/entries/${id}`;
}

function storedEntry(overrides = {}) {
  return {
    uid: UID,
    title: "Nội dung đã lưu",
    description: "Mô tả mới nhất",
    location: "Phòng chung",
    startAt: Timestamp.fromMillis(sourceStart),
    endAt: Timestamp.fromMillis(sourceStart + 60 * 60 * 1000),
    createdAt: Timestamp.fromMillis(sourceStart - WEEK_MS),
    updatedAt: Timestamp.fromMillis(sourceStart),
    ...overrides,
  };
}

function candidate(calendar, sourceId = "same-id", overrides = {}) {
  const destId = `${sourceId}__${WEEK}`;
  return {
    sourceId,
    destId,
    sourceKey: `${calendar.kind}:${calendar.id}:${sourceId}`,
    destKey: `${calendar.kind}:${calendar.id}:${destId}`,
    calendar,
    uid: UID,
    title: "Tiêu đề cũ từ bản xem trước",
    description: "Mô tả cũ",
    location: "Địa điểm cũ",
    startAt: sourceStart + WEEK_MS,
    endAt: sourceStart + WEEK_MS + 60 * 60 * 1000,
    ...overrides,
  };
}

function snapshot(value, id) {
  return { id, exists: () => value !== undefined, data: () => value };
}

beforeEach(() => {
  vi.clearAllMocks();
  io.records.clear();
  io.readErrors.clear();
  io.reads.length = 0;
  io.commits.length = 0;
  io.nextId = 0;
  io.commitError = null;
  io.runTransaction.mockImplementation(async (_db, callback) => {
    const staged = [];
    const result = await callback({
      get: async (ref) => {
        if (staged.length) throw new Error("Transaction reads must precede writes.");
        io.reads.push(ref.path);
        if (io.readErrors.has(ref.path)) throw io.readErrors.get(ref.path);
        return snapshot(io.records.get(ref.path), ref.id);
      },
      set: (ref, data) => staged.push({ operation: "set", path: ref.path, data }),
      delete: (ref) => staged.push({ operation: "delete", path: ref.path }),
    });
    if (io.commitError) throw io.commitError;
    for (const write of staged) {
      if (write.operation === "set") io.records.set(write.path, write.data);
      else io.records.delete(write.path);
    }
    io.commits.push(staged);
    return result;
  });
  io.updateDoc.mockResolvedValue(undefined);
  io.getDocsFromServer.mockImplementation(async (query) => {
    const prefix = `${query.path}/`;
    const docs = [...io.records.entries()]
      .filter(([path]) => path.startsWith(prefix) && !path.slice(prefix.length).includes("/"))
      .map(([path, data]) => snapshot(data, path.slice(prefix.length)));
    return { docs, metadata: { fromCache: false, hasPendingWrites: false } };
  });
});

describe("calendar event moves", () => {
  const input = {
    title: "Sau khi chuyển",
    description: "Chi tiết cập nhật",
    location: "Nhà",
    startAt: sourceStart,
    endAt: sourceStart + 2 * 60 * 60 * 1000,
  };

  it.each([
    [privateCalendar, group],
    [group, shared],
    [shared, privateCalendar],
  ])("moves %s to %s in one transaction and preserves authorship", async (source, target) => {
    const original = storedEntry();
    const sourcePath = entryPath(source, "original");
    io.records.set(sourcePath, original);

    const id = await moveCalendarEntry(GROUP_ID, source, target, "original", input);
    const destination = io.records.get(entryPath(target, id));

    expect(io.runTransaction).toHaveBeenCalledOnce();
    expect(io.reads).toEqual([sourcePath]);
    expect(io.commits).toEqual([[
      { operation: "set", path: entryPath(target, id), data: destination },
      { operation: "delete", path: sourcePath },
    ]]);
    expect(io.records.has(sourcePath)).toBe(false);
    expect(destination).toMatchObject({
      uid: UID,
      title: input.title,
      description: input.description,
      location: input.location,
      createdAt: io.now,
      updatedAt: io.now,
    });
    expect(destination.startAt.toMillis()).toBe(input.startAt);
    expect(destination.endAt.toMillis()).toBe(input.endAt);
    expect(destination).not.toHaveProperty("calendar");
    expect(io.setDoc).not.toHaveBeenCalled();
    expect(io.deleteDoc).not.toHaveBeenCalled();
    expect(io.updateDoc).not.toHaveBeenCalled();
  });

  it("leaves the source intact when the destination write is denied", async () => {
    const original = storedEntry();
    const sourcePath = entryPath(privateCalendar, "original");
    io.records.set(sourcePath, original);
    io.commitError = { code: "permission-denied" };

    await expect(moveCalendarEntry(GROUP_ID, privateCalendar, shared, "original", input))
      .rejects.toMatchObject({ code: "permission-denied" });

    expect([...io.records.entries()]).toEqual([[sourcePath, original]]);
    expect(io.commits).toEqual([]);
    expect(io.setDoc).not.toHaveBeenCalled();
    expect(io.deleteDoc).not.toHaveBeenCalled();
  });

  it("updates in place when the selected calendar has not changed", async () => {
    const id = await moveCalendarEntry(GROUP_ID, shared, { ...shared }, "original", input);
    expect(id).toBe("original");
    expect(io.runTransaction).not.toHaveBeenCalled();
    expect(io.updateDoc).toHaveBeenCalledWith(
      expect.objectContaining({ path: entryPath(shared, "original") }),
      expect.objectContaining({ title: input.title, updatedAt: io.now }),
    );
    expect(io.updateDoc.mock.calls[0][1]).not.toHaveProperty("uid");
    expect(io.updateDoc.mock.calls[0][1]).not.toHaveProperty("createdAt");
    expect(io.deleteDoc).not.toHaveBeenCalled();
  });
});

describe("copying only the author's events within their original calendars", () => {
  it("previews only owned events and distinguishes identical IDs across calendars", async () => {
    io.records.set(entryPath(group, "same-id"), storedEntry({ title: "Lịch nhóm" }));
    io.records.set(entryPath(privateCalendar, "same-id"), storedEntry({ title: "Lịch cá nhân" }));
    io.records.set(entryPath(group, "someone-else"), storedEntry({ uid: "test-other" }));

    const preview = await previewCopyFromPreviousWeek(GROUP_ID, UID, [group, privateCalendar], WEEK);

    expect(preview).toHaveLength(2);
    expect(preview.map((item) => item.calendar)).toEqual([
      { kind: group.kind, id: group.id },
      { kind: privateCalendar.kind, id: privateCalendar.id },
    ]);
    expect(new Set(preview.map((item) => item.sourceKey)).size).toBe(2);
    expect(new Set(preview.map((item) => item.destKey)).size).toBe(2);
    expect(preview.every((item) => item.uid === UID && item.startAt === sourceStart + WEEK_MS)).toBe(true);
  });

  it("copies fresh source content instead of a stale preview and remains idempotent", async () => {
    const planned = candidate(shared);
    const latestStart = sourceStart + 30 * 60 * 1000;
    io.records.set(entryPath(shared, planned.sourceId), storedEntry({
      title: "Đã sửa sau khi xem trước",
      startAt: Timestamp.fromMillis(latestStart),
      endAt: Timestamp.fromMillis(latestStart + 2 * 60 * 60 * 1000),
    }));

    const first = await copyPreviousWeekEntries(GROUP_ID, UID, [shared], WEEK, [planned]);
    const copiedPath = entryPath(shared, planned.destId);
    const copied = io.records.get(copiedPath);

    expect(first).toEqual({ added: 1, skipped: 0, failed: [] });
    expect(io.reads).toEqual([entryPath(shared, planned.sourceId), copiedPath]);
    expect(copied.title).toBe("Đã sửa sau khi xem trước");
    expect(copied.description).toBe("Mô tả mới nhất");
    expect(copied.location).toBe("Phòng chung");
    expect(copied.uid).toBe(UID);
    expect(copied.startAt.toMillis()).toBe(latestStart + WEEK_MS);
    expect(copied.endAt.toMillis()).toBe(latestStart + WEEK_MS + 2 * 60 * 60 * 1000);
    expect(copied.createdAt).toEqual(io.now);
    expect(copied.updatedAt).toEqual(io.now);

    const edited = { ...copied, title: "Đã sửa ở tuần đích", location: "Địa điểm khác" };
    io.records.set(copiedPath, edited);
    const second = await copyPreviousWeekEntries(GROUP_ID, UID, [shared], WEEK, [planned]);
    expect(second).toEqual({ added: 0, skipped: 1, failed: [] });
    expect(io.records.get(copiedPath)).toBe(edited);
    expect(io.commits.at(-1)).toEqual([]);
    expect(io.setDoc).not.toHaveBeenCalled();
    expect(io.deleteDoc).not.toHaveBeenCalled();
  });

  it("copies identical entry IDs into separate destinations for separate calendars", async () => {
    const first = candidate(group);
    const second = candidate(privateCalendar);
    io.records.set(entryPath(group, first.sourceId), storedEntry({ title: "Chung" }));
    io.records.set(entryPath(privateCalendar, second.sourceId), storedEntry({ title: "Riêng" }));

    const result = await copyPreviousWeekEntries(GROUP_ID, UID, [group, privateCalendar], WEEK, [first, second]);

    expect(result).toEqual({ added: 2, skipped: 0, failed: [] });
    expect(io.records.get(entryPath(group, first.destId)).title).toBe("Chung");
    expect(io.records.get(entryPath(privateCalendar, second.destId)).title).toBe("Riêng");
    expect(io.records.size).toBe(4);
  });

  it("reports revoked access without writing and still copies another permitted calendar", async () => {
    const blocked = candidate(shared);
    const allowed = candidate(privateCalendar);
    io.readErrors.set(entryPath(shared, blocked.sourceId), { code: "permission-denied" });
    io.records.set(entryPath(privateCalendar, allowed.sourceId), storedEntry());

    const result = await copyPreviousWeekEntries(GROUP_ID, UID, [shared, privateCalendar], WEEK, [blocked, allowed]);

    expect(result).toMatchObject({ added: 1, skipped: 0, failed: [
      { sourceId: blocked.sourceId, destId: blocked.destId, calendar: shared, sourceKey: blocked.sourceKey, destKey: blocked.destKey },
    ] });
    expect(result.failed[0].message).toContain("không có quyền");
    expect(io.records.has(entryPath(shared, blocked.destId))).toBe(false);
    expect(io.records.has(entryPath(privateCalendar, allowed.destId))).toBe(true);
  });

  it("rejects a source whose current author does not match the candidate", async () => {
    const planned = candidate(shared);
    io.records.set(entryPath(shared, planned.sourceId), storedEntry({ uid: "test-other" }));

    const result = await copyPreviousWeekEntries(GROUP_ID, UID, [shared], WEEK, [planned]);

    expect(result.added).toBe(0);
    expect(result.failed).toHaveLength(1);
    expect(io.commits).toEqual([]);
    expect(io.records.has(entryPath(shared, planned.destId))).toBe(false);
  });

  it("rejects candidates from calendars removed from the current audience list", async () => {
    const planned = candidate(shared);
    const result = await copyPreviousWeekEntries(GROUP_ID, UID, [privateCalendar], WEEK, [planned]);
    expect(result.added).toBe(0);
    expect(result.failed).toHaveLength(1);
    expect(io.runTransaction).not.toHaveBeenCalled();
  });
});
