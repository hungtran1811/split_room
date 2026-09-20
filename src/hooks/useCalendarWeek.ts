import { useEffect, useState } from "react";
import { calendarEntryKey, calendarKey } from "../domain/calendar/access";
import type { CalendarInfo, CalendarRef } from "../domain/calendar/types";
import { watchCalendarWeek } from "../services/calendar.service";
import type { CalendarEntryDoc } from "../types/models";

export type CalendarWeekState = {
  entries: CalendarEntryDoc[];
  ready: boolean;
  error: string;
};

const EMPTY: CalendarWeekState = {
  entries: [],
  ready: false,
  error: "",
};

export function useCalendarWeek(
  groupId: string | null | undefined,
  uid: string | null | undefined,
  calendars: CalendarInfo[],
  weekStartMs: number,
  weekEndMs: number,
): CalendarWeekState {
  // An audience change invalidates loaded entries before effects run.
  const scopeJson = JSON.stringify(calendars.map((calendar) => ({
    kind: calendar.kind,
    id: calendar.id,
    ownerUid: calendar.ownerUid,
    memberUids: [...calendar.memberUids].sort(),
  })).sort((left, right) => calendarKey(left).localeCompare(calendarKey(right))));
  const contextKey = JSON.stringify([groupId || "", uid || "", weekStartMs, weekEndMs, scopeJson]);
  const [state, setState] = useState<CalendarWeekState & { contextKey: string }>({
    ...EMPTY, contextKey: "",
  });

  useEffect(() => {
    let cancelled = false;
    const scopes: CalendarRef[] = JSON.parse(scopeJson);
    setState({ ...EMPTY, contextKey });
    if (!groupId || !uid || !scopes.length || !Number.isFinite(weekStartMs) ||
      !Number.isFinite(weekEndMs) || weekEndMs <= weekStartMs) return;

    const results = scopes.map((): CalendarWeekState => ({ ...EMPTY }));
    function publish() {
      if (cancelled) return;
      const error = results.find((result) => result.error)?.error || "";
      const ready = !error && results.every((result) => result.ready);
      const entries = ready ? results.flatMap((result) => result.entries).sort((left, right) =>
        left.startAt - right.startAt || left.endAt - right.endAt ||
        calendarEntryKey(left).localeCompare(calendarEntryKey(right)),
      ) : [];
      setState({ contextKey, entries, ready, error });
    }

    const subscriptions = scopes.map((calendar, index) => {
      try {
        return watchCalendarWeek(groupId, calendar, weekStartMs, weekEndMs,
          (entries) => {
            results[index] = { entries, ready: true, error: "" };
            publish();
          },
          (error) => {
            results[index] = { ...EMPTY, error: error.message };
            publish();
          },
          () => {
            results[index] = { ...EMPTY };
            publish();
          },
        );
      } catch (error) {
        results[index] = { ...EMPTY, error: (error as Error).message || "Không tải được lịch." };
        publish();
        return () => {};
      }
    });

    return () => {
      cancelled = true;
      subscriptions.forEach((unsubscribe) => unsubscribe());
    };
  }, [groupId, uid, weekStartMs, weekEndMs, scopeJson, contextKey]);

  return state.contextKey === contextKey ? state : EMPTY;
}
