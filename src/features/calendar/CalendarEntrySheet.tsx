import { useEffect, useState } from "react";
import { BottomSheet } from "../../shared/ui/BottomSheet";
import { Button } from "../../shared/ui/Button";
import { ConfirmDialog } from "../../shared/ui/ConfirmDialog";
import {
  hasSelfOverlap,
  TITLE_MAX,
  DESCRIPTION_MAX,
  LOCATION_MAX,
  validateCalendarEntryInput,
} from "../../domain/calendar/validate";
import {
  msToVnDateTimeLocal,
  todayYmdVn,
  utcMsToVnParts,
  vnDateTimeLocalToMs,
} from "../../domain/calendar/tz";
import type { CalendarEntry } from "../../domain/calendar/types";
import {
  createCalendarEntry,
  deleteCalendarEntry,
  updateCalendarEntry,
} from "../../services/calendar.service";
import { useToast } from "../../shared/ui/Toast";

type CalendarEntrySheetProps = {
  open: boolean;
  onClose: () => void;
  groupId: string;
  uid: string;
  weekEntries: CalendarEntry[];
  selectedYmd: string;
  entry?: CalendarEntry | null;
  canEdit: boolean;
};

function roundNextHalfHourLocal(ymd: string, now: number): { start: string; end: string } {
  const today = todayYmdVn(now);
  if (ymd !== today) {
    return { start: `${ymd}T08:00`, end: `${ymd}T09:00` };
  }
  const parts = utcMsToVnParts(now);
  let hour = parts.hour;
  let minute = parts.minute < 30 ? 30 : 0;
  if (parts.minute >= 30) hour += 1;
  if (hour >= 24) {
    return { start: `${ymd}T23:00`, end: `${ymd}T23:59` };
  }
  const startHour = hour;
  const startMin = minute;
  let endHour = startMin === 30 ? startHour + 1 : startHour;
  let endMin = startMin === 30 ? 0 : 30;
  if (endHour >= 24) {
    endHour = 23;
    endMin = 59;
  }
  const pad = (value: number) => String(value).padStart(2, "0");
  return {
    start: `${ymd}T${pad(startHour)}:${pad(startMin)}`,
    end: `${ymd}T${pad(endHour)}:${pad(endMin)}`,
  };
}

export function CalendarEntrySheet({
  open,
  onClose,
  groupId,
  uid,
  weekEntries,
  selectedYmd,
  entry,
  canEdit,
}: CalendarEntrySheetProps) {
  const { showToast } = useToast();
  const isOwner = Boolean(entry && entry.uid === uid);
  const editable = canEdit && (!entry || isOwner);
  const [title, setTitle] = useState("");
  const [startLocal, setStartLocal] = useState("");
  const [endLocal, setEndLocal] = useState("");
  const [description, setDescription] = useState("");
  const [location, setLocation] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (entry) {
      setTitle(entry.title);
      setStartLocal(msToVnDateTimeLocal(entry.startAt));
      setEndLocal(msToVnDateTimeLocal(entry.endAt));
      setDescription(entry.description);
      setLocation(entry.location);
    } else {
      const range = roundNextHalfHourLocal(selectedYmd, Date.now());
      setTitle("");
      setStartLocal(range.start);
      setEndLocal(range.end);
      setDescription("");
      setLocation("");
    }
    setError("");
  }, [open, entry, selectedYmd]);

  const startAt = vnDateTimeLocalToMs(startLocal);
  const endAt = vnDateTimeLocalToMs(endLocal);
  const overlap =
    startAt !== null &&
    endAt !== null &&
    hasSelfOverlap(weekEntries, uid, { startAt, endAt }, entry?.id);

  async function handleSave() {
    if (!editable) return;
    setError("");
    const startMs = vnDateTimeLocalToMs(startLocal);
    const endMs = vnDateTimeLocalToMs(endLocal);
    const checked = validateCalendarEntryInput({
      title,
      description,
      location,
      startAt: startMs ?? NaN,
      endAt: endMs ?? NaN,
    });
    if (!checked.ok) {
      setError(checked.error);
      return;
    }

    setSaving(true);
    try {
      if (entry) {
        await updateCalendarEntry(groupId, entry.id, checked);
        showToast({ title: "Đã lưu", message: "Đã cập nhật lịch bận.", variant: "success" });
      } else {
        await createCalendarEntry(groupId, uid, checked);
        showToast({ title: "Đã lưu", message: "Đã thêm lịch bận.", variant: "success" });
      }
      onClose();
    } catch (err) {
      setError((err as { message?: string }).message || "Không lưu được lịch.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!entry || !isOwner) return;
    setSaving(true);
    try {
      await deleteCalendarEntry(groupId, entry.id);
      showToast({ title: "Đã xóa", message: "Đã xóa lịch bận.", variant: "success" });
      setConfirmDelete(false);
      onClose();
    } catch (err) {
      setError((err as { message?: string }).message || "Không xóa được lịch.");
      setConfirmDelete(false);
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <BottomSheet
        open={open}
        onClose={onClose}
        title={entry ? (editable ? "Sửa lịch bận" : "Chi tiết lịch bận") : "Thêm lịch bận"}
        footer={
          editable ? (
            <div className="cal-sheet-footer">
              {entry && isOwner ? (
                <Button variant="danger" onClick={() => setConfirmDelete(true)} disabled={saving}>
                  Xóa
                </Button>
              ) : (
                <span />
              )}
              <Button variant="primary" onClick={() => void handleSave()} disabled={saving}>
                {saving ? "Đang lưu..." : "Lưu"}
              </Button>
            </div>
          ) : undefined
        }
      >
        <div className="form-grid">
          <div className="form-field">
            <label className="form-label" htmlFor="calTitle">
              Tiêu đề
            </label>
            <input
              id="calTitle"
              className="form-input"
              value={title}
              maxLength={TITLE_MAX}
              disabled={!editable}
              onChange={(event) => setTitle(event.target.value)}
            />
          </div>
          <div className="form-field">
            <label className="form-label" htmlFor="calStart">
              Bắt đầu
            </label>
            <input
              id="calStart"
              type="datetime-local"
              className="form-input"
              step={60}
              value={startLocal}
              disabled={!editable}
              onChange={(event) => setStartLocal(event.target.value)}
            />
          </div>
          <div className="form-field">
            <label className="form-label" htmlFor="calEnd">
              Kết thúc
            </label>
            <input
              id="calEnd"
              type="datetime-local"
              className="form-input"
              step={60}
              value={endLocal}
              disabled={!editable}
              onChange={(event) => setEndLocal(event.target.value)}
            />
          </div>
          <div className="form-field">
            <label className="form-label" htmlFor="calLocation">
              Địa điểm (không bắt buộc)
            </label>
            <input
              id="calLocation"
              className="form-input"
              value={location}
              maxLength={LOCATION_MAX}
              disabled={!editable}
              onChange={(event) => setLocation(event.target.value)}
            />
          </div>
          <div className="form-field">
            <label className="form-label" htmlFor="calDesc">
              Mô tả
            </label>
            <textarea
              id="calDesc"
              className="form-input cal-textarea"
              rows={4}
              value={description}
              maxLength={DESCRIPTION_MAX}
              disabled={!editable}
              onChange={(event) => setDescription(event.target.value)}
            />
          </div>
          {overlap ? (
            <div className="cal-warn">
              Lịch này trùng giờ với lịch bận khác của bạn. Vẫn có thể lưu.
            </div>
          ) : null}
          <div className="form-error">{error}</div>
        </div>
      </BottomSheet>

      <ConfirmDialog
        open={confirmDelete}
        title="Xóa lịch bận?"
        description="Thao tác này xóa toàn bộ lịch, kể cả phần qua đêm."
        confirmLabel="Xóa"
        confirmVariant="danger"
        pending={saving}
        onCancel={() => setConfirmDelete(false)}
        onConfirm={() => void handleDelete()}
      />
    </>
  );
}
