import { useEffect, useMemo, useState } from "react";
import { LockBanner } from "../shared/ui/PageHeader";
import { PageLoadingSkeleton } from "../shared/ui/Skeleton";
import { useSession } from "../app/SessionContext";
import { useMemberLabel } from "../hooks/useMemberLabel";
import { useCalendarWeek } from "../hooks/useCalendarWeek";
import { useNowMs } from "../hooks/useNowMs";
import {
  currentWeekStartYmd,
  formatWeekRangeLabel,
  shiftWeekStart,
  weekBounds,
} from "../domain/calendar/week";
import { todayYmdVn, ymdInTz, addDaysYmd } from "../domain/calendar/tz";
import { WeekToolbar } from "../features/calendar/WeekToolbar";
import { WeekGrid } from "../features/calendar/WeekGrid";
import { WeekDetails } from "../features/calendar/WeekDetails";
import { CalendarEntrySheet } from "../features/calendar/CalendarEntrySheet";
import { CopyWeekSheet } from "../features/calendar/CopyWeekSheet";
import { BottomSheet } from "../shared/ui/BottomSheet";
import { memberMatchesUid, memberUid } from "../features/calendar/members";
import { countEntriesOutsideCoreHours } from "../domain/calendar/visibleHours";
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
  const nowMs = useNowMs();
  const liveWeekStartYmd = currentWeekStartYmd(nowMs);
  const [weekStartYmd, setWeekStartYmd] = useState(() => currentWeekStartYmd());
  const [followLiveWeek, setFollowLiveWeek] = useState(true);
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
  const [draftStartLocal, setDraftStartLocal] = useState<string | null>(null);
  const [draftEndLocal, setDraftEndLocal] = useState<string | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [showAllHours, setShowAllHours] = useState(false);

  const live = useCalendarWeek(session.groupId, week.startMs, week.endMs);
  const myUid = session.user?.uid || "";
  const canEdit = Boolean(myUid && session.groupId);

  useEffect(() => {
    if (!followLiveWeek) return;
    if (weekStartYmd === liveWeekStartYmd) return;
    setWeekStartYmd(liveWeekStartYmd);
    const today = todayYmdVn(nowMs);
    const next = weekBounds(liveWeekStartYmd);
    setSelectedYmd(next.days.some((day) => day.ymd === today) ? today : liveWeekStartYmd);
  }, [followLiveWeek, liveWeekStartYmd, weekStartYmd, nowMs]);

  useEffect(() => {
    if (!week.days.some((day) => day.ymd === selectedYmd)) {
      const today = todayYmdVn(nowMs);
      setSelectedYmd(week.days.some((day) => day.ymd === today) ? today : week.startYmd);
    }
  }, [week, selectedYmd, nowMs]);

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
  const visibleEntries =
    visibleUids == null
      ? entries
      : entries.filter((entry) =>
          members.some(
            (member) =>
              visibleUids.some((uid) => memberMatchesUid(member, uid)) &&
              memberMatchesUid(member, entry.uid),
          ),
        );
  const activeEntry = entries.find((item) => item.id === activeEntryId) || null;
  const outsideHourCount = useMemo(
    () =>
      countEntriesOutsideCoreHours({
        weekStartMs: week.startMs,
        weekEndMs: week.endMs,
        entries: visibleEntries,
      }),
    [week.startMs, week.endMs, visibleEntries],
  );

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
    setDraftStartLocal(null);
    setDraftEndLocal(null);
    setSheetOpen(true);
  }

  function openCreateRange(ymd: string, startHour: number, endHourExclusive: number) {
    const pad = (value: number) => String(value).padStart(2, "0");
    const endHour = Math.max(startHour + 1, endHourExclusive);
    setSelectedYmd(ymd);
    setActiveEntryId(null);
    setDraftStartLocal(`${ymd}T${pad(startHour)}:00`);
    setDraftEndLocal(
      endHour >= 24 ? `${addDaysYmd(ymd, 1)}T00:00` : `${ymd}T${pad(endHour)}:00`,
    );
    setSheetOpen(true);
  }

  function openEntry(entryId: string) {
    const found = entries.find((item) => item.id === entryId);
    if (found) setSelectedYmd(ymdInTz(found.startAt));
    setDraftStartLocal(null);
    setDraftEndLocal(null);
    setActiveEntryId(entryId);
    setSheetOpen(true);
  }

  return (
    <div className="calendar-page">
      <h1 className="visually-hidden">Lịch nhóm</h1>

      <WeekToolbar
        bounds={week}
        rangeLabel={formatWeekRangeLabel(week)}
        canEdit={canEdit}
        members={members}
        labelOf={labelOf}
        visibleUids={visibleUids}
        onToggleMember={toggleMember}
        onPrevWeek={() => {
          setFollowLiveWeek(false);
          setWeekStartYmd((current) => shiftWeekStart(current, -1));
        }}
        onNextWeek={() => {
          setFollowLiveWeek(false);
          setWeekStartYmd((current) => shiftWeekStart(current, 1));
        }}
        onThisWeek={() => {
          setFollowLiveWeek(true);
          const start = currentWeekStartYmd(nowMs);
          setWeekStartYmd(start);
          const today = todayYmdVn(nowMs);
          const next = weekBounds(start);
          setSelectedYmd(next.days.some((day) => day.ymd === today) ? today : start);
        }}
        onAdd={openCreate}
        onCopy={() => setCopyOpen(true)}
        detailsOpen={detailsOpen}
        onToggleDetails={() => setDetailsOpen((open) => !open)}
        showAllHours={showAllHours}
        outsideHourCount={outsideHourCount}
        onToggleHours={() => setShowAllHours((open) => !open)}
      />

      {live.error ? <LockBanner>{live.error}</LockBanner> : null}

      {!live.ready && !live.error ? <PageLoadingSkeleton stats={0} rows={4} /> : null}

      {live.ready ? (
        <WeekGrid
          week={week}
          entries={visibleEntries}
          members={members}
          labelOf={labelOf}
          selectedYmd={selectedYmd}
          isDesktop={isDesktop}
          nowMs={nowMs}
          canCreate={canEdit}
          showAllHours={showAllHours}
          onToggleHours={() => setShowAllHours((open) => !open)}
          onSelectDay={setSelectedYmd}
          onOpenEntry={openEntry}
          onCreateRange={openCreateRange}
        />
      ) : null}

      <BottomSheet
        open={detailsOpen}
        onClose={() => setDetailsOpen(false)}
        size="wide"
        title={`Chi tiết tuần · ${formatWeekRangeLabel(week)}`}
      >
        <WeekDetails
          week={week}
          selectedYmd={selectedYmd}
          entries={visibleEntries}
          members={members}
          visibleUids={activeUids}
          labelOf={labelOf}
          ready={live.ready}
          onOpenEntry={openEntry}
        />
      </BottomSheet>

      {session.groupId && myUid ? (
        <>
          <CalendarEntrySheet
            open={sheetOpen}
            onClose={() => {
              setSheetOpen(false);
              setDraftStartLocal(null);
              setDraftEndLocal(null);
            }}
            groupId={session.groupId}
            uid={myUid}
            weekEntries={entries}
            selectedYmd={selectedYmd}
            draftStartLocal={draftStartLocal}
            draftEndLocal={draftEndLocal}
            entry={activeEntry}
            canEdit={canEdit}
            onSaved={setSelectedYmd}
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
