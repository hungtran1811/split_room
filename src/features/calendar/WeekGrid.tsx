import { useEffect, useMemo, useRef } from "react";
import { colorForMember } from "../../domain/calendar/colors";
import { assignOverlapColumns } from "../../domain/calendar/overlap";
import { splitEntriesAcrossDays } from "../../domain/calendar/segments";
import { formatHm, formatTimeRange, todayYmdVn } from "../../domain/calendar/tz";
import type { WeekBounds } from "../../domain/calendar/week";
import type { CalendarEntry } from "../../domain/calendar/types";
import type { MemberProfile } from "../../core/roles";
import { MemberAvatar } from "../../shared/ui/MemberAvatar";
import { findMemberByUid, memberKey } from "./members";

export const HOUR_HEIGHT = 48;
export const GRID_HOURS = 24;

type WeekGridProps = {
  week: WeekBounds;
  entries: CalendarEntry[];
  members: MemberProfile[];
  labelOf: (memberId: string) => string;
  selectedYmd: string;
  isDesktop: boolean;
  nowMs?: number;
  onSelectDay: (ymd: string) => void;
  onOpenEntry: (entryId: string) => void;
};

function topPx(ms: number, dayStart: number): number {
  return ((ms - dayStart) / (GRID_HOURS * 60 * 60 * 1000)) * (GRID_HOURS * HOUR_HEIGHT);
}

export function WeekGrid({
  week,
  entries,
  members,
  labelOf,
  selectedYmd,
  isDesktop,
  nowMs = Date.now(),
  onSelectDay,
  onOpenEntry,
}: WeekGridProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const todayYmd = todayYmdVn(nowMs);
  const visibleDays = isDesktop ? week.days : week.days.filter((day) => day.ymd === selectedYmd);
  const segments = useMemo(() => splitEntriesAcrossDays(entries, week), [entries, week]);
  const columns = `48px repeat(${Math.max(visibleDays.length, 1)}, minmax(0, 1fr))`;

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: HOUR_HEIGHT * 7 });
  }, [week.startYmd, selectedYmd, isDesktop]);

  return (
    <div className="cal-grid-wrap">
      {!isDesktop ? (
        <div className="cal-day-tabs" role="tablist" aria-label="Chọn ngày">
          {week.days.map((day) => (
            <button
              key={day.ymd}
              type="button"
              role="tab"
              aria-selected={day.ymd === selectedYmd}
              className={`cal-day-tabs__item ${day.ymd === selectedYmd ? "is-active" : ""} ${day.ymd === todayYmd ? "is-today" : ""}`.trim()}
              onClick={() => onSelectDay(day.ymd)}
            >
              <span>{day.shortLabel}</span>
              <strong>{Number(day.ymd.slice(8))}</strong>
            </button>
          ))}
        </div>
      ) : null}

      <div className="cal-grid-head" style={{ gridTemplateColumns: columns }}>
        <div className="cal-grid-head__gutter" />
        {visibleDays.map((day) => (
          <div
            key={day.ymd}
            className={`cal-grid-head__day ${day.ymd === todayYmd ? "is-today" : ""}`.trim()}
          >
            <span>{day.shortLabel}</span>
            <strong>
              {Number(day.ymd.slice(8))}/{Number(day.ymd.slice(5, 7))}
            </strong>
          </div>
        ))}
      </div>

      <div className="cal-grid-scroll" ref={scrollRef}>
        <div
          className="cal-grid"
          style={{
            gridTemplateColumns: columns,
            height: GRID_HOURS * HOUR_HEIGHT,
          }}
        >
          <div className="cal-grid__hours" aria-hidden="true">
            {Array.from({ length: GRID_HOURS }, (_, hour) => (
              <div key={hour} className="cal-grid__hour" style={{ height: HOUR_HEIGHT }}>
                {hour === 0 ? "" : formatHm(hour, 0)}
              </div>
            ))}
          </div>

          {visibleDays.map((day) => {
            const placed = assignOverlapColumns(segments.filter((item) => item.ymd === day.ymd));
            const isToday = day.ymd === todayYmd;
            const nowTop = isToday ? topPx(nowMs, day.startMs) : null;

            return (
              <div
                key={day.ymd}
                className={`cal-day ${isToday ? "is-today" : ""}`.trim()}
                style={{ height: GRID_HOURS * HOUR_HEIGHT }}
              >
                {Array.from({ length: GRID_HOURS }, (_, hour) => (
                  <div key={hour} className="cal-day__line" style={{ top: hour * HOUR_HEIGHT }} />
                ))}
                {nowTop !== null && nowTop >= 0 && nowTop <= GRID_HOURS * HOUR_HEIGHT ? (
                  <div className="cal-now" style={{ top: nowTop }} />
                ) : null}
                {placed.map((segment) => {
                  const member = findMemberByUid(members, segment.uid);
                  const key = member ? memberKey(member) : segment.uid;
                  const color = colorForMember(key);
                  const top = topPx(segment.startAt, day.startMs);
                  const height = Math.max(18, topPx(segment.endAt, day.startMs) - top);
                  const width = 100 / segment.colCount;
                  const entry = entries.find((item) => item.id === segment.entryId);
                  return (
                    <button
                      key={`${segment.entryId}-${segment.startAt}`}
                      type="button"
                      className="cal-block"
                      style={{
                        top,
                        height,
                        left: `calc(${segment.col * width}% + 2px)`,
                        width: `calc(${width}% - 4px)`,
                        background: color.bg,
                        borderColor: color.border,
                        color: color.text,
                      }}
                      onClick={() => onOpenEntry(segment.entryId)}
                    >
                      <span className="cal-block__who">
                        <MemberAvatar memberId={key} label={labelOf(key)} size={16} />
                        <span>{labelOf(key)}</span>
                      </span>
                      <span className="cal-block__time">
                        {formatTimeRange(segment.startAt, segment.endAt, day.endMs)}
                      </span>
                      <span className="cal-block__title">{entry?.title || segment.title}</span>
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
