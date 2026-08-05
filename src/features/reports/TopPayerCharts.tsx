import { chartColorOf } from "../../config/avatars";
import { nameOf } from "../../config/roster";
import { formatVND } from "../../shared/lib/format";
import type { TopPayerRow } from "../../domain/report/top-payers";
import { MemberAvatar } from "../../shared/ui/MemberAvatar";

type ChartProps = {
  rows: TopPayerRow[];
  total: number;
  myMemberId: string;
};

function DonutChart({ rows, total }: { rows: TopPayerRow[]; total: number }) {
  const size = 180;
  const stroke = 28;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;

  if (total <= 0 || !rows.length) {
    return (
      <div className="chart-donut chart-donut--empty" aria-hidden="true">
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke="var(--surface-2)"
            strokeWidth={stroke}
          />
        </svg>
      </div>
    );
  }

  return (
    <div className="chart-donut">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <g transform={`rotate(-90 ${size / 2} ${size / 2})`}>
          {rows.map((row) => {
            const portion = row.total / total;
            const length = portion * circumference;
            const dashOffset = -offset;
            offset += length;
            return (
              <circle
                key={row.payerId}
                cx={size / 2}
                cy={size / 2}
                r={radius}
                fill="none"
                stroke={chartColorOf(row.payerId)}
                strokeWidth={stroke}
                strokeDasharray={`${length} ${circumference - length}`}
                strokeDashoffset={dashOffset}
                strokeLinecap="butt"
              />
            );
          })}
        </g>
        <text
          x="50%"
          y="48%"
          textAnchor="middle"
          className="chart-donut__total-label"
          fill="currentColor"
        >
          Tổng
        </text>
        <text
          x="50%"
          y="58%"
          textAnchor="middle"
          className="chart-donut__total-value"
          fill="currentColor"
        >
          {formatVND(total)}
        </text>
      </svg>
    </div>
  );
}

function BarChart({ rows, total, myMemberId }: ChartProps) {
  const max = Math.max(1, ...rows.map((row) => row.total));

  return (
    <div className="chart-bars" role="img" aria-label="Biểu đồ cột top chi">
      {rows.map((row) => {
        const height = Math.max(8, (row.total / max) * 140);
        const pct = total > 0 ? Math.round((row.total / total) * 100) : 0;
        const isMe = row.payerId === myMemberId;
        return (
          <div
            key={row.payerId}
            className={`chart-bars__col ${isMe ? "chart-bars__col--me" : ""}`.trim()}
          >
            <div className="chart-bars__value">{pct}%</div>
            <div className="chart-bars__track">
              <div
                className="chart-bars__fill"
                style={{
                  height: `${height}px`,
                  background: chartColorOf(row.payerId),
                }}
                title={`${nameOf(row.payerId)}: ${formatVND(row.total)}`}
              />
            </div>
            <MemberAvatar memberId={row.payerId} size={28} />
            <div className="chart-bars__name">{nameOf(row.payerId)}</div>
          </div>
        );
      })}
    </div>
  );
}

export function TopPayerCharts({ rows, total, myMemberId }: ChartProps) {
  if (!rows.length) return null;

  return (
    <div className="reports-charts">
      <div className="reports-charts__visuals">
        <DonutChart rows={rows} total={total} />
        <BarChart rows={rows} total={total} myMemberId={myMemberId} />
      </div>
      <ul className="chart-legend">
        {rows.map((row) => {
          const pct = total > 0 ? Math.round((row.total / total) * 100) : 0;
          return (
            <li key={row.payerId} className="chart-legend__item">
              <MemberAvatar memberId={row.payerId} size={28} />
              <div className="chart-legend__body">
                <div className="chart-legend__name">
                  <span
                    className="chart-legend__swatch"
                    style={{ background: chartColorOf(row.payerId) }}
                  />
                  {nameOf(row.payerId)}
                  {row.payerId === myMemberId ? " (Bạn)" : ""}
                </div>
                <div className="chart-legend__meta">
                  {row.count} khoản · {pct}%
                </div>
              </div>
              <strong className="chart-legend__amount">{formatVND(row.total)}</strong>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
