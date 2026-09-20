import { useCallback, useEffect, useMemo, useState } from "react";
import { LockBanner } from "../shared/ui/PageHeader";
import { PageLoadingSkeleton } from "../shared/ui/Skeleton";
import { useSession } from "../app/SessionContext";
import { useMemberLabel } from "../hooks/useMemberLabel";
import { useCalendarWeek } from "../hooks/useCalendarWeek";
import { useCalendars } from "../hooks/useCalendars";
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
import { CalendarManagerSheet } from "../features/calendar/CalendarManagerSheet";
import { CalendarAudience } from "../features/calendar/CalendarAudience";
import { BottomSheet } from "../shared/ui/BottomSheet";
import { Button } from "../shared/ui/Button";
import { memberMatchesUid, memberUid, resolveCalendarMemberLabel } from "../features/calendar/members";
import { countEntriesOutsideCoreHours } from "../domain/calendar/visibleHours";
import { calendarEntryKey, calendarKey, canManageCalendar } from "../domain/calendar/access";

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
  return <CalendarPageContent key={`${session.groupId || ""}:${session.user?.uid || ""}`} />;
}

function CalendarPageContent() {
  const session = useSession();
  const rosterLabelOf = useMemberLabel();
  const labelOf = useCallback(
    (key: string) => resolveCalendarMemberLabel(session.members, key, rosterLabelOf),
    [session.members, rosterLabelOf],
  );
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
  const [selectedCalendarKey, setSelectedCalendarKey] = useState("all");
  const [managerOpen, setManagerOpen] = useState(false);
  const [managedCalendarKey, setManagedCalendarKey] = useState<string | null>(null);

  const myUid = session.user?.uid || "";
  const catalog = useCalendars(session.groupId, myUid);
  const calendars = catalog.calendars;
  const live = useCalendarWeek(session.groupId, myUid, calendars, week.startMs, week.endMs);
  const ready = catalog.ready && live.ready;
  const canEdit = Boolean(myUid && session.groupId && ready);
  const error = catalog.error || live.error;
  const selectedCalendar = calendars.find((calendar) => calendarKey(calendar) === selectedCalendarKey);
  const defaultCalendar = selectedCalendar || calendars.find((calendar) => calendar.kind === "private");
  const managedCalendar = calendars.find((calendar) => calendarKey(calendar) === managedCalendarKey);
  const calendarPermissionsKey = calendars.map((calendar) => `${calendarKey(calendar)}:${calendar.memberUids.slice().sort().join(",")}`).sort().join("|");
  const copyCalendars = useMemo(
    () => selectedCalendar ? [selectedCalendar] : calendars,
    [selectedCalendar, calendars],
  );

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

  const entries = ready ? live.entries : [];

  const members = session.members;
  const allUids = members.map(memberUid).filter(Boolean);
  const activeUids = visibleUids?.length ? visibleUids : allUids;
  const calendarEntries = selectedCalendar ? entries.filter((entry) => calendarKey(entry.calendar) === selectedCalendarKey) : entries;
  const visibleEntries =
    visibleUids == null
      ? calendarEntries
      : calendarEntries.filter((entry) =>
          members.some(
            (member) =>
              visibleUids.some((uid) => memberMatchesUid(member, uid)) &&
              memberMatchesUid(member, entry.uid),
          ),
        );
  const activeEntry = entries.find((item) => calendarEntryKey(item) === activeEntryId) || null;
  const outsideHourCount = useMemo(
    () =>
      countEntriesOutsideCoreHours({
        weekStartMs: week.startMs,
        weekEndMs: week.endMs,
        entries: visibleEntries,
      }),
    [week.startMs, week.endMs, visibleEntries],
  );

  useEffect(() => {
    if (!ready) {
      setSheetOpen(false);
      setCopyOpen(false);
      setManagerOpen(false);
      setDetailsOpen(false);
      setActiveEntryId(null);
      setDraftStartLocal(null);
      setDraftEndLocal(null);
    } else if (activeEntryId && !activeEntry) {
      setSheetOpen(false);
      setActiveEntryId(null);
    }
  }, [ready, activeEntryId, activeEntry]);

  useEffect(() => {
    if (catalog.ready && selectedCalendarKey !== "all" && !selectedCalendar) setSelectedCalendarKey("all");
  }, [catalog.ready, selectedCalendarKey, selectedCalendar]);

  useEffect(() => {
    setCopyOpen(false);
  }, [calendarPermissionsKey]);

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
    const found = entries.find((item) => calendarEntryKey(item) === entryId);
    if (!found) return;
    setSelectedYmd(ymdInTz(found.startAt));
    setDraftStartLocal(null);
    setDraftEndLocal(null);
    setActiveEntryId(entryId);
    setSheetOpen(true);
  }

  return (
    <div className="calendar-page">
      <h1 className="visually-hidden">Lịch nhóm</h1>

      <div className="cal-catalog">
        <label className="cal-catalog__select">
          <span>Lịch đang xem</span>
          <select className="form-input" value={selectedCalendar ? selectedCalendarKey : "all"} disabled={!catalog.ready} onChange={(event) => setSelectedCalendarKey(event.target.value)}>
            <option value="all">Tất cả lịch của tôi</option>
            {calendars.map((calendar) => <option key={calendarKey(calendar)} value={calendarKey(calendar)}>{calendar.name}</option>)}
          </select>
        </label>
        <div className="cal-catalog__actions">
          <Button variant="ghost" className="btn--sm" disabled={!canEdit} onClick={() => { setManagedCalendarKey(null); setManagerOpen(true); }}>Tạo lịch chia sẻ</Button>
          {selectedCalendar?.kind === "shared" ? <Button variant="ghost" className="btn--sm" disabled={!canEdit} onClick={() => { setManagedCalendarKey(calendarKey(selectedCalendar)); setManagerOpen(true); }}>{canManageCalendar(selectedCalendar, myUid) ? "Quản lý lịch" : "Thông tin lịch"}</Button> : null}
        </div>
        {catalog.ready && selectedCalendar ? <CalendarAudience calendar={selectedCalendar} members={session.members} labelOf={labelOf} /> : null}
      </div>

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

      <p className="cal-privacy-note">Chỉ hiển thị các lịch bạn được xem. Khoảng trống không có nghĩa là thành viên đang rảnh.</p>
      {error ? <LockBanner>{error}</LockBanner> : null}

      {!ready && !error ? <><p className="form-hint" role="status">Đang xác nhận quyền truy cập và tải lịch…</p><PageLoadingSkeleton stats={0} rows={4} /></> : null}

      {ready ? (
        <WeekGrid
          week={week}
          entries={visibleEntries}
          calendars={calendars}
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
        open={detailsOpen && ready}
        onClose={() => setDetailsOpen(false)}
        size="wide"
        title={`Chi tiết tuần · ${formatWeekRangeLabel(week)}`}
      >
        <WeekDetails
          week={week}
          selectedYmd={selectedYmd}
          entries={visibleEntries}
          calendars={calendars}
          members={members}
          visibleUids={activeUids}
          labelOf={labelOf}
          ready={ready}
          onOpenEntry={openEntry}
        />
      </BottomSheet>

      {session.groupId && myUid && ready && defaultCalendar ? (
        <>
          {sheetOpen && (!activeEntryId || activeEntry) ?
          <CalendarEntrySheet
            key={`${activeEntryId || "new"}:${calendarPermissionsKey}`}
            open={sheetOpen}
            onClose={() => {
              setSheetOpen(false);
              setDraftStartLocal(null);
              setDraftEndLocal(null);
            }}
            groupId={session.groupId}
            uid={myUid}
            weekEntries={entries}
            calendars={calendars}
            defaultCalendar={defaultCalendar}
            members={members}
            labelOf={labelOf}
            selectedYmd={selectedYmd}
            draftStartLocal={draftStartLocal}
            draftEndLocal={draftEndLocal}
            entry={activeEntry}
            canEdit={canEdit}
            onSaved={setSelectedYmd}
          /> : null}
          {copyOpen ?
          <CopyWeekSheet
            key={calendarPermissionsKey}
            open={copyOpen}
            onClose={() => setCopyOpen(false)}
            groupId={session.groupId}
            uid={myUid}
            calendars={copyCalendars}
            targetWeekStartYmd={week.startYmd}
          /> : null}
          {managerOpen && (!managedCalendarKey || managedCalendar) ? <CalendarManagerSheet
            key={`${managedCalendarKey || "new"}:${calendarPermissionsKey}`}
            open={managerOpen}
            onClose={() => setManagerOpen(false)}
            groupId={session.groupId}
            uid={myUid}
            members={members}
            labelOf={labelOf}
            calendar={managedCalendar}
          /> : null}
        </>
      ) : null}
    </div>
  );
}
