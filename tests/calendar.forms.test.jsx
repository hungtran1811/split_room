import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const actions = vi.hoisted(() => ({ create: vi.fn(), update: vi.fn(), move: vi.fn(), events: vi.fn(), toast: vi.fn() }));
vi.mock("../src/services/calendar-catalog.service", () => ({ createSharedCalendar: actions.create, updateSharedCalendar: actions.update }));
vi.mock("../src/services/calendar.service", () => ({ createCalendarEntries: actions.events, updateCalendarEntry: vi.fn(), deleteCalendarEntry: vi.fn(), moveCalendarEntry: actions.move }));
vi.mock("../src/shared/ui/MemberAvatar", () => ({ MemberAvatar: () => null }));
vi.mock("../src/shared/ui/Toast", () => ({ useToast: () => ({ showToast: actions.toast }) }));
import { CalendarManagerSheet } from "../src/features/calendar/CalendarManagerSheet";
import { CalendarEntrySheet } from "../src/features/calendar/CalendarEntrySheet";
import { calendarKey } from "../src/domain/calendar/access";
import { vnDateTimeLocalToMs } from "../src/domain/calendar/tz";

const members = ["a", "b", "c", "d"].map((key) => ({ uid: `test-${key}`, id: `test-${key}`, memberId: `test-${key}`, displayName: key.toUpperCase() }));
const labelOf = (id) => `Thành viên ${id.slice(-1).toUpperCase()}`;
const group = { kind: "group", id: "group", name: "Cả nhóm", ownerUid: "", memberUids: [] };
const personal = { kind: "private", id: "private_test-a", name: "Cá nhân", ownerUid: "test-a", memberUids: ["test-a"] };
const shared = { kind: "shared", id: "ab", name: "A–B", ownerUid: "test-a", memberUids: ["test-a", "test-b"] };
const managerProps = { open: true, onClose: vi.fn(), groupId: "test-group", uid: "test-a", members, labelOf };
beforeEach(() => { vi.clearAllMocks(); actions.events.mockResolvedValue({ added: 1, failed: 0 }); actions.move.mockResolvedValue("moved"); });
afterEach(cleanup);

describe("calendar audience controls", () => {
  it("locks the creator in the audience and requires another member for a new shared calendar", async () => {
    render(<CalendarManagerSheet {...managerProps} />);
    expect(screen.getByRole("checkbox", { name: /Thành viên A/ }).disabled).toBe(true);
    fireEvent.change(screen.getByLabelText("Tên lịch"), { target: { value: "Kế hoạch A–B" } });
    fireEvent.click(screen.getByRole("button", { name: "Tạo lịch" }));
    expect(actions.create).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("checkbox", { name: "Thành viên B" }));
    fireEvent.click(screen.getByRole("button", { name: "Tạo lịch" }));
    await waitFor(() => expect(actions.create).toHaveBeenCalledWith("test-group", "test-a", "Kế hoạch A–B", ["test-a", "test-b"]));
  });

  it("requires the history warning to be confirmed before changing viewers", async () => {
    render(<CalendarManagerSheet {...managerProps} calendar={shared} />);
    fireEvent.click(screen.getByRole("checkbox", { name: "Thành viên C" }));
    fireEvent.click(screen.getByRole("button", { name: "Lưu thay đổi" }));
    expect(actions.update).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog", { name: "Thay đổi người xem của toàn bộ lịch?" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Lưu người xem" }));
    await waitFor(() => expect(actions.update).toHaveBeenCalledWith("test-group", "ab", "A–B", ["test-a", "test-b", "test-c"]));
  });

  it("lets a contributor inspect the audience but not manage it", () => {
    render(<CalendarManagerSheet {...managerProps} uid="test-b" calendar={shared} />);
    expect(screen.getByLabelText("Tên lịch").disabled).toBe(true);
    expect(screen.queryByRole("button", { name: "Lưu thay đổi" })).toBeNull();
  });

  it("preserves name and audience drafts across equivalent catalog snapshots, then resets on reopen", () => {
    const { rerender } = render(<CalendarManagerSheet {...managerProps} calendar={shared} />);
    fireEvent.change(screen.getByLabelText("Tên lịch"), { target: { value: "Tên đang chỉnh sửa" } });
    fireEvent.click(screen.getByRole("checkbox", { name: "Thành viên C" }));
    const snapshot = { ...shared, memberUids: [...shared.memberUids] };
    rerender(<CalendarManagerSheet {...managerProps} calendar={snapshot} />);
    expect(screen.getByLabelText("Tên lịch").value).toBe("Tên đang chỉnh sửa");
    expect(screen.getByRole("checkbox", { name: "Thành viên C" }).checked).toBe(true);
    rerender(<CalendarManagerSheet {...managerProps} open={false} calendar={snapshot} />);
    rerender(<CalendarManagerSheet {...managerProps} calendar={snapshot} />);
    expect(screen.getByLabelText("Tên lịch").value).toBe(shared.name);
    expect(screen.getByRole("checkbox", { name: "Thành viên C" }).checked).toBe(false);
  });
});

const event = { id: "event-a", calendar: group, uid: "test-a", title: "Sự kiện riêng", description: "Chi tiết", location: "", startAt: vnDateTimeLocalToMs("2026-09-21T08:00"), endAt: vnDateTimeLocalToMs("2026-09-21T09:00") };
const editorProps = { open: true, onClose: vi.fn(), groupId: "test-group", uid: "test-a", weekEntries: [event], selectedYmd: "2026-09-21", canEdit: true, calendars: [group, personal, shared], defaultCalendar: personal, members, labelOf };

describe("event audience and ownership", () => {
  it("uses the selected default calendar for a new event", async () => {
    render(<CalendarEntrySheet {...editorProps} />);
    expect(screen.getByLabelText("Thuộc lịch").value).toBe(calendarKey(personal));
    fireEvent.change(screen.getByPlaceholderText("Thêm tiêu đề"), { target: { value: "Lịch cá nhân mới" } });
    fireEvent.click(screen.getByRole("button", { name: "Lưu" }));
    await waitFor(() => expect(actions.events).toHaveBeenCalledWith("test-group", expect.objectContaining(personal), "test-a", expect.any(Array)));
  });

  it("moves an author's event through the atomic service when changing calendar", async () => {
    render(<CalendarEntrySheet {...editorProps} entry={event} />);
    fireEvent.change(screen.getByLabelText("Thuộc lịch"), { target: { value: calendarKey(personal) } });
    fireEvent.click(screen.getByRole("button", { name: "Lưu" }));
    await waitFor(() => expect(actions.move).toHaveBeenCalledWith("test-group", group, expect.objectContaining(personal), "event-a", expect.objectContaining({ title: "Sự kiện riêng" })));
  });

  it("does not expose edit/delete actions for someone else's event", () => {
    render(<CalendarEntrySheet {...editorProps} entry={{ ...event, uid: "test-b", calendar: shared }} />);
    expect(screen.getByPlaceholderText("Thêm tiêu đề").disabled).toBe(true);
    expect(screen.queryByRole("button", { name: "Xóa" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Lưu" })).toBeNull();
  });

  it("preserves the event draft and private destination across equivalent week snapshots, then resets on reopen", () => {
    const { rerender } = render(<CalendarEntrySheet {...editorProps} entry={event} />);
    fireEvent.change(screen.getByLabelText("Tiêu đề"), { target: { value: "Nội dung đang chỉnh sửa" } });
    fireEvent.change(screen.getByLabelText("Mô tả"), { target: { value: "Ghi chú chưa lưu" } });
    fireEvent.change(screen.getByLabelText("Thuộc lịch"), { target: { value: calendarKey(personal) } });
    const snapshot = { ...event, calendar: { ...group } };
    rerender(<CalendarEntrySheet {...editorProps} entry={snapshot} weekEntries={[snapshot]} />);
    expect(screen.getByLabelText("Tiêu đề").value).toBe("Nội dung đang chỉnh sửa");
    expect(screen.getByLabelText("Mô tả").value).toBe("Ghi chú chưa lưu");
    expect(screen.getByLabelText("Thuộc lịch").value).toBe(calendarKey(personal));
    rerender(<CalendarEntrySheet {...editorProps} open={false} entry={snapshot} />);
    rerender(<CalendarEntrySheet {...editorProps} entry={snapshot} />);
    expect(screen.getByLabelText("Tiêu đề").value).toBe(event.title);
    expect(screen.getByLabelText("Thuộc lịch").value).toBe(calendarKey(group));
  });
});
