import { useState } from "react";
import { Button } from "../../shared/ui/Button";
import type { WeekBounds } from "../../domain/calendar/week";
import type { MemberProfile } from "../../core/roles";
import { colorForMember } from "../../domain/calendar/colors";
import { memberKey, memberUid } from "./members";
import { HoursToggle } from "./HoursToggle";

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
  detailsOpen: boolean;
  onToggleDetails: () => void;
  showAllHours: boolean;
  outsideHourCount: number;
  onToggleHours: () => void;
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
  detailsOpen,
  onToggleDetails,
  showAllHours,
  outsideHourCount,
  onToggleHours,
}: WeekToolbarProps) {
  const [filtersOpen, setFiltersOpen] = useState(false);

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
              Thêm
            </Button>
            <Button variant="ghost" className="btn--sm" onClick={onCopy}>
              Sao chép
            </Button>
          </>
        ) : null}
        <Button variant="ghost" className="btn--sm" onClick={onToggleDetails} aria-expanded={detailsOpen}>
          {detailsOpen ? "Ẩn chi tiết" : "Chi tiết"}
        </Button>
        <HoursToggle
          showAllHours={showAllHours}
          outsideCount={outsideHourCount}
          onToggle={onToggleHours}
        />
        {members.length ? (
          <Button
            variant="ghost"
            className="btn--sm"
            onClick={() => setFiltersOpen((open) => !open)}
            aria-expanded={filtersOpen}
          >
            {filtersOpen ? "Ẩn lọc" : "Lọc"}
          </Button>
        ) : null}
      </div>
      <p className="cal-toolbar__hint">Kéo dọc trên lưới để chọn 2–3 khung giờ liên tiếp</p>

      {filtersOpen && members.length ? (
        <div className="cal-filter" role="group" aria-label="Lọc thành viên">
          {members.map((member) => {
            const uid = memberUid(member);
            if (!uid) return null;
            const active = !visibleUids || visibleUids.includes(uid);
            const color = colorForMember(memberKey(member));
            return (
              <button
                key={uid}
                type="button"
                className={`cal-filter__chip ${active ? "is-active" : "is-off"}`.trim()}
                style={
                  active
                    ? { background: color.bg, color: color.text, borderColor: color.border }
                    : undefined
                }
                onClick={() => onToggleMember(uid)}
              >
                <span className="cal-filter__dot" style={{ background: color.border }} />
                <span>{labelOf(memberKey(member))}</span>
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
