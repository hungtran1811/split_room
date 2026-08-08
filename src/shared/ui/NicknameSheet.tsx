import { useEffect, useState } from "react";
import { ROSTER } from "../../config/roster";
import { NICKNAME_MAX_LENGTH, sanitizeNickname } from "../../domain/members/nicknames";
import { upsertNickname } from "../../services/nickname.service";
import { useSession } from "../../app/SessionContext";
import { useToast } from "./Toast";
import { BottomSheet } from "./BottomSheet";
import { Button } from "./Button";
import { MemberAvatar } from "./MemberAvatar";

type NicknameSheetProps = {
  open: boolean;
  onClose: () => void;
};

export function NicknameSheet({ open, onClose }: NicknameSheetProps) {
  const session = useSession();
  const { showToast } = useToast();
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    setDraft(
      Object.fromEntries(ROSTER.map((member) => [member.id, session.nicknames[member.id] || ""])),
    );
    setError("");
  }, [open, session.nicknames]);

  async function handleSave() {
    if (!session.groupId || !session.user?.uid) return;
    setSaving(true);
    setError("");
    try {
      await Promise.all(
        ROSTER.map((member) => {
          const next = sanitizeNickname(draft[member.id] || "");
          const current = sanitizeNickname(session.nicknames[member.id] || "");
          if (next === current) return Promise.resolve();
          return upsertNickname(session.groupId!, member.id, next, session.user!.uid);
        }),
      );
      showToast({ title: "Đã lưu", message: "Biệt danh dùng chung cho cả nhóm.", variant: "success" });
      onClose();
    } catch (saveError) {
      setError((saveError as { message?: string })?.message || "Không lưu được biệt danh.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      title="Đặt biệt danh"
      footer={
        <div className="btn-row">
          <Button variant="primary" onClick={() => void handleSave()} disabled={saving}>
            {saving ? "Đang lưu..." : "Lưu biệt danh"}
          </Button>
          <Button variant="ghost" onClick={onClose}>
            Hủy
          </Button>
        </div>
      }
    >
      <p className="form-hint nickname-sheet__hint">
        Ai trong nhóm cũng có thể đặt biệt danh cho nhau. Để trống để dùng tên gốc.
      </p>
      <div className="nickname-sheet__list">
        {ROSTER.map((member) => (
          <label key={member.id} className="nickname-sheet__row">
            <MemberAvatar memberId={member.id} label={member.name} size={40} />
            <span className="nickname-sheet__meta">
              <span className="nickname-sheet__name">{member.name}</span>
              <input
                className="form-input"
                maxLength={NICKNAME_MAX_LENGTH}
                placeholder={`Biệt danh cho ${member.name}`}
                value={draft[member.id] || ""}
                onChange={(event) =>
                  setDraft((current) => ({ ...current, [member.id]: event.target.value }))
                }
              />
            </span>
          </label>
        ))}
      </div>
      {error ? <div className="form-error">{error}</div> : null}
    </BottomSheet>
  );
}
