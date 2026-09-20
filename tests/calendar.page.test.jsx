import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const context = vi.hoisted(() => ({ session: null, catalog: null, live: null }));
vi.mock("../src/app/SessionContext", () => ({ useSession: () => context.session }));
vi.mock("../src/hooks/useCalendars", () => ({ useCalendars: () => context.catalog }));
vi.mock("../src/hooks/useCalendarWeek", () => ({ useCalendarWeek: () => context.live }));
vi.mock("../src/hooks/useMemberLabel", () => ({ useMemberLabel: () => (id) => id === "test-a" ? "Thành viên A" : "Thành viên B" }));
vi.mock("../src/shared/ui/MemberAvatar", () => ({ MemberAvatar: () => null }));
vi.mock("../src/shared/ui/Toast", () => ({ useToast: () => ({ showToast: vi.fn() }) }));
vi.mock("../src/services/calendar.service", () => ({ createCalendarEntries: vi.fn(), updateCalendarEntry: vi.fn(), deleteCalendarEntry: vi.fn(), moveCalendarEntry: vi.fn(), previewCopyFromPreviousWeek: vi.fn(), copyPreviousWeekEntries: vi.fn() }));
vi.mock("../src/services/calendar-catalog.service", () => ({ createSharedCalendar: vi.fn(), updateSharedCalendar: vi.fn() }));
import { CalendarPage } from "../src/pages/CalendarPage";
import { currentWeekStartYmd, weekBounds } from "../src/domain/calendar/week";

const personal = { id: "private_test-a", kind: "private", name: "Cá nhân", ownerUid: "test-a", memberUids: ["test-a"] };
const group = { id: "group", kind: "group", name: "Cả nhóm", ownerUid: "", memberUids: [] };
const shared = { id: "ab", kind: "shared", name: "Lịch bí mật A–B", ownerUid: "test-b", memberUids: ["test-a", "test-b"] };
beforeEach(() => {
  vi.stubGlobal("matchMedia", () => ({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() }));
  context.session = { user: { uid: "test-a" }, groupId: "test-group", members: ["test-a", "test-b"].map((uid) => ({ id: uid, uid, memberId: uid })) };
  context.catalog = { ready: true, error: "", calendars: [group, personal, shared] };
  const startAt = weekBounds(currentWeekStartYmd()).startMs + 9 * 3600000;
  context.live = { ready: true, error: "", entries: [{ id: "secret", calendar: shared, uid: "test-b", title: "Nội dung riêng A–B", description: "Ghi chú kín", location: "", startAt, endAt: startAt + 3600000 }] };
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("calendar page access changes", () => {
  it("closes a visible event when its calendar is revoked without opening a create form", () => {
    const { rerender } = render(<CalendarPage />);
    fireEvent.click(screen.getByRole("button", { name: /Nội dung riêng A–B/ }));
    expect(screen.getByDisplayValue("Ghi chú kín")).toBeTruthy();
    context.catalog = { ...context.catalog, calendars: [group, personal] };
    context.live = { ...context.live, entries: [] };
    rerender(<CalendarPage />);
    expect(screen.queryByDisplayValue("Ghi chú kín")).toBeNull();
    expect(screen.queryByRole("option", { name: "Lịch bí mật A–B" })).toBeNull();
    expect(screen.queryByRole("heading", { name: "Thêm lịch bận" })).toBeNull();
  });

  it("unmounts private details while access is awaiting server confirmation", () => {
    const { rerender } = render(<CalendarPage />);
    fireEvent.click(screen.getByRole("button", { name: /Nội dung riêng A–B/ }));
    context.catalog = { calendars: [], ready: false, error: "" };
    context.live = { entries: [], ready: false, error: "" };
    rerender(<CalendarPage />);
    expect(screen.queryByDisplayValue("Ghi chú kín")).toBeNull();
    expect(screen.getByText(/Đang xác nhận quyền truy cập/)).toBeTruthy();
  });

  it("clears an unfinished private draft when switching accounts", () => {
    const { rerender } = render(<CalendarPage />);
    fireEvent.click(screen.getByRole("button", { name: "Thêm" }));
    fireEvent.change(screen.getByPlaceholderText("Thêm tiêu đề"), { target: { value: "Bản nháp riêng tư" } });
    context.session = { ...context.session, user: { uid: "test-b" } };
    context.catalog = { calendars: [], ready: false, error: "" };
    context.live = { entries: [], ready: false, error: "" };
    rerender(<CalendarPage />);
    expect(screen.queryByDisplayValue("Bản nháp riêng tư")).toBeNull();
  });
});
