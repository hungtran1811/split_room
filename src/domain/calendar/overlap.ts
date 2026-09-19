import type { DaySegment, PlacedSegment } from "./types";

function overlaps(left: DaySegment, right: DaySegment): boolean {
  return left.startAt < right.endAt && right.startAt < left.endAt;
}

export function assignOverlapColumns(segments: DaySegment[]): PlacedSegment[] {
  const sorted = [...segments].sort(
    (left, right) =>
      left.startAt - right.startAt ||
      right.endAt - left.endAt ||
      left.entryId.localeCompare(right.entryId),
  );

  const placed: Array<PlacedSegment & { cluster: number }> = [];
  let clusterId = 0;
  let clusterEnd = -Infinity;
  let active: PlacedSegment[] = [];

  for (const segment of sorted) {
    active = active.filter((item) => item.endAt > segment.startAt);
    if (segment.startAt >= clusterEnd) {
      clusterId += 1;
      clusterEnd = segment.endAt;
      active = [];
    } else {
      clusterEnd = Math.max(clusterEnd, segment.endAt);
    }

    const used = new Set(active.map((item) => item.col));
    let col = 0;
    while (used.has(col)) col += 1;

    const next: PlacedSegment & { cluster: number } = {
      ...segment,
      col,
      colCount: 1,
      cluster: clusterId,
    };
    placed.push(next);
    active.push(next);
  }

  const clusterMax = new Map<number, number>();
  for (const item of placed) {
    const current = clusterMax.get(item.cluster) || 1;
    clusterMax.set(item.cluster, Math.max(current, item.col + 1));
  }

  return placed.map(({ cluster, ...item }) => ({
    ...item,
    colCount: clusterMax.get(cluster) || 1,
  }));
}

export function overlappingCount(segments: DaySegment[]): number {
  let max = 0;
  for (const segment of segments) {
    const count = segments.filter((other) => overlaps(segment, other)).length;
    if (count > max) max = count;
  }
  return max;
}
