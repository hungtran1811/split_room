import { useEffect, useState } from "react";
import { GROUP_CALENDAR } from "../domain/calendar/access";
import type { CalendarInfo } from "../domain/calendar/types";
import { ensurePrivateCalendar, watchCalendars } from "../services/calendar-catalog.service";

export type CalendarsState = {
  calendars: CalendarInfo[];
  ready: boolean;
  error: string;
};

const EMPTY: CalendarsState = { calendars: [], ready: false, error: "" };

export function useCalendars(
  groupId: string | null | undefined,
  uid: string | null | undefined,
): CalendarsState {
  const contextKey = JSON.stringify([groupId || "", uid || ""]);
  const [state, setState] = useState<CalendarsState & { contextKey: string }>({
    ...EMPTY,
    contextKey: "",
  });

  useEffect(() => {
    let cancelled = false;
    let unsubscribe: (() => void) | undefined;
    setState({ ...EMPTY, contextKey });
    if (!groupId || !uid) return;

    void ensurePrivateCalendar(groupId, uid).then(() => {
      if (cancelled) return;
      unsubscribe = watchCalendars(
        groupId,
        uid,
        (calendars) => {
          if (cancelled) return;
          const common: CalendarInfo = {
            ...GROUP_CALENDAR,
            name: "Cả nhóm",
            ownerUid: "",
            memberUids: [],
          };
          const ordered = [...calendars].sort((left, right) => {
            if (left.kind !== right.kind) return left.kind === "private" ? -1 : 1;
            return left.name.localeCompare(right.name, "vi") || left.id.localeCompare(right.id);
          });
          setState({ contextKey, calendars: [common, ...ordered], ready: true, error: "" });
        },
        (error) => {
          if (!cancelled) setState({ ...EMPTY, contextKey, error: error.message });
        },
        () => {
          if (!cancelled) setState({ ...EMPTY, contextKey });
        },
      );
    }).catch((error: unknown) => {
      if (!cancelled) {
        setState({ ...EMPTY, contextKey, error: (error as Error).message || "Không tải được danh sách lịch." });
      }
    });

    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, [groupId, uid, contextKey]);

  return state.contextKey === contextKey ? state : EMPTY;
}
