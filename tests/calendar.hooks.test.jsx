import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ watch: vi.fn() }));
vi.mock("../src/services/calendar.service", () => ({ watchCalendarWeek: mocks.watch }));
import { useCalendarWeek } from "../src/hooks/useCalendarWeek";

const group = { kind: "group", id: "group", name: "Cả nhóm", ownerUid: "", memberUids: [] };
const shared = { kind: "shared", id: "ab", name: "A–B", ownerUid: "test-a", memberUids: ["test-a", "test-b"] };
const event = { id: "secret", uid: "test-a", calendar: shared, title: "Nội dung riêng", startAt: 100, endAt: 200 };
let listeners;

beforeEach(() => {
  listeners = [];
  mocks.watch.mockReset();
  mocks.watch.mockImplementation((groupId, calendar, start, end, onChange, onError, onPending) => {
    const listener = { groupId, calendar, start, end, onChange, onError, onPending, stop: vi.fn() };
    listeners.push(listener);
    return listener.stop;
  });
});
afterEach(cleanup);

function setup(calendars = [group, shared]) {
  return renderHook(
    ({ uid, list, start }) => useCalendarWeek("test-group", uid, list, start, start + 1000),
    { initialProps: { uid: "test-a", list: calendars, start: 0 } },
  );
}

describe("calendar subscriptions do not retain another access context", () => {
  it("waits for every authorized calendar before exposing the aggregate", () => {
    const { result } = setup();
    act(() => listeners[0].onChange([]));
    expect(result.current.ready).toBe(false);
    act(() => listeners[1].onChange([event]));
    expect(result.current.ready).toBe(true);
    expect(result.current.entries).toEqual([event]);
  });

  it("clears private content on viewer change and ignores a late old callback", () => {
    const { result, rerender } = setup();
    act(() => { listeners[0].onChange([]); listeners[1].onChange([event]); });
    const previous = listeners.slice();
    rerender({ uid: "test-c", list: [group], start: 0 });
    expect(result.current.entries).toEqual([]);
    expect(result.current.ready).toBe(false);
    expect(previous.every((item) => item.stop.mock.calls.length === 1)).toBe(true);
    act(() => previous[1].onChange([event]));
    expect(result.current.entries).toEqual([]);
    act(() => listeners.at(-1).onChange([]));
    expect(result.current.ready).toBe(true);
    expect(result.current.entries).toEqual([]);
  });

  it("removes content when calendar membership is revoked", () => {
    const { result, rerender } = setup();
    act(() => { listeners[0].onChange([]); listeners[1].onChange([event]); });
    const revoked = listeners[1];
    rerender({ uid: "test-a", list: [group], start: 0 });
    expect(result.current.entries).toEqual([]);
    expect(revoked.stop).toHaveBeenCalledOnce();
    act(() => revoked.onChange([event]));
    expect(result.current.entries).toEqual([]);
  });

  it("clears ready data when the server cannot authorize a listener", () => {
    const { result } = setup();
    act(() => { listeners[0].onChange([]); listeners[1].onChange([event]); });
    act(() => listeners[1].onError(new Error("Không còn quyền xem lịch.")));
    expect(result.current.entries).toEqual([]);
    expect(result.current.ready).toBe(false);
    expect(result.current.error).toContain("Không còn quyền");
  });

  it("hides cached-only data until a fresh server response arrives", () => {
    const { result } = setup();
    act(() => { listeners[0].onChange([]); listeners[1].onChange([event]); });
    act(() => listeners[1].onPending());
    expect(result.current.entries).toEqual([]);
    expect(result.current.ready).toBe(false);
    act(() => listeners[1].onChange([event]));
    expect(result.current.ready).toBe(true);
  });

  it("does not treat a newly selected week as loaded", () => {
    const { result, rerender } = setup([group]);
    act(() => listeners[0].onChange([]));
    expect(result.current.ready).toBe(true);
    rerender({ uid: "test-a", list: [group], start: 2000 });
    expect(result.current.ready).toBe(false);
    expect(result.current.entries).toEqual([]);
  });
});
