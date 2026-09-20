import { useEffect, useRef, useState } from "react";
import type { CalendarInfo } from "../../domain/calendar/types";
import { canManageCalendar } from "../../domain/calendar/access";
import type { MemberProfile } from "../../core/roles";
import { BottomSheet } from "../../shared/ui/BottomSheet";
import { Button } from "../../shared/ui/Button";
import { ConfirmDialog } from "../../shared/ui/ConfirmDialog";
import { MemberAvatar } from "../../shared/ui/MemberAvatar";
import { useToast } from "../../shared/ui/Toast";
import { createSharedCalendar, updateSharedCalendar } from "../../services/calendar-catalog.service";
import { memberKey, memberUid } from "./members";

type CalendarManagerSheetProps = {
  open: boolean;
  onClose: () => void;
  groupId: string;
  uid: string;
  members: MemberProfile[];
  labelOf: (memberId: string) => string;
  calendar?: CalendarInfo | null;
};

export function CalendarManagerSheet({ open, onClose, groupId, uid, members, labelOf, calendar }: CalendarManagerSheetProps) {
  const { showToast } = useToast();
  const editable = !calendar || canManageCalendar(calendar, uid);
  const [name, setName] = useState("");
  const [selectedUids, setSelectedUids] = useState<string[]>([uid]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [confirmAudience, setConfirmAudience] = useState(false);
  const initializedDraftKey = useRef<string | null>(null);
  const draftKey = JSON.stringify([groupId, uid, calendar?.id || "new"]);

  useEffect(() => {
    if (!open) {
      initializedDraftKey.current = null;
      return;
    }
    // Catalog snapshots recreate objects even when another calendar was changed.
    if (editable && initializedDraftKey.current === draftKey) return;
    initializedDraftKey.current = draftKey;
    setName(calendar?.name || "");
    setSelectedUids(calendar?.memberUids || [uid]);
    setError("");
    setConfirmAudience(false);
  }, [open, calendar, uid, draftKey, editable]);

  const ownerUid = calendar?.ownerUid || uid;
  const departedUids = (calendar?.memberUids || []).filter((memberId) => !members.some((member) => memberUid(member) === memberId));
  const audienceChanged = Boolean(calendar && [...calendar.memberUids].sort().join("|") !== [...selectedUids].sort().join("|"));

  function validateAndSave() {
    if (!editable || saving) return;
    if (!name.trim()) {
      setError("Hãy nhập tên lịch chia sẻ.");
      return;
    }
    if (!calendar && selectedUids.length < 2) {
      setError("Chọn thêm ít nhất một thành viên để chia sẻ.");
      return;
    }
    if (audienceChanged) setConfirmAudience(true);
    else void save();
  }

  async function save() {
    if (!editable || saving) return;
    setSaving(true);
    setError("");
    try {
      if (calendar) await updateSharedCalendar(groupId, calendar.id, name.trim(), selectedUids);
      else await createSharedCalendar(groupId, uid, name.trim(), selectedUids);
      showToast({ title: calendar ? "Đã cập nhật lịch" : "Đã tạo lịch chia sẻ", message: `Đã lưu lịch “${name.trim()}” và người xem đã chọn.`, variant: "success" });
      setConfirmAudience(false);
      onClose();
    } catch (err) {
      setConfirmAudience(false);
      setError((err as { message?: string }).message || "Không lưu được lịch chia sẻ.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <BottomSheet open={open} onClose={() => { if (!confirmAudience && !saving) onClose(); }} title={calendar ? "Thông tin lịch chia sẻ" : "Tạo lịch chia sẻ"}
        footer={editable ? <div className="cal-sheet-footer"><Button variant="ghost" onClick={onClose} disabled={saving}>Hủy</Button><Button variant="primary" onClick={validateAndSave} disabled={saving}>{saving ? "Đang lưu…" : calendar ? "Lưu thay đổi" : "Tạo lịch"}</Button></div> : undefined}>
        <div className="cal-form">
          <label className="cal-form__extra">
            <span>Tên lịch</span>
            <input className="form-input" value={name} maxLength={80} placeholder="Ví dụ: Kế hoạch cuối tuần" disabled={!editable || saving} onChange={(event) => setName(event.target.value)} />
          </label>
          <fieldset className="cal-members" disabled={!editable || saving}>
            <legend>Ai được xem và thêm sự kiện?</legend>
            {members.map((member) => {
              const memberId = memberUid(member);
              if (!memberId) return null;
              const key = memberKey(member);
              const isOwner = memberId === ownerUid;
              return <label key={memberId} className="cal-members__option">
                <input type="checkbox" checked={selectedUids.includes(memberId)} disabled={isOwner} onChange={(event) => setSelectedUids((current) => event.target.checked ? [...new Set([...current, memberId])] : current.filter((item) => item !== memberId))} />
                <MemberAvatar memberId={key} label={labelOf(key)} size={32} />
                <span>{labelOf(key)}{isOwner ? " · Chủ lịch" : ""}</span>
              </label>;
            })}
            {departedUids.map((memberId) => <label key={memberId} className="cal-members__option">
              <input type="checkbox" checked={selectedUids.includes(memberId)} disabled={memberId === ownerUid || !selectedUids.includes(memberId)} onChange={() => setSelectedUids((current) => current.filter((item) => item !== memberId))} />
              <span>Thành viên đã rời nhóm · không còn quyền xem</span>
            </label>)}
          </fieldset>
          {calendar?.memberUids.some((memberId) => !members.some((member) => memberUid(member) === memberId)) ? <p className="form-hint">Lịch có thành viên đã rời nhóm. Họ không còn quyền truy cập.</p> : null}
          <p className="cal-privacy-note">Mọi người trong lịch đều được thêm sự kiện và chỉ được sửa, xóa sự kiện do mình tạo.</p>
          {calendar ? <p className="cal-warn">Thay đổi người xem áp dụng cho toàn bộ lịch sử và sự kiện mới. Người được thêm sẽ thấy mọi sự kiện cũ; người bị bỏ sẽ mất quyền xem, kể cả sự kiện họ từng tạo. Các sự kiện đó vẫn được giữ lại.</p> : <p className="form-hint">Chỉ bạn và những thành viên đã chọn thấy tên lịch và các sự kiện trong lịch này.</p>}
          {!editable ? <p className="form-hint">Chỉ chủ lịch được đổi tên và quản lý người xem.</p> : null}
          {error ? <p className="form-error" role="alert">{error}</p> : null}
        </div>
      </BottomSheet>
      <div className="cal-confirm"><ConfirmDialog open={confirmAudience && open} title="Thay đổi người xem của toàn bộ lịch?" description={<>
        <p>Người xem sau khi lưu: {members.filter((member) => selectedUids.includes(memberUid(member))).map((member) => labelOf(memberKey(member))).join(", ")}.</p>
        <p>Người mới được thêm sẽ thấy cả lịch sử. Người bị bỏ sẽ mất quyền truy cập ngay, kể cả sự kiện do họ tạo; các sự kiện này vẫn được giữ lại.</p>
      </>} confirmLabel="Lưu người xem" pending={saving} onCancel={() => setConfirmAudience(false)} onConfirm={() => void save()} /></div>
    </>
  );
}
