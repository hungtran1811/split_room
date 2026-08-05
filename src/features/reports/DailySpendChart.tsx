import { formatVND } from "../../shared/lib/format";
import type { DailySpendRow } from "../../domain/report/insights";

type DailySpendChartProps = {
  rows: DailySpendRow[];
};

function shortDay(date: string): string {
  const day = String(date || "").slice(-2);
  return day.startsWith("0") ? day.slice(1) : day || "-";
}

export function DailySpendChart({ rows }: DailySpendChartProps) {
  if (!rows.length) return null;

  const max = Math.max(1, ...rows.map((row) => row.total));

  return (
    <div className="daily-spend-chart" role="img" aria-label="Chi tiêu theo ngày">
      <div className="daily-spend-chart__bars">
        {rows.map((row) => {
          const height = Math.max(6, (row.total / max) * 120);
          return (
            <div key={row.date} className="daily-spend-chart__col" title={`${row.date}: ${formatVND(row.total)}`}>
              <div className="daily-spend-chart__amount">{formatVND(row.total)}</div>
              <div className="daily-spend-chart__track">
                <span className="daily-spend-chart__fill" style={{ height: `${height}px` }} />
              </div>
              <div className="daily-spend-chart__label">{shortDay(row.date)}</div>
              <div className="daily-spend-chart__count">{row.count} khoản</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
