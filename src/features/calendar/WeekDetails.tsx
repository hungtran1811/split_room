import { colorForMember } from "../../domain/calendar/colors";
import { formatTimeRange, todayYmdVn } from "../../domain/calendar/tz";
import type { WeekBounds, WeekDay } from "../../domain/calendar/week";
import type { CalendarEntry } from "../../domain/calendar/types";
import type { MemberProfile } from "../../core/roles";
import { MemberAvatar } from "../../shared/ui/MemberAvatar";
import { memberKey, memberMatchesUid, memberUid } from "./members";

type WeekDetailsProps = {
  week: WeekBounds;
  selectedYmd: string;
  entries: CalendarEntry[];
  members: MemberProfile[];
  visibleUids: string[];
  labelOf: (memberId: string) => string;
  ready: boolean;
  onOpenEntry: (entryId: string) => void;
};

function overlapsDay(entry: CalendarEntry, day: WeekDay): boolean {
  return entry.startAt < day.endMs && entry.endAt > day.startMs;
}

function overlapsWeek(entry: CalendarEntry, week: WeekBounds): boolean {
  return entry.startAt < week.endMs && entry.endAt > week.startMs;
}

function formatDayRange(entry: CalendarEntry, day: WeekDay): string {
  const start = Math.max(entry.startAt, day.startMs);
  const end = Math.min(entry.endAt, day.endMs);
  return formatTimeRange(start, end, day.endMs);
}

function dayNumber(ymd: string): number {
  return Number(ymd.slice(8));
}

function dayClass(day: WeekDay, todayYmd: string, selectedYmd: string): string {
  const weekend = day.weekdayIndex >= 5;
  return [
    "cal-week-board__day",
    weekend ? "is-weekend" : "",
    day.ymd === todayYmd ? "is-today" : "",
    day.ymd === selectedYmd ? "is-selected" : "",
  ]
    .filter(Boolean)
    .join(" ");
}

function cellClass(day: WeekDay, todayYmd: string): string {
  const weekend = day.weekdayIndex >= 5;
  return [
    "cal-week-board__cell",
    weekend ? "is-weekend" : "",
    day.ymd === todayYmd ? "is-today" : "",
  ]
    .filter(Boolean)
    .join(" ");
}

export function WeekDetails({
  week,
  selectedYmd,
  entries,
  members,
  visibleUids,
  labelOf,
  ready,
  onOpenEntry,
}: WeekDetailsProps) {
  if (!ready) return <p className="form-hint">Đang tải lịch tuần…</p>;

  const todayYmd = todayYmdVn();
  const visibleMembers = members.filter((member) =>
    visibleUids.some((uid) => memberMatchesUid(member, uid)),
  );
  const weekEntries = entries.filter((entry) => overlapsWeek(entry, week));
  const orphanEntries = weekEntries.filter(
    (entry) => !members.some((member) => memberMatchesUid(member, entry.uid)),
  );

  if (!visibleMembers.length && !orphanEntries.length) {
    return <p className="form-hint">Chưa có thành viên để xem chi tiết tuần.</p>;
  }

  return (
    <div className="cal-week-details">
      <p className="cal-week-details__hint">Vuốt ngang để xem đủ T2–CN của cả nhóm · ô trống là rảnh</p>
      <table className="cal-week-board">
        <colgroup>
          <col className="cal-week-board__col-person" />
          {week.days.map((day) => (
            <col key={day.ymd} className="cal-week-board__col-day" />
          ))}
        </colgroup>
        <thead>
          <tr>
            <th className="cal-week-board__corner" scope="col">
              Thành viên
            </th>
            {week.days.map((day) => (
              <th key={day.ymd} scope="col" className={dayClass(day, todayYmd, selectedYmd)}>
                <span className="cal-week-board__dow">{day.shortLabel}</span>
                <span className="cal-week-board__date">{dayNumber(day.ymd)}</span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {visibleMembers.map((member) => {
            const uid = memberUid(member);
            const key = memberKey(member);
            const color = colorForMember(key);
            const memberEntries = weekEntries
              .filter((entry) => memberMatchesUid(member, entry.uid))
              .sort((left, right) => left.startAt - right.startAt);
            const busyDays = week.days.filter((day) =>
              memberEntries.some((entry) => overlapsDay(entry, day)),
            ).length;
            const allFree = memberEntries.length === 0;

            return (
              <tr key={uid || key}>
                <th className="cal-week-board__person" scope="row">
                  <div className="cal-week-board__who">
                    <MemberAvatar memberId={key} label={labelOf(key)} size={40} />
                    <div className="cal-week-board__copy">
                      <strong>{labelOf(key)}</strong>
                      <span className={allFree ? "cal-person__status is-free" : "cal-person__status is-busy"}>
                        {allFree ? "Rảnh cả tuần" : `${memberEntries.length} lịch · ${busyDays} ngày`}
                      </span>
                    </div>
                  </div>
                </th>
                {week.days.map((day) => {
                  const dayEntries = memberEntries.filter((entry) => overlapsDay(entry, day));
                  return (
                    <td key={day.ymd} className={cellClass(day, todayYmd)}>
                      <div className="cal-week-board__stack">
                        {dayEntries.length ? (
                          dayEntries.map((entry) => (
                            <button
                              key={entry.id}
                              type="button"
                              className="cal-week-event"
                              style={{
                                borderLeftColor: color.border,
                                background: color.bg,
                                color: color.text,
                              }}
                              onClick={() => onOpenEntry(entry.id)}
                            >
                              <span className="cal-week-event__time">{formatDayRange(entry, day)}</span>
                              <span className="cal-week-event__title">{entry.title}</span>
                            </button>
                          ))
                        ) : (
                          <span className="cal-week-board__free">
                            <span className="visually-hidden">Rảnh</span>
                          </span>
                        )}
                      </div>
                    </td>
                  );
                })}
              </tr>
            );
          })}

          {orphanEntries.length ? (
            <tr>
              <th className="cal-week-board__person" scope="row">
                <div className="cal-week-board__copy">
                  <strong>Lịch khác</strong>
                  <span className="cal-person__status is-busy">{orphanEntries.length} lịch</span>
                </div>
              </th>
              {week.days.map((day) => {
                const dayEntries = orphanEntries
                  .filter((entry) => overlapsDay(entry, day))
                  .sort((left, right) => left.startAt - right.startAt);
                return (
                  <td key={day.ymd} className={cellClass(day, todayYmd)}>
                    <div className="cal-week-board__stack">
                      {dayEntries.length ? (
                        dayEntries.map((entry) => (
                          <button
                            key={entry.id}
                            type="button"
                            className="cal-week-event"
                            onClick={() => onOpenEntry(entry.id)}
                          >
                            <span className="cal-week-event__time">{formatDayRange(entry, day)}</span>
                            <span className="cal-week-event__title">{entry.title}</span>
                          </button>
                        ))
                      ) : (
                        <span className="cal-week-board__free">
                          <span className="visually-hidden">Không có lịch</span>
                        </span>
                      )}
                    </div>
                  </td>
                );
              })}
            </tr>
          ) : null}
        </tbody>
      </table>
    </div>
  );
}
