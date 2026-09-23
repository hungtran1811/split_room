import { useEffect, useMemo, useRef, useState } from "react";
import { BottomSheet } from "../../shared/ui/BottomSheet";
import { Button } from "../../shared/ui/Button";
import {
  hasSelfOverlap,
  TITLE_MAX,
  DESCRIPTION_MAX,
  LOCATION_MAX,
  validateCalendarEntryInput,
} from "../../domain/calendar/validate";
import {
  addDaysYmd,
  mondayIndexOfYmd,
  msToVnDateTimeLocal,
  parseYmd,
  todayYmdVn,
  utcMsToVnParts,
  vnDateTimeLocalToMs,
  WEEKDAY_LONG_VI,
  WEEKDAY_SHORT_VI,
  ymdInTz,
} from "../../domain/calendar/tz";
import {
  clampRepeatCount,
  expandRepeatOccurrences,
  REPEAT_MAX,
  type RepeatFreq,
} from "../../domain/calendar/repeat";
import type { CalendarEntry, CalendarInfo, CalendarRef } from "../../domain/calendar/types";
import { calendarEntryKey, calendarKey, canEditCalendarEntry } from "../../domain/calendar/access";
import type { MemberProfile } from "../../core/roles";
import { CalendarAudience } from "./CalendarAudience";
import { CalendarDeleteDialog } from "./CalendarDeleteDialog";
import {
  createCalendarEntries,
  updateCalendarEntry,
  moveCalendarEntry,
} from "../../services/calendar.service";
import { formatViDateShort } from "../../shared/lib/date";
import { useToast } from "../../shared/ui/Toast";

type CalendarEntrySheetProps = {
  open: boolean;
  onClose: () => void;
  groupId: string;
  uid: string;
  weekEntries: CalendarEntry[];
  calendars: CalendarInfo[];
  defaultCalendar: CalendarRef;
  members: MemberProfile[];
  labelOf: (memberId: string) => string;
  selectedYmd: string;
  draftStartLocal?: string | null;
  draftEndLocal?: string | null;
  entry?: CalendarEntry | null;
  canEdit: boolean;
  onSaved?: (ymd: string) => void;
};

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

function splitLocal(local: string): { ymd: string; hm: string } {
  const [ymd = "", time = "08:00"] = String(local).split("T");
  return { ymd, hm: normalizeHm(time) };
}

function normalizeHm(value: string): string {
  const match = /(\d{1,2}):(\d{2})/.exec(String(value || ""));
  if (!match) return "08:00";
  return `${pad2(Math.min(23, Number(match[1])))}:${match[2]}`;
}

function combineLocal(ymd: string, hm: string): string {
  return `${ymd}T${hm}`;
}

function addHoursHm(hm: string, hours: number): string {
  const [hourText, minuteText] = hm.split(":");
  const total = Number(hourText) * 60 + Number(minuteText) + hours * 60;
  const wrapped = ((total % (24 * 60)) + 24 * 60) % (24 * 60);
  return `${pad2(Math.floor(wrapped / 60))}:${pad2(wrapped % 60)}`;
}

function endDateFor(startYmd: string, startHm: string, endHm: string): string {
  return endHm > startHm ? startYmd : addDaysYmd(startYmd, 1);
}

function durationLabel(startMs: number, endMs: number): string {
  const minutes = Math.max(0, Math.round((endMs - startMs) / 60000));
  if (minutes < 60) return `${minutes} phút`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours} giờ ${rest} phút` : `${hours} giờ`;
}

function dateHeadline(ymd: string) {
  const parts = parseYmd(ymd);
  if (!parts) {
    return { short: "—", long: "Chọn ngày", day: "—", monthYear: "" };
  }
  const index = mondayIndexOfYmd(ymd);
  return {
    short: WEEKDAY_SHORT_VI[index],
    long: WEEKDAY_LONG_VI[index],
    day: String(parts.day),
    monthYear: `${parts.day} tháng ${parts.month}, ${parts.year}`,
  };
}

function defaultRange(
  ymd: string,
  draftStartLocal: string | null | undefined,
  draftEndLocal?: string | null,
): { ymd: string; startHm: string; endHm: string } {
  if (draftStartLocal) {
    const start = splitLocal(draftStartLocal);
    const end = draftEndLocal ? splitLocal(draftEndLocal) : { ymd: start.ymd, hm: addHoursHm(start.hm, 1) };
    return { ymd: start.ymd, startHm: start.hm, endHm: end.hm };
  }
  const parts = utcMsToVnParts(Date.now());
  const today = `${parts.year}-${pad2(parts.month)}-${pad2(parts.day)}`;
  if (ymd !== today) {
    return { ymd, startHm: "08:00", endHm: "09:00" };
  }
  let hour = parts.hour;
  let minute = parts.minute < 30 ? 30 : 0;
  if (parts.minute >= 30) hour += 1;
  if (hour >= 24) return { ymd, startHm: "23:00", endHm: "23:59" };
  const startHm = `${pad2(hour)}:${pad2(minute)}`;
  return { ymd, startHm, endHm: addHoursHm(startHm, 1) };
}

export function CalendarEntrySheet({
  open,
  onClose,
  groupId,
  uid,
  weekEntries,
  calendars,
  defaultCalendar,
  members,
  labelOf,
  selectedYmd,
  draftStartLocal,
  draftEndLocal,
  entry,
  canEdit,
  onSaved,
}: CalendarEntrySheetProps) {
  const { showToast } = useToast();
  const isOwner = Boolean(entry && canEditCalendarEntry(entry, uid));
  const editable = canEdit && (!entry || isOwner);
  const [title, setTitle] = useState("");
  const [dateYmd, setDateYmd] = useState(selectedYmd);
  const [startHm, setStartHm] = useState("08:00");
  const [endHm, setEndHm] = useState("09:00");
  const [description, setDescription] = useState("");
  const [location, setLocation] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [repeatFreq, setRepeatFreq] = useState<RepeatFreq>("none");
  const [repeatCount, setRepeatCount] = useState(4);
  const [targetKey, setTargetKey] = useState(() => calendarKey(entry?.calendar || defaultCalendar));
  const targetCalendar = calendars.find((calendar) => calendarKey(calendar) === targetKey);
  const moving = Boolean(entry && targetCalendar && calendarKey(entry.calendar) !== targetKey);
  const defaultCalendarKey = calendarKey(defaultCalendar);
  const initializedDraftKey = useRef<string | null>(null);
  const draftKey = JSON.stringify([
    groupId,
    uid,
    entry ? calendarEntryKey(entry) : ["new", defaultCalendarKey, selectedYmd, draftStartLocal, draftEndLocal],
  ]);

  useEffect(() => {
    if (!open) {
      initializedDraftKey.current = null;
      return;
    }
    // A fresh snapshot can contain a new object for the same event. Preserve edits until
    // this sheet is reopened or switches identity; permission changes remount it upstream.
    if (editable && initializedDraftKey.current === draftKey) return;
    initializedDraftKey.current = draftKey;
    setTargetKey(entry ? calendarKey(entry.calendar) : defaultCalendarKey);
    setConfirmDelete(false);
    if (entry) {
      const start = splitLocal(msToVnDateTimeLocal(entry.startAt));
      const end = splitLocal(msToVnDateTimeLocal(entry.endAt));
      setTitle(entry.title);
      setDateYmd(start.ymd);
      setStartHm(start.hm);
      setEndHm(end.hm);
      setDescription(entry.description);
      setLocation(entry.location);
    } else {
      const range = defaultRange(selectedYmd, draftStartLocal, draftEndLocal);
      setTitle("");
      setDateYmd(range.ymd);
      setStartHm(range.startHm);
      setEndHm(range.endHm);
      setDescription("");
      setLocation("");
      setRepeatFreq("none");
      setRepeatCount(4);
    }
    setError("");
  }, [open, entry, selectedYmd, draftStartLocal, draftEndLocal, defaultCalendarKey, draftKey, editable]);

  const endYmd = endDateFor(dateYmd, startHm, endHm);
  const startLocal = combineLocal(dateYmd, startHm);
  const endLocal = combineLocal(endYmd, endHm);
  const startAt = vnDateTimeLocalToMs(startLocal);
  const endAt = vnDateTimeLocalToMs(endLocal);
  const overnight = endYmd !== dateYmd;
  const occurrences = useMemo(() => {
    if (startAt === null || endAt === null || endAt <= startAt) return [];
    return expandRepeatOccurrences(
      { startAt, endAt },
      entry ? "none" : repeatFreq,
      entry ? 1 : repeatCount,
    );
  }, [startAt, endAt, repeatFreq, repeatCount, entry]);

  const overlap =
    occurrences.length > 0 &&
    occurrences.some((item) => hasSelfOverlap(
      weekEntries.filter((candidate) => !entry || calendarEntryKey(candidate) !== calendarEntryKey(entry)),
      uid,
      item,
    ));

  const repeatPreview = useMemo(() => {
    if (entry || repeatFreq === "none" || occurrences.length < 2) return "";
    const dates = occurrences.map((item) => formatViDateShort(ymdInTz(item.startAt)));
    const shown = dates.slice(0, 4).join(" · ");
    const extra = dates.length > 4 ? ` · +${dates.length - 4}` : "";
    const kind = repeatFreq === "day" ? "mỗi ngày" : "mỗi tuần";
    return `${occurrences.length} lần ${kind}: ${shown}${extra}`;
  }, [entry, occurrences, repeatFreq]);

  const headline = dateHeadline(dateYmd);
  const isToday = dateYmd === todayYmdVn();
  const summary = useMemo(() => {
    if (startAt === null || endAt === null || endAt <= startAt) {
      return overnight ? "Kết thúc hôm sau" : "";
    }
    const length = durationLabel(startAt, endAt);
    return overnight ? `Qua đêm · ${length}` : length;
  }, [startAt, endAt, overnight]);

  function handleStartTimeChange(value: string) {
    const next = normalizeHm(value);
    setStartHm(next);
    if (endHm <= next) setEndHm(addHoursHm(next, 1));
  }

  async function handleSave() {
    if (!editable || !targetCalendar || saving) return;
    setError("");
    const checked = validateCalendarEntryInput({
      title,
      description,
      location,
      startAt: startAt ?? NaN,
      endAt: endAt ?? NaN,
    });
    if (!checked.ok) {
      setError(checked.error);
      return;
    }

    setSaving(true);
    try {
      if (entry) {
        if (moving) await moveCalendarEntry(groupId, entry.calendar, targetCalendar, entry.id, checked);
        else await updateCalendarEntry(groupId, entry.calendar, entry.id, checked);
        showToast({ title: "Đã lưu", message: "Đã cập nhật lịch bận.", variant: "success" });
      } else {
        const inputs = occurrences.map((item) => ({
          ...checked,
          startAt: item.startAt,
          endAt: item.endAt,
        }));
        const result = await createCalendarEntries(groupId, targetCalendar, uid, inputs);
        const extra = result.failed ? `, lỗi ${result.failed}` : "";
        showToast({
          title: "Đã lưu",
          message:
            result.added === 1
              ? "Đã thêm lịch bận."
              : `Đã thêm ${result.added} lịch bận${extra}.`,
          variant: result.failed ? "danger" : "success",
        });
        if (!result.added) {
          setError("Không lưu được lịch.");
          return;
        }
      }
      onSaved?.(dateYmd);
      onClose();
    } catch (err) {
      setError((err as { message?: string }).message || "Không lưu được lịch.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <BottomSheet
        open={open}
        onClose={() => { if (!confirmDelete && !saving) onClose(); }}
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
              <Button variant="primary" onClick={() => void handleSave()} disabled={saving || !targetCalendar}>
                {saving
                  ? "Đang lưu..."
                  : !entry && occurrences.length > 1
                    ? `Lưu ${occurrences.length} lần`
                    : "Lưu"}
              </Button>
            </div>
          ) : undefined
        }
      >
        <div className="cal-form">
          <label className="cal-form__extra">
            <span>Thuộc lịch</span>
            <select className="form-input" value={targetKey} disabled={!editable || saving} onChange={(event) => setTargetKey(event.target.value)}>
              {calendars.map((calendar) => <option key={calendarKey(calendar)} value={calendarKey(calendar)}>{calendar.name}</option>)}
            </select>
          </label>
          {targetCalendar ? <CalendarAudience calendar={targetCalendar} members={members} labelOf={labelOf} /> : <p className="form-error">Bạn không còn quyền truy cập lịch này.</p>}
          {moving ? <p className="cal-warn">Khi lưu, sự kiện sẽ chuyển sang “{targetCalendar?.name}”. Chỉ những người được xem lịch mới ở trên sẽ thấy sự kiện này.</p> : null}
          <input
            id="calTitle"
            aria-label="Tiêu đề"
            className="cal-form__title"
            placeholder="Thêm tiêu đề"
            value={title}
            maxLength={TITLE_MAX}
            disabled={!editable}
            onChange={(event) => setTitle(event.target.value)}
          />

          <div className="cal-when">
            <label className={`cal-when__date ${isToday ? "is-today" : ""}`.trim()}>
              <span className="cal-when__tile" aria-hidden="true">
                <small>{headline.short}</small>
                <strong>{headline.day}</strong>
              </span>
              <span className="cal-when__date-copy">
                <strong>{headline.long}</strong>
                <span>{headline.monthYear}</span>
                <span className="cal-when__date-hint">{editable ? "Chạm để đổi ngày" : "Ngày bắt đầu"}</span>
              </span>
              <input
                type="date"
                className="cal-when__date-input"
                value={dateYmd}
                disabled={!editable}
                aria-label="Ngày"
                onChange={(event) => setDateYmd(event.target.value)}
              />
            </label>

            <div className="cal-when__times">
              <label className="cal-when__time">
                <span>Từ</span>
                <input
                  type="time"
                  step={60}
                  value={startHm}
                  disabled={!editable}
                  onChange={(event) => handleStartTimeChange(event.target.value)}
                />
              </label>
              <span className="cal-when__dash" aria-hidden="true">
                <span />
              </span>
              <label className="cal-when__time">
                <span>Đến</span>
                <input
                  type="time"
                  step={60}
                  value={endHm}
                  disabled={!editable}
                  onChange={(event) => setEndHm(normalizeHm(event.target.value))}
                />
              </label>
            </div>

            {summary || overnight ? (
              <div className="cal-when__meta">
                {summary ? <p className="cal-when__summary">{summary}</p> : null}
                {overnight ? (
                  <p className="cal-when__overnight">Qua đêm · {formatViDateShort(endYmd)}</p>
                ) : null}
              </div>
            ) : null}
          </div>

          {!entry && editable ? (
            <div className="cal-repeat">
              <span className="cal-repeat__label">Lặp lại</span>
              <div className="cal-repeat__freqs" role="group" aria-label="Kiểu lặp lại">
                <button
                  type="button"
                  className={`cal-repeat__chip ${repeatFreq === "none" ? "is-active" : ""}`.trim()}
                  onClick={() => setRepeatFreq("none")}
                >
                  Không
                </button>
                <button
                  type="button"
                  className={`cal-repeat__chip ${repeatFreq === "day" ? "is-active" : ""}`.trim()}
                  onClick={() => setRepeatFreq("day")}
                >
                  Mỗi ngày
                </button>
                <button
                  type="button"
                  className={`cal-repeat__chip ${repeatFreq === "week" ? "is-active" : ""}`.trim()}
                  onClick={() => setRepeatFreq("week")}
                >
                  Mỗi tuần
                </button>
              </div>
              {repeatFreq !== "none" ? (
                <label className="cal-repeat__count">
                  <span>Số lần, kể cả lần này</span>
                  <input
                    type="number"
                    className="form-input"
                    min={1}
                    max={REPEAT_MAX}
                    value={repeatCount}
                    onChange={(event) => setRepeatCount(clampRepeatCount(event.target.value))}
                  />
                </label>
              ) : null}
              {repeatPreview ? <p className="cal-repeat__preview">{repeatPreview} · Thuộc lịch: {targetCalendar?.name}</p> : null}
            </div>
          ) : null}

          <label className="cal-form__extra">
            <span>Địa điểm</span>
            <input
              className="form-input"
              placeholder="Không bắt buộc"
              value={location}
              maxLength={LOCATION_MAX}
              disabled={!editable}
              onChange={(event) => setLocation(event.target.value)}
            />
          </label>
          <label className="cal-form__extra">
            <span>Mô tả</span>
            <textarea
              className="form-input cal-textarea"
              rows={3}
              placeholder="Ghi chú thêm"
              value={description}
              maxLength={DESCRIPTION_MAX}
              disabled={!editable}
              onChange={(event) => setDescription(event.target.value)}
            />
          </label>

          {overlap ? (
            <div className="cal-warn">
              {occurrences.length > 1
                ? "Một số lần lặp trùng giờ với lịch bận khác — vẫn có thể lưu."
                : "Trùng giờ với lịch bận khác của bạn — vẫn có thể lưu."}
            </div>
          ) : null}
          <div className="form-error">{error}</div>
        </div>
      </BottomSheet>

      {confirmDelete && open && entry && editable ? <CalendarDeleteDialog
        key={draftKey}
        groupId={groupId}
        uid={uid}
        entry={entry}
        calendarName={calendars.find((calendar) => calendarKey(calendar) === calendarKey(entry.calendar))?.name || "Lịch đã chọn"}
        onCancel={() => setConfirmDelete(false)}
        onDeleted={(count) => {
          showToast({ title: "Đã xóa", message: `Đã xóa ${count} lịch bận.`, variant: "success" });
          setConfirmDelete(false);
          onClose();
        }}
      /> : null}
    </>
  );
}
