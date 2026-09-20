import { beforeEach, describe, expect, it, vi } from "vitest";

const io = vi.hoisted(() => ({ listeners: [], onSnapshot: vi.fn(), getDocsFromServer: vi.fn(), transaction: vi.fn() }));
vi.mock("../src/config/firebase", () => ({ db: {}, auth: { currentUser: { uid: "test-a" } } }));
vi.mock("firebase/firestore", async (importOriginal) => {
  const actual = await importOriginal();
  const ref = (...args) => ({ path: [args[0]?.path || "", ...args.slice(1)].filter(Boolean).join("/") });
  return {
    ...actual,
    collection: ref,
    doc: ref,
    query: (collection, ...constraints) => ({ ...collection, constraints }),
    where: (...parts) => ({ where: parts }),
    orderBy: (...parts) => ({ orderBy: parts }),
    onSnapshot: io.onSnapshot,
    getDocsFromServer: io.getDocsFromServer,
    runTransaction: io.transaction,
  };
});
import { Timestamp } from "firebase/firestore";
import { watchCalendars } from "../src/services/calendar-catalog.service";
import { watchCalendarWeek } from "../src/services/calendar.service";

beforeEach(() => {
  io.listeners.length = 0;
  io.onSnapshot.mockReset();
  io.onSnapshot.mockImplementation((query, options, next, error) => {
    const stop = vi.fn();
    io.listeners.push({ query, options, next, error, stop });
    return stop;
  });
});

function snapshot(docs, metadata = {}) {
  return { metadata: { fromCache: false, hasPendingWrites: false, ...metadata }, docs: docs.map(({ id, ...data }) => ({ id, data: () => data })) };
}

describe("calendar server-confirmed authorization", () => {
  const shared = { kind: "shared", id: "test-ab" };
  const metadata = { id: "test-ab", kind: "shared", name: "A–B", ownerUid: "test-a", memberUids: ["test-a", "test-b"] };
  const event = { id: "private-note", uid: "test-a", title: "Lịch riêng", description: "", location: "", startAt: Timestamp.fromMillis(100), endAt: Timestamp.fromMillis(200) };

  it("restricts discovery to the viewer and rejects cached or uncommitted ACLs", () => {
    const onChange = vi.fn();
    const onPending = vi.fn();
    watchCalendars("test-group", "test-a", onChange, vi.fn(), onPending);
    const listener = io.listeners[0];
    expect(listener.query.constraints).toContainEqual({ where: ["memberUids", "array-contains", "test-a"] });
    expect(listener.options.includeMetadataChanges).toBe(true);
    listener.next(snapshot([metadata], { fromCache: true }));
    listener.next(snapshot([metadata], { hasPendingWrites: true }));
    expect(onChange).not.toHaveBeenCalled();
    expect(onPending).toHaveBeenCalledTimes(1);
    listener.next(snapshot([metadata]));
    expect(onChange).toHaveBeenLastCalledWith([metadata]);
    listener.next(snapshot([]));
    expect(onChange).toHaveBeenLastCalledWith([]);
  });

  it("keeps private event content out of the UI until the server confirms it", () => {
    const onChange = vi.fn();
    const onPending = vi.fn();
    watchCalendarWeek("test-group", shared, 0, 1000, onChange, vi.fn(), onPending);
    const listener = io.listeners[0];
    expect(listener.query.path).toBe("groups/test-group/calendars/test-ab/entries");
    listener.next(snapshot([event], { fromCache: true }));
    expect(onChange).not.toHaveBeenCalled();
    expect(onPending).toHaveBeenCalledOnce();
    listener.next(snapshot([event]));
    expect(onChange.mock.calls[0][0]).toEqual([expect.objectContaining({ id: "private-note", calendar: shared, startAt: 100, endAt: 200 })]);
  });

  it("continues reading the common calendar from its legacy collection", () => {
    watchCalendarWeek("test-group", { kind: "group", id: "group" }, 0, 1000, vi.fn(), vi.fn());
    expect(io.listeners[0].query.path).toBe("groups/test-group/calendarEntries");
  });
});
