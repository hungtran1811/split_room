import { useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent } from "react";
import { colorForMember } from "../../domain/calendar/colors";
import { assignOverlapColumns } from "../../domain/calendar/overlap";
import { splitEntriesAcrossDays } from "../../domain/calendar/segments";
import { formatHmFromMs, formatTimeRange, todayYmdVn } from "../../domain/calendar/tz";
import {
  DEFAULT_VISIBLE_HOUR_END,
  DEFAULT_VISIBLE_HOUR_START,
  countEntriesOutsideCoreHours,
  isCoreHour,
} from "../../domain/calendar/visibleHours";
import type { WeekBounds } from "../../domain/calendar/week";
import type { CalendarEntry, CalendarInfo } from "../../domain/calendar/types";
import { calendarEntryKey } from "../../domain/calendar/access";
import { calendarName } from "./CalendarAudience";
import type { MemberProfile } from "../../core/roles";
import { findMemberByUid, memberKey } from "./members";
import { HoursToggle } from "./HoursToggle";

export const HOUR_HEIGHT = 52;
const HOUR_MS = 60 * 60 * 1000;
const DRAG_CANCEL_PX = 12;

type WeekGridProps = {
  week: WeekBounds;
  entries: CalendarEntry[];
  calendars: CalendarInfo[];
  members: MemberProfile[];
  labelOf: (memberId: string) => string;
  selectedYmd: string;
  isDesktop: boolean;
  nowMs?: number;
  canCreate?: boolean;
  showAllHours?: boolean;
  onToggleHours?: () => void;
  onSelectDay: (ymd: string) => void;
  onOpenEntry: (entryId: string) => void;
  onCreateRange?: (ymd: string, startHour: number, endHourExclusive: number) => void;
};

type DragState = {
  pointerId: number;
  pointerType: string;
  ymd: string;
  originHour: number;
  currentHour: number;
  startX: number;
  startY: number;
  moved: boolean;
  cancelled: boolean;
};

function topPx(ms: number, dayStart: number, startHour: number): number {
  return ((ms - dayStart) / HOUR_MS - startHour) * HOUR_HEIGHT;
}

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

function hourLabel(hour: number): string {
  if (hour === 24) return "24:00";
  return `${pad2(hour)}:00`;
}

function weekdayLabel(short: string): string {
  return short.toUpperCase();
}

function hourFromClientY(
  body: HTMLElement,
  clientY: number,
  startHour: number,
  endHour: number,
): number {
  const y = clientY - body.getBoundingClientRect().top;
  return Math.max(startHour, Math.min(endHour - 1, startHour + Math.floor(y / HOUR_HEIGHT)));
}

function rangeLabel(startHour: number, endHour: number): string {
  const endExclusive = endHour + 1;
  const endText = endExclusive >= 24 ? "24:00" : `${pad2(endExclusive)}:00`;
  return `${pad2(startHour)}:00–${endText}`;
}

export function WeekGrid({
  week,
  entries,
  calendars,
  members,
  labelOf,
  selectedYmd,
  isDesktop,
  nowMs = Date.now(),
  canCreate = false,
  showAllHours = false,
  onToggleHours,
  onSelectDay,
  onOpenEntry,
  onCreateRange,
}: WeekGridProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const bodyRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const dragRef = useRef<DragState | null>(null);
  const [draft, setDraft] = useState<{ ymd: string; startHour: number; endHour: number } | null>(null);
  const todayYmd = todayYmdVn(nowMs);
  const visibleDays = isDesktop ? week.days : week.days.filter((day) => day.ymd === selectedYmd);
  const segments = useMemo(() => splitEntriesAcrossDays(entries, week), [entries, week]);
  const startHour = showAllHours ? 0 : DEFAULT_VISIBLE_HOUR_START;
  const endHour = showAllHours ? 24 : DEFAULT_VISIBLE_HOUR_END;
  const outsideCount = useMemo(
    () =>
      countEntriesOutsideCoreHours({
        weekStartMs: week.startMs,
        weekEndMs: week.endMs,
        entries,
      }),
    [week.startMs, week.endMs, entries],
  );
  const hours = useMemo(
    () => Array.from({ length: Math.max(1, endHour - startHour) }, (_, index) => startHour + index),
    [startHour, endHour],
  );
  const gridHeight = hours.length * HOUR_HEIGHT;
  const columns = `var(--cal-gutter-w) repeat(${Math.max(visibleDays.length, 1)}, minmax(0, 1fr))`;
  const coreTop = (DEFAULT_VISIBLE_HOUR_START - startHour) * HOUR_HEIGHT;
  const coreBottom = (DEFAULT_VISIBLE_HOUR_END - startHour) * HOUR_HEIGHT;

  useEffect(() => {
    const scroller = scrollRef.current;
    if (!scroller) return;
    scroller.scrollTop = 0;
  }, [showAllHours]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape" || !dragRef.current) return;
      dragRef.current.cancelled = true;
      dragRef.current = null;
      setDraft(null);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  function commitDrag(drag: DragState) {
    if (drag.cancelled || !onCreateRange) return;
    const nextStartHour = Math.min(drag.originHour, drag.currentHour);
    const endHourExclusive = Math.max(drag.originHour, drag.currentHour) + 1;
    onSelectDay(drag.ymd);
    onCreateRange(drag.ymd, nextStartHour, endHourExclusive);
  }

  function handlePointerDown(event: PointerEvent<HTMLDivElement>, ymd: string) {
    if (!canCreate || !onCreateRange) {
      onSelectDay(ymd);
      return;
    }
    if (event.pointerType === "mouse" && event.button !== 0) return;
    if ((event.target as HTMLElement).closest(".cal-block")) return;

    const body = bodyRefs.current[ymd];
    if (!body) return;
    const hour = hourFromClientY(body, event.clientY, startHour, endHour);
    dragRef.current = {
      pointerId: event.pointerId,
      pointerType: event.pointerType,
      ymd,
      originHour: hour,
      currentHour: hour,
      startX: event.clientX,
      startY: event.clientY,
      moved: false,
      cancelled: false,
    };

    if (event.pointerType === "mouse") {
      event.preventDefault();
      body.setPointerCapture(event.pointerId);
    }
  }

  function handlePointerMove(event: PointerEvent<HTMLDivElement>, ymd: string) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId || drag.ymd !== ymd || drag.cancelled) return;

    const dx = Math.abs(event.clientX - drag.startX);
    const dy = Math.abs(event.clientY - drag.startY);
    if (!drag.moved && dx < 4 && dy < 4) return;

    if (drag.pointerType !== "mouse" && !drag.moved && dy > DRAG_CANCEL_PX && dy >= dx) {
      drag.cancelled = true;
      dragRef.current = null;
      setDraft(null);
      return;
    }

    const body = bodyRefs.current[ymd];
    if (!body) return;
    const hour = hourFromClientY(body, event.clientY, startHour, endHour);
    const firstMove = !drag.moved;
    drag.moved = true;
    if (!firstMove && hour === drag.currentHour) return;
    drag.currentHour = hour;
    setDraft({
      ymd,
      startHour: Math.min(drag.originHour, hour),
      endHour: Math.max(drag.originHour, hour),
    });
  }

  function handlePointerUp(event: PointerEvent<HTMLDivElement>, ymd: string) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId || drag.ymd !== ymd) return;
    dragRef.current = null;
    setDraft(null);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    commitDrag(drag);
  }

  function handlePointerCancel(event: PointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    dragRef.current = null;
    setDraft(null);
  }

  return (
    <div
      className={`cal-grid-wrap ${draft ? "is-dragging" : ""} ${showAllHours ? "is-all-hours" : ""}`.trim()}
      style={
        {
          "--cal-hour-h": `${HOUR_HEIGHT}px`,
          "--cal-grid-h": `${gridHeight}px`,
          "--cal-core-top": `${coreTop}px`,
          "--cal-core-bottom": `${coreBottom}px`,
        } as CSSProperties
      }
    >
      {!isDesktop ? (
        <>
          <div className="cal-day-tabs" role="tablist" aria-label="Chọn ngày">
            {week.days.map((day) => {
              const isToday = day.ymd === todayYmd;
              const isActive = day.ymd === selectedYmd;
              return (
                <button
                  key={day.ymd}
                  type="button"
                  role="tab"
                  aria-selected={isActive}
                  className={`cal-day-tabs__item ${isActive ? "is-active" : ""} ${isToday ? "is-today" : ""}`.trim()}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => onSelectDay(day.ymd)}
                >
                  <span>{weekdayLabel(day.shortLabel)}</span>
                  <strong>{Number(day.ymd.slice(8))}</strong>
                </button>
              );
            })}
          </div>
          {onToggleHours ? (
            <div className="cal-hours-bar">
              <HoursToggle
                showAllHours={showAllHours}
                outsideCount={outsideCount}
                onToggle={onToggleHours}
              />
            </div>
          ) : null}
        </>
      ) : null}

      <div className="cal-grid-scroll" ref={scrollRef}>
        <div className="cal-grid" style={{ gridTemplateColumns: columns }}>
          <div className="cal-gutter">
            {isDesktop ? <div className="cal-gutter__head" /> : null}
            <div className="cal-gutter__hours" aria-hidden="true">
              {hours.map((hour) => (
                <div
                  key={hour}
                  className={`cal-grid__hour ${isCoreHour(hour) ? "is-core" : "is-outside"}`.trim()}
                >
                  <span>{hourLabel(hour)}</span>
                </div>
              ))}
            </div>
          </div>

          {visibleDays.map((day) => {
            const placed = assignOverlapColumns(segments.filter((item) => item.ymd === day.ymd));
            const isToday = day.ymd === todayYmd;
            const isWeekend = day.weekdayIndex >= 5;
            const isSelected = day.ymd === selectedYmd;
            const nowTop = isToday ? topPx(nowMs, day.startMs, startHour) : null;
            const dayDraft = draft?.ymd === day.ymd ? draft : null;

            return (
              <div
                key={day.ymd}
                className={`cal-col ${isToday ? "is-today" : ""} ${isWeekend ? "is-weekend" : ""} ${isSelected ? "is-selected" : ""}`.trim()}
              >
                {isDesktop ? (
                  <div className="cal-col__head" onClick={() => onSelectDay(day.ymd)}>
                    <span>{weekdayLabel(day.shortLabel)}</span>
                    <strong>{Number(day.ymd.slice(8))}</strong>
                  </div>
                ) : null}

                <div
                  ref={(node) => {
                    bodyRefs.current[day.ymd] = node;
                  }}
                  className="cal-col__body"
                  onPointerDown={(event) => handlePointerDown(event, day.ymd)}
                  onPointerMove={(event) => handlePointerMove(event, day.ymd)}
                  onPointerUp={(event) => handlePointerUp(event, day.ymd)}
                  onPointerCancel={handlePointerCancel}
                >
                  {hours.map((hour) => {
                    const inDraft =
                      dayDraft && hour >= dayDraft.startHour && hour <= dayDraft.endHour;
                    return (
                      <div
                        key={hour}
                        className={`cal-slot ${isCoreHour(hour) ? "is-core" : "is-outside"} ${inDraft ? "is-draft" : ""}`.trim()}
                        style={{ top: (hour - startHour) * HOUR_HEIGHT, height: HOUR_HEIGHT }}
                        data-hour={hourLabel(hour)}
                      />
                    );
                  })}
                  {dayDraft ? (
                    <div
                      className="cal-draft"
                      style={{
                        top: (dayDraft.startHour - startHour) * HOUR_HEIGHT + 2,
                        height: (dayDraft.endHour - dayDraft.startHour + 1) * HOUR_HEIGHT - 4,
                      }}
                    >
                      <span className="cal-time-chip">{rangeLabel(dayDraft.startHour, dayDraft.endHour)}</span>
                    </div>
                  ) : null}
                  {nowTop !== null && nowTop >= 0 && nowTop <= gridHeight ? (
                    <div className="cal-now" style={{ top: nowTop }}>
                      <span className="cal-now__dot" />
                      <span className="cal-now__time">{formatHmFromMs(nowMs)}</span>
                    </div>
                  ) : null}
                  {placed.map((segment) => {
                    const member = findMemberByUid(members, segment.uid);
                    const key = member ? memberKey(member) : segment.uid;
                    const color = colorForMember(key);
                    const top = topPx(segment.startAt, day.startMs, startHour);
                    const height = Math.max(22, topPx(segment.endAt, day.startMs, startHour) - top - 1);
                    const width = 100 / segment.colCount;
                    const entry = entries.find((item) => calendarEntryKey(item) === segment.entryKey);
                    const name = calendarName(segment.calendar, calendars);
                    const compact = height < 36;
                    return (
                      <button
                        key={`${segment.entryKey}-${segment.startAt}`}
                        type="button"
                        title={`${segment.title} · ${labelOf(key)} · ${name}`}
                        aria-label={`${formatTimeRange(segment.startAt, segment.endAt, day.endMs)} · ${segment.title} · ${labelOf(key)} · ${name}`}
                        className={`cal-block ${compact ? "is-compact" : ""} ${segment.continuesFromPrev ? "is-cont-prev" : ""} ${segment.continuesToNext ? "is-cont-next" : ""}`.trim()}
                        style={{
                          top,
                          height,
                          left: `calc(${segment.col * width}% + 4px)`,
                          width: `calc(${width}% - 8px)`,
                          background: color.bg,
                          borderLeftColor: color.border,
                          color: color.text,
                        }}
                        onPointerDown={(event) => {
                          event.stopPropagation();
                          if (event.pointerType === "mouse") event.preventDefault();
                        }}
                        onClick={(event) => {
                          event.stopPropagation();
                          onSelectDay(day.ymd);
                          onOpenEntry(segment.entryKey);
                        }}
                      >
                        <span className="cal-time-chip">
                          {formatTimeRange(segment.startAt, segment.endAt, day.endMs)}
                        </span>
                        <span className="cal-block__title">{entry?.title || segment.title}</span>
                        {compact ? null : <span className="cal-block__meta">{labelOf(key)} · {name}</span>}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
