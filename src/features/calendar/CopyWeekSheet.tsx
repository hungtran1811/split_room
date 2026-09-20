import { useEffect, useState } from "react";
import { BottomSheet } from "../../shared/ui/BottomSheet";
import { Button } from "../../shared/ui/Button";
import { addDaysYmd, formatHmFromMs, ymdInTz } from "../../domain/calendar/tz";
import { weekBounds } from "../../domain/calendar/week";
import {
  copyPreviousWeekEntries,
  previewCopyFromPreviousWeek,
  type CopyCandidate,
} from "../../services/calendar.service";
import { useToast } from "../../shared/ui/Toast";
import type { CalendarInfo } from "../../domain/calendar/types";
import { calendarName } from "./CalendarAudience";

type CopyWeekSheetProps = {
  open: boolean;
  onClose: () => void;
  groupId: string;
  uid: string;
  calendars: CalendarInfo[];
  targetWeekStartYmd: string;
};

export function CopyWeekSheet({
  open,
  onClose,
  groupId,
  uid,
  calendars,
  targetWeekStartYmd,
}: CopyWeekSheetProps) {
  const { showToast } = useToast();
  const [loading, setLoading] = useState(false);
  const [copying, setCopying] = useState(false);
  const [error, setError] = useState("");
  const [candidates, setCandidates] = useState<CopyCandidate[]>([]);
  const [failed, setFailed] = useState<CopyCandidate[]>([]);

  const previousStart = addDaysYmd(weekBounds(targetWeekStartYmd).startYmd, -7);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError("");
      setCandidates([]);
      setFailed([]);
      try {
        const next = await previewCopyFromPreviousWeek(groupId, uid, calendars, targetWeekStartYmd);
        if (!cancelled) setCandidates(next);
      } catch (err) {
        if (!cancelled) {
          setCandidates([]);
          setError((err as { message?: string }).message || "Không tải được lịch tuần trước.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [open, groupId, uid, calendars, targetWeekStartYmd]);

  async function runCopy(items: CopyCandidate[]) {
    if (!items.length || copying) return;
    setCopying(true);
    setError("");
    try {
      const result = await copyPreviousWeekEntries(groupId, uid, calendars, targetWeekStartYmd, items);
      const failedItems = items.filter((item) =>
        result.failed.some((fail) => fail.destKey === item.destKey),
      );
      setFailed(failedItems);
      showToast({
        title: "Sao chép tuần trước",
        message: `Đã thêm ${result.added}, đã có ${result.skipped}, lỗi ${result.failed.length}.`,
        variant: result.failed.length ? "danger" : "success",
      });
      if (!result.failed.length) onClose();
    } catch (err) {
      setError((err as { message?: string }).message || "Không sao chép được.");
    } finally {
      setCopying(false);
    }
  }

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      title="Sao chép tuần trước"
      footer={
        <div className="cal-sheet-footer">
          <Button variant="ghost" onClick={onClose} disabled={copying}>
            Đóng
          </Button>
          {failed.length ? (
            <Button variant="primary" disabled={copying} onClick={() => void runCopy(failed)}>
              Thử lại phần lỗi
            </Button>
          ) : (
            <Button
              variant="primary"
              disabled={copying || loading || !candidates.length}
              onClick={() => void runCopy(candidates)}
            >
              {copying ? "Đang sao chép..." : "Sao chép"}
            </Button>
          )}
        </div>
      }
    >
      <p className="form-hint">
        Lịch bận của bạn bắt đầu trong tuần {previousStart} sẽ được dịch +7 ngày. Lịch đã có ở tuần
        này được giữ nguyên. Chỉ sao chép sự kiện do bạn tạo và giữ nguyên lịch chứa sự kiện, cùng người xem.
      </p>
      {loading ? <p className="form-hint">Đang tải lịch tuần trước…</p> : null}
      {!loading && !candidates.length && !error ? (
        <p className="form-hint">Tuần trước bạn chưa có lịch bận để sao chép.</p>
      ) : null}
      <ul className="cal-copy-list">
        {candidates.map((item) => (
          <li key={item.destKey}>
            <strong>{item.title}</strong>
            <span>
              {ymdInTz(item.startAt)} {formatHmFromMs(item.startAt)}–{formatHmFromMs(item.endAt)}
            </span>
            <span>Lịch đích: {calendarName(item.calendar, calendars)}</span>
          </li>
        ))}
      </ul>
      {failed.length ? (
        <p className="form-error">
          {failed.length} lịch chưa sao chép được. Bạn có thể thử lại phần lỗi.
        </p>
      ) : null}
      <div className="form-error">{error}</div>
    </BottomSheet>
  );
}
