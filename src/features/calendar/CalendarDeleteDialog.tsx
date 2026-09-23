import { useEffect, useRef, useState } from "react";
import { calendarEntryKey } from "../../domain/calendar/access";
import type { CalendarDeletePreview, CalendarDeleteScope } from "../../domain/calendar/delete";
import type { CalendarEntry } from "../../domain/calendar/types";
import { msToVnDateTimeLocal } from "../../domain/calendar/tz";
import { deleteCalendarEntries, previewCalendarDeletion } from "../../services/calendar.service";
import { formatViDate } from "../../shared/lib/date";
import { BottomSheet } from "../../shared/ui/BottomSheet";
import { Button } from "../../shared/ui/Button";

type CalendarDeleteDialogProps = {
  groupId: string;
  uid: string;
  entry: CalendarEntry;
  calendarName: string;
  onCancel: () => void;
  onDeleted: (count: number) => void;
};

const SCOPES: Array<{ value: CalendarDeleteScope; label: string }> = [
  { value: "one", label: "Chỉ lần này" },
  { value: "following-days", label: "Lần này và các ngày kế tiếp" },
  { value: "following-weeks", label: "Lần này và các tuần kế tiếp" },
];

function entryTimeLabel(entry: CalendarEntry): string {
  const [startDate, startTime] = msToVnDateTimeLocal(entry.startAt).split("T");
  const [endDate, endTime] = msToVnDateTimeLocal(entry.endAt).split("T");
  const end = endDate === startDate ? endTime : `${endTime}, ${formatViDate(endDate)}`;
  return `${formatViDate(startDate)} · ${startTime} – ${end}`;
}

// The parent mounts a fresh dialog for each account/event and each opening.
export function CalendarDeleteDialog({ groupId, uid, entry, calendarName, onCancel, onDeleted }: CalendarDeleteDialogProps) {
  const [scope, setScope] = useState<CalendarDeleteScope>("one");
  const [preview, setPreview] = useState<CalendarDeletePreview | null>(null);
  const [previewIdentity, setPreviewIdentity] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [reload, setReload] = useState(0);
  const alive = useRef(false);
  const identity = JSON.stringify([groupId, uid, calendarEntryKey(entry)]);
  const currentIdentity = useRef(identity);
  currentIdentity.current = identity;
  const { kind, id: calendarId } = entry.calendar;
  const entryId = entry.id;

  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; };
  }, []);

  useEffect(() => {
    let canceled = false;
    setPreview(null);
    setError("");
    setLoading(true);
    void previewCalendarDeletion(groupId, { kind, id: calendarId }, uid, entryId, scope)
      .then((result) => {
        if (!canceled) {
          setPreview(result);
          setPreviewIdentity(identity);
        }
      })
      .catch((err: unknown) => {
        if (!canceled) setError((err as { message?: string }).message || "Không tải được danh sách lịch bận cần xóa.");
      })
      .finally(() => { if (!canceled) setLoading(false); });
    return () => { canceled = true; };
  }, [groupId, uid, kind, calendarId, entryId, identity, scope, reload]);

  const currentPreview = previewIdentity === identity && preview?.scope === scope && calendarEntryKey(preview.anchor) === calendarEntryKey(entry) ? preview : null;
  const count = currentPreview?.entries.length || 0;

  async function handleDelete() {
    if (loading || saving || error || !currentPreview || !count) return;
    const requestIdentity = identity;
    setSaving(true);
    try {
      const deleted = await deleteCalendarEntries(groupId, entry.calendar, uid, currentPreview);
      if (alive.current && currentIdentity.current === requestIdentity) onDeleted(deleted);
    } catch (err) {
      if (alive.current && currentIdentity.current === requestIdentity) {
        setError((err as { message?: string }).message || "Không xóa được lịch bận.");
        setPreview(null);
      }
    } finally {
      if (alive.current && currentIdentity.current === requestIdentity) setSaving(false);
    }
  }

  return (
    <BottomSheet
      open
      title="Xóa lịch bận"
      onClose={() => { if (!saving) onCancel(); }}
      footer={
        <div className="cal-delete__actions">
          <Button variant="ghost" disabled={saving} onClick={onCancel}>Hủy</Button>
          <Button variant="danger" disabled={loading || saving || Boolean(error) || !count} onClick={() => void handleDelete()}>
            {saving ? "Đang xóa…" : `Xóa ${count} lịch bận`}
          </Button>
        </div>
      }
    >
      <div className="cal-delete">
        <p className="cal-delete__subject"><strong>{currentPreview?.anchor.title || entry.title}</strong><span>Thuộc lịch: {calendarName}</span></p>
        <fieldset className="cal-delete__scopes" disabled={saving}>
          <legend>Phạm vi xóa</legend>
          {SCOPES.map((option) => (
            <label key={option.value} className={scope === option.value ? "is-selected" : ""}>
              <input type="radio" name="calendar-delete-scope" value={option.value} autoFocus={option.value === "one"} checked={scope === option.value} onChange={() => setScope(option.value)} />
              <span>{option.label}</span>
            </label>
          ))}
        </fieldset>
        <div aria-live="polite" aria-busy={loading}>
          {loading ? <p role="status">Đang kiểm tra lịch bận đã lưu…</p> : null}
          {error ? <div className="cal-delete__error"><p className="form-error" role="alert">{error}</p><Button variant="ghost" disabled={saving} onClick={() => setReload((value) => value + 1)}>Làm mới danh sách</Button></div> : null}
          {!loading && !error && currentPreview ? (
            <>
              <p className="cal-delete__count">{count ? `${count} lịch bận sẽ bị xóa:` : "Không có lịch bận phù hợp để xóa."}</p>
              {count ? <ul className="cal-delete__list" aria-label="Lịch bận sẽ xóa">{currentPreview.entries.map((item) => <li key={calendarEntryKey(item)}>{entryTimeLabel(item)}</li>)}</ul> : null}
            </>
          ) : null}
        </div>
        <p className="cal-delete__explanation">
          {scope === "one"
            ? "Chỉ xóa lần được chọn, kể cả phần qua đêm."
            : `Tìm các lịch bận do bạn tạo trong cùng lịch, có cùng tiêu đề, giờ bắt đầu, thời lượng, mô tả và địa điểm đã lưu${scope === "following-weeks" ? ", vào cùng thứ mỗi tuần" : ""}. Bao gồm lần được chọn và các lần phù hợp sau đó; các lần trước đó được giữ lại.`}
          {scope !== "one" ? " Các lịch được tạo riêng nhưng có nội dung và giờ giống nhau cũng có thể nằm trong danh sách." : ""}
        </p>
        <p className="cal-delete__warning">Xóa sẽ áp dụng cho mọi người được xem lịch này và không thể hoàn tác. Nội dung đang sửa chưa lưu không được dùng để tìm lịch cần xóa.</p>
      </div>
    </BottomSheet>
  );
}
