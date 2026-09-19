import { useEffect, useState } from "react";
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
  weekStartMs: number,
  weekEndMs: number,
): CalendarWeekState {
  const [state, setState] = useState<CalendarWeekState>(EMPTY);

  useEffect(() => {
    if (!groupId || !Number.isFinite(weekStartMs) || !Number.isFinite(weekEndMs)) {
      setState({ entries: [], ready: false, error: "Chưa chọn nhóm." });
      return;
    }

    setState((current) => ({
      entries: current.ready ? [] : current.entries,
      ready: current.ready,
      error: "",
    }));

    return watchCalendarWeek(
      groupId,
      weekStartMs,
      weekEndMs,
      (entries) => {
        setState({ entries, ready: true, error: "" });
      },
      (error) => {
        setState({ entries: [], ready: false, error: error.message });
      },
    );
  }, [groupId, weekStartMs, weekEndMs]);

  return state;
}
