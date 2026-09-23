import React from "react";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const actions = vi.hoisted(() => ({ preview: vi.fn(), remove: vi.fn(), toast: vi.fn() }));
vi.mock("../src/services/calendar.service", () => ({
  previewCalendarDeletion: actions.preview,
  deleteCalendarEntries: actions.remove,
  createCalendarEntries: vi.fn(),
  updateCalendarEntry: vi.fn(),
  moveCalendarEntry: vi.fn(),
}));
vi.mock("../src/shared/ui/Toast", () => ({ useToast: () => ({ showToast: actions.toast }) }));
vi.mock("../src/shared/ui/MemberAvatar", () => ({ MemberAvatar: () => null }));

import { CalendarDeleteDialog } from "../src/features/calendar/CalendarDeleteDialog";
import { CalendarEntrySheet } from "../src/features/calendar/CalendarEntrySheet";
import { vnDateTimeLocalToMs } from "../src/domain/calendar/tz";

const calendar = { kind: "shared", id: "test-ab", name: "Lịch A–B", ownerUid: "test-a", memberUids: ["test-a", "test-b"] };
const event = {
  id: "night", calendar, uid: "test-a", title: "Ca tối", description: "Ghi chú đã lưu", location: "",
  startAt: vnDateTimeLocalToMs("2026-09-21T22:00"), endAt: vnDateTimeLocalToMs("2026-09-22T06:00"),
};
const next = { ...event, id: "night-tomorrow", startAt: event.startAt + 86400000, endAt: event.endAt + 86400000 };
const nextWeek = { ...event, id: "night-next-week", startAt: event.startAt + 7 * 86400000, endAt: event.endAt + 7 * 86400000 };
const props = { groupId: "test-group", uid: "test-a", entry: event, calendarName: calendar.name, onCancel: vi.fn(), onDeleted: vi.fn() };
const sheetProps = {
  open: true, onClose: vi.fn(), groupId: "test-group", uid: "test-a", entry: event,
  weekEntries: [event], calendars: [calendar], defaultCalendar: calendar, members: [], labelOf: (id) => id,
  selectedYmd: "2026-09-21", canEdit: true,
};
const preview = (scope = "one", entries = [event]) => ({ anchor: event, scope, entries });
const deferred = () => {
  let resolve;
  let reject;
  const promise = new Promise((ok, fail) => { resolve = ok; reject = fail; });
  return { promise, resolve, reject };
};

beforeEach(() => {
  vi.clearAllMocks();
  actions.preview.mockImplementation(async (_group, _calendar, _uid, _id, scope) => preview(scope));
  actions.remove.mockResolvedValue(1);
});
afterEach(cleanup);

describe("calendar deletion choices", () => {
  it("defaults to one occurrence, waits for the server and shows both overnight dates", async () => {
    const pending = deferred();
    actions.preview.mockReturnValue(pending.promise);
    render(<CalendarDeleteDialog {...props} />);
    expect(screen.getByRole("radio", { name: "Chỉ lần này" }).checked).toBe(true);
    expect(screen.getByRole("button", { name: "Xóa 0 lịch bận" }).disabled).toBe(true);
    expect(actions.preview).toHaveBeenCalledWith("test-group", { kind: "shared", id: "test-ab" }, "test-a", "night", "one");
    await act(async () => { pending.resolve(preview()); });
    const list = screen.getByRole("list", { name: "Lịch bận sẽ xóa" });
    expect(list.textContent).toContain("21/9/2026 · 22:00 – 06:00, Thứ Ba, 22/9/2026");
    expect(screen.getByText("Thuộc lịch: Lịch A–B")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Xóa 1 lịch bận" }).disabled).toBe(false);
  });

  it("refreshes daily and weekly choices and ignores a late response for the old choice", async () => {
    const daily = deferred();
    actions.preview.mockImplementation(async (_group, _calendar, _uid, _id, scope) => scope === "following-days" ? daily.promise : preview(scope, scope === "following-weeks" ? [event, nextWeek] : [event]));
    render(<CalendarDeleteDialog {...props} />);
    await screen.findByRole("button", { name: "Xóa 1 lịch bận" });
    fireEvent.click(screen.getByRole("radio", { name: "Lần này và các ngày kế tiếp" }));
    expect(screen.getByRole("button", { name: "Xóa 0 lịch bận" }).disabled).toBe(true);
    fireEvent.click(screen.getByRole("radio", { name: "Lần này và các tuần kế tiếp" }));
    await screen.findByRole("button", { name: "Xóa 2 lịch bận" });
    await act(async () => { daily.resolve(preview("following-days", [event, next, nextWeek])); });
    expect(screen.queryByRole("button", { name: "Xóa 3 lịch bận" })).toBeNull();
    expect(actions.preview).toHaveBeenLastCalledWith("test-group", expect.any(Object), "test-a", "night", "following-weeks");
    fireEvent.click(screen.getByRole("button", { name: "Xóa 2 lịch bận" }));
    await waitFor(() => expect(actions.remove).toHaveBeenCalledWith("test-group", calendar, "test-a", preview("following-weeks", [event, nextWeek])));
  });

  it("keeps preview failures visible and only enables deletion after a successful refresh", async () => {
    actions.preview.mockRejectedValueOnce(new Error("Không kết nối được máy chủ."));
    render(<CalendarDeleteDialog {...props} />);
    expect(await screen.findByRole("alert")).toHaveProperty("textContent", "Không kết nối được máy chủ.");
    expect(screen.getByRole("button", { name: "Xóa 0 lịch bận" }).disabled).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Làm mới danh sách" }));
    await screen.findByRole("button", { name: "Xóa 1 lịch bận" });
    expect(screen.queryByRole("alert")).toBeNull();
    expect(props.onCancel).not.toHaveBeenCalled();
  });

  it("requires a fresh preview after deletion fails and does not close the dialog", async () => {
    actions.remove.mockRejectedValueOnce(new Error("Lịch đã thay đổi. Hãy kiểm tra lại."));
    render(<CalendarDeleteDialog {...props} />);
    fireEvent.click(await screen.findByRole("button", { name: "Xóa 1 lịch bận" }));
    expect(await screen.findByRole("alert")).toHaveProperty("textContent", "Lịch đã thay đổi. Hãy kiểm tra lại.");
    expect(screen.getByRole("button", { name: "Xóa 0 lịch bận" }).disabled).toBe(true);
    expect(props.onDeleted).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Làm mới danh sách" }));
    expect((await screen.findByRole("button", { name: "Xóa 1 lịch bận" })).disabled).toBe(false);
  });

  it("disables an empty preview and never submits it", async () => {
    actions.preview.mockResolvedValue(preview("one", []));
    render(<CalendarDeleteDialog {...props} />);
    await screen.findByText("Không có lịch bận phù hợp để xóa.");
    fireEvent.click(screen.getByRole("button", { name: "Xóa 0 lịch bận" }));
    expect(actions.remove).not.toHaveBeenCalled();
  });

  it("ignores preview responses from an earlier account/event and completion after unmount", async () => {
    const stale = deferred();
    const deletion = deferred();
    actions.preview.mockReturnValueOnce(stale.promise);
    const { rerender, unmount } = render(<CalendarDeleteDialog {...props} />);
    const other = { ...event, id: "other", uid: "test-b" };
    actions.preview.mockResolvedValue({ anchor: other, scope: "one", entries: [other] });
    rerender(<CalendarDeleteDialog {...props} uid="test-b" entry={other} />);
    await screen.findByRole("button", { name: "Xóa 1 lịch bận" });
    await act(async () => { stale.resolve(preview("one", [event, next])); });
    expect(screen.queryByRole("button", { name: "Xóa 2 lịch bận" })).toBeNull();
    actions.remove.mockReturnValue(deletion.promise);
    fireEvent.click(screen.getByRole("button", { name: "Xóa 1 lịch bận" }));
    expect(actions.remove).toHaveBeenCalledWith("test-group", calendar, "test-b", { anchor: other, scope: "one", entries: [other] });
    expect(screen.getByRole("button", { name: "Hủy" }).disabled).toBe(true);
    unmount();
    await act(async () => { deletion.resolve(1); });
    expect(props.onDeleted).not.toHaveBeenCalled();
  });
});

describe("event editor deletion integration", () => {
  it("uses saved source data, resets choice on reopening and closes with a bulk success toast", async () => {
    actions.preview.mockImplementation(async (_group, _calendar, _uid, _id, scope) => preview(scope, scope === "following-days" ? [event, next] : [event]));
    actions.remove.mockResolvedValue(2);
    render(<CalendarEntrySheet {...sheetProps} />);
    fireEvent.change(screen.getByLabelText("Tiêu đề"), { target: { value: "Bản nháp chưa lưu" } });
    fireEvent.click(screen.getByRole("button", { name: "Xóa" }));
    const dialog = screen.getByRole("dialog", { name: "Xóa lịch bận" });
    expect(within(dialog).getByText("Ca tối")).toBeTruthy();
    expect(within(dialog).queryByText("Bản nháp chưa lưu")).toBeNull();
    fireEvent.click(screen.getByRole("radio", { name: "Lần này và các ngày kế tiếp" }));
    await screen.findByRole("button", { name: "Xóa 2 lịch bận" });
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog", { name: "Xóa lịch bận" })).toBeNull();
    expect(sheetProps.onClose).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Xóa" }));
    expect(screen.getByRole("radio", { name: "Chỉ lần này" }).checked).toBe(true);
    fireEvent.click(screen.getByRole("radio", { name: "Lần này và các ngày kế tiếp" }));
    fireEvent.click(await screen.findByRole("button", { name: "Xóa 2 lịch bận" }));
    await waitFor(() => expect(sheetProps.onClose).toHaveBeenCalledTimes(1));
    expect(actions.toast).toHaveBeenCalledWith({ title: "Đã xóa", message: "Đã xóa 2 lịch bận.", variant: "success" });
  });

  it("does not show deletion controls for another author's event", () => {
    render(<CalendarEntrySheet {...sheetProps} entry={{ ...event, uid: "test-b" }} />);
    expect(screen.queryByRole("button", { name: "Xóa" })).toBeNull();
    expect(actions.preview).not.toHaveBeenCalled();
  });
});
