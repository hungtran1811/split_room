import { Button } from "../../shared/ui/Button";
import type { WeekBounds } from "../../domain/calendar/week";
import type { MemberProfile } from "../../core/roles";
import { memberKey, memberUid } from "./members";
import { MemberAvatar } from "../../shared/ui/MemberAvatar";

type WeekToolbarProps = {
  bounds: WeekBounds;
  rangeLabel: string;
  canEdit: boolean;
  members: MemberProfile[];
  labelOf: (memberId: string) => string;
  visibleUids: string[] | null;
  onToggleMember: (uid: string) => void;
  onPrevWeek: () => void;
  onNextWeek: () => void;
  onThisWeek: () => void;
  onAdd: () => void;
  onCopy: () => void;
};

export function WeekToolbar({
  bounds,
  rangeLabel,
  canEdit,
  members,
  labelOf,
  visibleUids,
  onToggleMember,
  onPrevWeek,
  onNextWeek,
  onThisWeek,
  onAdd,
  onCopy,
}: WeekToolbarProps) {
  return (
    <div className="cal-toolbar">
      <div className="cal-toolbar__week">
        <button type="button" className="period-chip__btn" aria-label="Tuần trước" onClick={onPrevWeek}>
          ‹
        </button>
        <div className="cal-toolbar__range">
          <strong>{rangeLabel}</strong>
          <span>
            {bounds.days[0]?.shortLabel}–{bounds.days[6]?.shortLabel}
          </span>
        </div>
        <button type="button" className="period-chip__btn" aria-label="Tuần sau" onClick={onNextWeek}>
          ›
        </button>
        <Button variant="ghost" className="btn--sm" onClick={onThisWeek}>
          Tuần này
        </Button>
      </div>

      <div className="cal-toolbar__actions">
        {canEdit ? (
          <>
            <Button variant="primary" className="btn--sm" onClick={onAdd}>
              Thêm lịch bận
            </Button>
            <Button variant="ghost" className="btn--sm" onClick={onCopy}>
              Sao chép tuần trước
            </Button>
          </>
        ) : null}
      </div>

      {members.length ? (
        <div className="cal-filter" role="group" aria-label="Lọc thành viên">
          {members.map((member) => {
            const uid = memberUid(member);
            if (!uid) return null;
            const active = !visibleUids || visibleUids.includes(uid);
            return (
              <button
                key={uid}
                type="button"
                className={`cal-filter__chip ${active ? "is-active" : ""}`.trim()}
                onClick={() => onToggleMember(uid)}
              >
                <MemberAvatar memberId={memberKey(member)} label={labelOf(memberKey(member))} size={22} />
                <span>{labelOf(memberKey(member))}</span>
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
