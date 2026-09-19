import { colorForMember } from "../../domain/calendar/colors";
import { freeSlotsForMemberDay, isFreeAllDay } from "../../domain/calendar/freeSlots";
import { formatTimeRange, msToVnDateTimeLocal } from "../../domain/calendar/tz";
import type { WeekDay } from "../../domain/calendar/week";
import type { CalendarEntry } from "../../domain/calendar/types";
import type { MemberProfile } from "../../core/roles";
import { MemberAvatar } from "../../shared/ui/MemberAvatar";
import { findMemberByUid, memberKey, memberUid } from "./members";

type DayDetailsProps = {
  day: WeekDay;
  entries: CalendarEntry[];
  members: MemberProfile[];
  visibleUids: string[];
  labelOf: (memberId: string) => string;
  ready: boolean;
  onOpenEntry: (entryId: string) => void;
};

function formatFullRange(entry: CalendarEntry): string {
  const start = msToVnDateTimeLocal(entry.startAt).replace("T", " ");
  const end = msToVnDateTimeLocal(entry.endAt).replace("T", " ");
  const startDay = start.slice(0, 10);
  const endDay = end.slice(0, 10);
  if (startDay === endDay) {
    return `${start.slice(11)}–${end.slice(11)}`;
  }
  return `${start} → ${end}`;
}

export function DayDetails({
  day,
  entries,
  members,
  visibleUids,
  labelOf,
  ready,
  onOpenEntry,
}: DayDetailsProps) {
  if (!ready) return null;

  const visibleMembers = members.filter((member) => visibleUids.includes(memberUid(member)));

  return (
    <section className="cal-details">
      <h2 className="section-title">Chi tiết ngày</h2>
      <p className="form-hint">
        {day.longLabel} {Number(day.ymd.slice(8))}/{Number(day.ymd.slice(5, 7))}/{day.ymd.slice(0, 4)}
      </p>
      <div className="cal-details__list">
        {visibleMembers.map((member) => {
          const uid = memberUid(member);
          const key = memberKey(member);
          const color = colorForMember(key);
          const memberEntries = entries
            .filter((entry) => entry.uid === uid && entry.startAt < day.endMs && entry.endAt > day.startMs)
            .sort((left, right) => left.startAt - right.startAt);
          const free = freeSlotsForMemberDay(entries, uid, day);
          const allFree = isFreeAllDay(free, day);

          return (
            <article key={uid} className="cal-person">
              <header className="cal-person__head">
                <MemberAvatar memberId={key} label={labelOf(key)} size={32} />
                <strong>{labelOf(key)}</strong>
              </header>

              {allFree ? (
                <p className="cal-free cal-free--all">Rảnh cả ngày — chưa có lịch bận</p>
              ) : (
                <>
                  {memberEntries.map((entry) => (
                    <button
                      key={entry.id}
                      type="button"
                      className="cal-detail-card"
                      style={{ borderColor: color.border }}
                      onClick={() => onOpenEntry(entry.id)}
                    >
                      <div className="cal-detail-card__title">{entry.title}</div>
                      <div className="cal-detail-card__meta">{formatFullRange(entry)}</div>
                      {entry.location ? <div className="cal-detail-card__meta">{entry.location}</div> : null}
                      {entry.description ? (
                        <p className="cal-detail-card__desc">{entry.description}</p>
                      ) : null}
                    </button>
                  ))}
                  {free.map((slot) => (
                    <div key={`${slot.startAt}-${slot.endAt}`} className="cal-free">
                      Rảnh {formatTimeRange(slot.startAt, slot.endAt, day.endMs)}
                    </div>
                  ))}
                </>
              )}
            </article>
          );
        })}
      </div>
    </section>
  );
}
