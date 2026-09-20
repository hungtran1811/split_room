import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const service = vi.hoisted(() => ({ ensure: vi.fn(), watch: vi.fn() }));
vi.mock("../src/services/calendar-catalog.service", () => ({ ensurePrivateCalendar: service.ensure, watchCalendars: service.watch }));
import { useCalendars } from "../src/hooks/useCalendars";
const personal = { id: "private_test-a", kind: "private", name: "Cá nhân", ownerUid: "test-a", memberUids: ["test-a"] };
const shared = { id: "ab", kind: "shared", name: "A–B", ownerUid: "test-a", memberUids: ["test-a", "test-b"] };
let listeners;
beforeEach(() => {
  listeners = [];
  service.ensure.mockReset().mockResolvedValue(undefined);
  service.watch.mockReset().mockImplementation((group, uid, next, error, pending) => {
    const listener = { uid, next, error, pending, stop: vi.fn() };
    listeners.push(listener);
    return listener.stop;
  });
});
afterEach(cleanup);

describe("calendar catalog access lifecycle", () => {
  it("does not publish even a virtual calendar before server confirmation", async () => {
    const { result } = renderHook(() => useCalendars("test-group", "test-a"));
    await waitFor(() => expect(listeners).toHaveLength(1));
    expect(result.current.calendars).toEqual([]);
    expect(result.current.ready).toBe(false);
    act(() => listeners[0].next([shared, personal]));
    expect(result.current.ready).toBe(true);
    expect(result.current.calendars.map((c) => c.kind)).toEqual(["group", "private", "shared"]);
    act(() => listeners[0].pending());
    expect(result.current.calendars).toEqual([]);
    expect(result.current.ready).toBe(false);
  });

  it("clears a warm catalog on account switch before installing new subscriptions", async () => {
    const { result, rerender } = renderHook(({ uid }) => useCalendars("test-group", uid), { initialProps: { uid: "test-a" } });
    await waitFor(() => expect(listeners).toHaveLength(1));
    act(() => listeners[0].next([personal, shared]));
    const previous = listeners[0];
    rerender({ uid: "test-c" });
    expect(result.current.calendars).toEqual([]);
    expect(previous.stop).toHaveBeenCalledOnce();
    act(() => previous.next([personal, shared]));
    expect(result.current.calendars).toEqual([]);
    await waitFor(() => expect(listeners).toHaveLength(2));
    act(() => listeners[1].next([]));
    expect(result.current.calendars.map((c) => c.kind)).toEqual(["group"]);
  });

  it("drops the catalog when current group membership is revoked", async () => {
    const { result } = renderHook(() => useCalendars("test-group", "test-a"));
    await waitFor(() => expect(listeners).toHaveLength(1));
    act(() => listeners[0].next([personal, shared]));
    act(() => listeners[0].error(new Error("Không còn là thành viên nhóm.")));
    expect(result.current.calendars).toEqual([]);
    expect(result.current.ready).toBe(false);
    expect(result.current.error).toContain("Không còn");
  });
});
