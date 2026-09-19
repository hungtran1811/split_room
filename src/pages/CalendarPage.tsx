import { useEffect, useMemo, useState } from "react";
import { PageHeader, LockBanner } from "../shared/ui/PageHeader";
import { PageLoadingSkeleton } from "../shared/ui/Skeleton";
import { useSession } from "../app/SessionContext";
import { useMemberLabel } from "../hooks/useMemberLabel";
import { useCalendarWeek } from "../hooks/useCalendarWeek";
import {
  currentWeekStartYmd,
  formatWeekRangeLabel,
  shiftWeekStart,
  weekBounds,
} from "../domain/calendar/week";
import { todayYmdVn } from "../domain/calendar/tz";
import { WeekToolbar } from "../features/calendar/WeekToolbar";
import { WeekGrid } from "../features/calendar/WeekGrid";
import { DayDetails } from "../features/calendar/DayDetails";
import { CalendarEntrySheet } from "../features/calendar/CalendarEntrySheet";
import { CopyWeekSheet } from "../features/calendar/CopyWeekSheet";
import { memberUid } from "../features/calendar/members";
import type { CalendarEntry } from "../domain/calendar/types";

function useDesktopCalendar() {
  const [isDesktop, setIsDesktop] = useState(() =>
    typeof window !== "undefined" ? window.matchMedia("(min-width: 1024px)").matches : true,
  );

  useEffect(() => {
    const media = window.matchMedia("(min-width: 1024px)");
    const onChange = () => setIsDesktop(media.matches);
    onChange();
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, []);

  return isDesktop;
}

export function CalendarPage() {
  const session = useSession();
  const labelOf = useMemberLabel();
  const isDesktop = useDesktopCalendar();
  const [weekStartYmd, setWeekStartYmd] = useState(() => currentWeekStartYmd());
  const week = useMemo(() => weekBounds(weekStartYmd), [weekStartYmd]);
  const [selectedYmd, setSelectedYmd] = useState(() => {
    const today = todayYmdVn();
    const bounds = weekBounds(currentWeekStartYmd());
    return bounds.days.some((day) => day.ymd === today) ? today : bounds.startYmd;
  });
  const [visibleUids, setVisibleUids] = useState<string[] | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [copyOpen, setCopyOpen] = useState(false);
  const [activeEntryId, setActiveEntryId] = useState<string | null>(null);

  const live = useCalendarWeek(session.groupId, week.startMs, week.endMs);
  const myUid = session.user?.uid || "";
  const canEdit = Boolean(myUid && session.groupId);

  useEffect(() => {
    if (isDesktop) return;
    if (!week.days.some((day) => day.ymd === selectedYmd)) {
      const today = todayYmdVn();
      setSelectedYmd(week.days.some((day) => day.ymd === today) ? today : week.startYmd);
    }
  }, [week, selectedYmd, isDesktop]);

  const entries = useMemo<CalendarEntry[]>(
    () =>
      live.entries.map((item) => ({
        id: item.id,
        uid: item.uid,
        title: item.title,
        description: item.description,
        location: item.location,
        startAt: item.startAt,
        endAt: item.endAt,
      })),
    [live.entries],
  );

  const members = session.members;
  const allUids = members.map(memberUid).filter(Boolean);
  const activeUids = visibleUids?.length ? visibleUids : allUids;
  const visibleEntries = entries.filter((entry) => activeUids.includes(entry.uid));
  const selectedDay = week.days.find((day) => day.ymd === selectedYmd) || week.days[0];
  const activeEntry = entries.find((item) => item.id === activeEntryId) || null;

  function toggleMember(uid: string) {
    setVisibleUids((current) => {
      const baseline = current?.length ? current : allUids;
      if (baseline.length === allUids.length && baseline.every((id) => allUids.includes(id))) {
        return [uid];
      }
      const exists = baseline.includes(uid);
      const next = exists ? baseline.filter((id) => id !== uid) : [...baseline, uid];
      if (!next.length || next.length === allUids.length) return null;
      return next;
    });
  }

  function openCreate() {
    setActiveEntryId(null);
    setSheetOpen(true);
  }

  function openEntry(entryId: string) {
    setActiveEntryId(entryId);
    setSheetOpen(true);
  }

  return (
    <div className="calendar-page">
      <PageHeader
        title="Lịch nhóm"
        subtitle="Thứ Hai đến Chủ nhật · mỗi người tự ghi lịch bận, thời gian còn lại là rảnh"
      />

      <WeekToolbar
        bounds={week}
        rangeLabel={formatWeekRangeLabel(week)}
        canEdit={canEdit}
        members={members}
        labelOf={labelOf}
        visibleUids={visibleUids}
        onToggleMember={toggleMember}
        onPrevWeek={() => setWeekStartYmd((current) => shiftWeekStart(current, -1))}
        onNextWeek={() => setWeekStartYmd((current) => shiftWeekStart(current, 1))}
        onThisWeek={() => {
          const start = currentWeekStartYmd();
          setWeekStartYmd(start);
          const today = todayYmdVn();
          const next = weekBounds(start);
          setSelectedYmd(next.days.some((day) => day.ymd === today) ? today : start);
        }}
        onAdd={openCreate}
        onCopy={() => setCopyOpen(true)}
      />

      {live.error ? <LockBanner>{live.error}</LockBanner> : null}

      {!live.ready && !live.error ? <PageLoadingSkeleton stats={0} rows={4} /> : null}

      {live.ready ? (
        <>
          <WeekGrid
            week={week}
            entries={visibleEntries}
            members={members}
            labelOf={labelOf}
            selectedYmd={selectedYmd}
            isDesktop={isDesktop}
            onSelectDay={setSelectedYmd}
            onOpenEntry={openEntry}
          />
          {selectedDay ? (
            <DayDetails
              day={selectedDay}
              entries={visibleEntries}
              members={members}
              visibleUids={activeUids}
              labelOf={labelOf}
              ready={live.ready}
              onOpenEntry={openEntry}
            />
          ) : null}
        </>
      ) : null}

      {session.groupId && myUid ? (
        <>
          <CalendarEntrySheet
            open={sheetOpen}
            onClose={() => setSheetOpen(false)}
            groupId={session.groupId}
            uid={myUid}
            weekEntries={entries}
            selectedYmd={selectedYmd}
            entry={activeEntry}
            canEdit={canEdit}
          />
          <CopyWeekSheet
            open={copyOpen}
            onClose={() => setCopyOpen(false)}
            groupId={session.groupId}
            uid={myUid}
            targetWeekStartYmd={week.startYmd}
          />
        </>
      ) : null}
    </div>
  );
}
