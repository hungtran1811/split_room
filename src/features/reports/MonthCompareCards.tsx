import { formatVND } from "../../shared/lib/format";
import { MetricGrid } from "../../shared/ui/MetricTile";
import type { MonthCompareResult } from "../../domain/report/insights";

type MonthCompareCardsProps = {
  compare: MonthCompareResult;
};

function formatPeriodShort(period: string): string {
  const [year, month] = String(period || "").split("-");
  if (!year || !month) return period || "-";
  return `T${Number(month)}/${year}`;
}

export function MonthCompareCards({ compare }: MonthCompareCardsProps) {
  const max = Math.max(1, compare.currentTotal, compare.previousTotal);
  const deltaTone =
    compare.deltaTotal > 0 ? "danger" : compare.deltaTotal < 0 ? "positive" : "neutral";
  const deltaLabel =
    compare.deltaPct === null
      ? "—"
      : `${compare.deltaTotal > 0 ? "+" : ""}${compare.deltaPct}%`;

  return (
    <div className="month-compare">
      <MetricGrid
        columns={3}
        tiles={[
          {
            key: "current",
            label: formatPeriodShort(compare.currentPeriod),
            value: formatVND(compare.currentTotal),
            hint: `${compare.currentCount} khoản`,
          },
          {
            key: "previous",
            label: formatPeriodShort(compare.previousPeriod),
            value: formatVND(compare.previousTotal),
            hint: `${compare.previousCount} khoản`,
          },
          {
            key: "delta",
            label: "Chênh lệch",
            value: `${compare.deltaTotal > 0 ? "+" : ""}${formatVND(compare.deltaTotal)}`,
            hint: deltaLabel,
            tone: deltaTone,
          },
        ]}
      />
      <div className="month-compare__bars" aria-hidden="true">
        <div className="month-compare__row">
          <span className="month-compare__name">{formatPeriodShort(compare.currentPeriod)}</span>
          <div className="month-compare__track">
            <span
              className="month-compare__fill month-compare__fill--current"
              style={{ width: `${(compare.currentTotal / max) * 100}%` }}
            />
          </div>
        </div>
        <div className="month-compare__row">
          <span className="month-compare__name">{formatPeriodShort(compare.previousPeriod)}</span>
          <div className="month-compare__track">
            <span
              className="month-compare__fill month-compare__fill--previous"
              style={{ width: `${(compare.previousTotal / max) * 100}%` }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
