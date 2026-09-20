import type { CalendarInfo, CalendarRef } from "../../domain/calendar/types";
import { calendarKey } from "../../domain/calendar/access";
import type { MemberProfile } from "../../core/roles";
import { MemberAvatar } from "../../shared/ui/MemberAvatar";
import { findMemberByUid, memberKey, memberUid } from "./members";

export function calendarName(calendar: CalendarRef, calendars: CalendarInfo[]): string {
  return calendars.find((item) => calendarKey(item) === calendarKey(calendar))?.name ||
    (calendar.kind === "group" ? "Cả nhóm" : calendar.kind === "private" ? "Cá nhân" : "Lịch chia sẻ");
}

export function CalendarAudience({
  calendar,
  members,
  labelOf,
}: {
  calendar: CalendarInfo;
  members: MemberProfile[];
  labelOf: (memberId: string) => string;
}) {
  const uids = calendar.kind === "group" ? members.map(memberUid).filter(Boolean) : calendar.memberUids;
  return (
    <div className="cal-audience">
      <span className="cal-audience__label">Ai được xem:{calendar.kind === "group" ? " Cả nhóm" : ""}</span>
      <div className="cal-audience__people">
        {uids.map((uid) => {
          const member = findMemberByUid(members, uid);
          const key = member ? memberKey(member) : uid;
          const label = member ? labelOf(key) : "Đã rời nhóm · không còn quyền xem";
          return (
            <span key={uid} className="cal-audience__person">
              <MemberAvatar memberId={key} label={label} size={22} />
              <span>{label}</span>
            </span>
          );
        })}
      </div>
    </div>
  );
}
