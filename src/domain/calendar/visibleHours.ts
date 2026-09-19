import { DAY_MS } from "./tz";

/** Khung giờ nổi bật mặc định: 06:00–22:00 (end exclusive). */
export const DEFAULT_VISIBLE_HOUR_START = 6;
export const DEFAULT_VISIBLE_HOUR_END = 22;

const HOUR_MS = 60 * 60 * 1000;

export type VisibleHourRange = {
  startHour: number;
  endHour: number;
};

export type TimedInterval = {
  startAt: number;
  endAt: number;
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** Ô giờ thuộc khung 6h–22h. */
export function isCoreHour(hour: number): boolean {
  return hour >= DEFAULT_VISIBLE_HOUR_START && hour < DEFAULT_VISIBLE_HOUR_END;
}

/**
 * Lưới mặc định 6–22. Mở rộng khi có lịch (hoặc giờ hiện tại) ngoài khung,
 * theo từng ngày trong tuần để sự kiện qua đêm kéo cả đầu và cuối ngày.
 */
export function visibleHourRange(params: {
  weekStartMs: number;
  weekEndMs: number;
  entries: TimedInterval[];
  nowMs?: number;
}): VisibleHourRange {
  let startHour = DEFAULT_VISIBLE_HOUR_START;
  let endHour = DEFAULT_VISIBLE_HOUR_END;

  function expandOffsets(fromHour: number, toHour: number) {
    startHour = Math.min(startHour, Math.floor(fromHour + 1e-6));
    endHour = Math.max(endHour, Math.ceil(toHour - 1e-6));
  }

  function include(startAt: number, endAt: number) {
    if (!(endAt > startAt)) return;
    let cursor = Math.max(startAt, params.weekStartMs);
    const limit = Math.min(endAt, params.weekEndMs);
    while (cursor < limit) {
      const dayStart =
        params.weekStartMs + Math.floor((cursor - params.weekStartMs) / DAY_MS) * DAY_MS;
      const dayEnd = dayStart + DAY_MS;
      const segEnd = Math.min(limit, dayEnd);
      expandOffsets((cursor - dayStart) / HOUR_MS, (segEnd - dayStart) / HOUR_MS);
      cursor = segEnd;
    }
  }

  for (const entry of params.entries) {
    include(entry.startAt, entry.endAt);
  }

  const now = params.nowMs;
  if (now != null && now >= params.weekStartMs && now < params.weekEndMs) {
    const dayStart =
      params.weekStartMs + Math.floor((now - params.weekStartMs) / DAY_MS) * DAY_MS;
    const offset = (now - dayStart) / HOUR_MS;
    expandOffsets(offset, offset);
  }

  return {
    startHour: clamp(startHour, 0, DEFAULT_VISIBLE_HOUR_START),
    endHour: clamp(endHour, DEFAULT_VISIBLE_HOUR_END, 24),
  };
}

/** Số lịch có phần nằm ngoài khung 6:00–22:00 trong tuần đang xem. */
export function countEntriesOutsideCoreHours(params: {
  weekStartMs: number;
  weekEndMs: number;
  entries: TimedInterval[];
}): number {
  return params.entries.reduce((total, entry) => {
    const range = visibleHourRange({
      weekStartMs: params.weekStartMs,
      weekEndMs: params.weekEndMs,
      entries: [entry],
    });
    const outside =
      range.startHour < DEFAULT_VISIBLE_HOUR_START || range.endHour > DEFAULT_VISIBLE_HOUR_END;
    return outside ? total + 1 : total;
  }, 0);
}
