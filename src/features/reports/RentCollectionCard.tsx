import { chartColorOf } from "../../config/avatars";
import { useMemberLabel } from "../../hooks/useMemberLabel";
import { EmptyState } from "../../shared/ui/EmptyState";
import { MemberAvatar } from "../../shared/ui/MemberAvatar";
import { ResponsiveMoney } from "../../shared/ui/ResponsiveMoney";
import type { RentCollectionInsight } from "../../domain/report/insights";

type RentCollectionCardProps = {
  insight: RentCollectionInsight | null;
  myMemberId: string;
};

export function RentCollectionCard({ insight, myMemberId }: RentCollectionCardProps) {
  const labelOf = useMemberLabel();
  if (!insight) {
    return (
      <EmptyState
        title="Chưa nhập tiền nhà"
        description="Khi có dữ liệu tiền nhà tháng này, tiến độ thu sẽ hiện ở đây."
      />
    );
  }

  const expected = Math.max(1, insight.collected + insight.remaining);
  const collectedPct = Math.round((insight.collected / expected) * 100);

  return (
    <div className="rent-collection">
      <div className="rent-collection__summary">
        <div>
          <div className="rent-collection__label">Đã thu</div>
          <div className="rent-collection__value money-receive">
            <ResponsiveMoney amount={insight.collected} />
          </div>
        </div>
        <div>
          <div className="rent-collection__label">Còn thiếu</div>
          <div className={`rent-collection__value ${insight.remaining > 0 ? "money-due" : "money-receive"}`}>
            <ResponsiveMoney amount={insight.remaining} />
          </div>
        </div>
        <div>
          <div className="rent-collection__label">Người trả nhà</div>
          <div className="rent-collection__payer">
            <MemberAvatar memberId={insight.payerId} size={28} />
            <span>{labelOf(insight.payerId)}</span>
          </div>
        </div>
      </div>

      <div className="rent-collection__progress" aria-hidden="true">
        <span style={{ width: `${collectedPct}%` }} />
      </div>
      <p className="rent-collection__hint">Đã thu {collectedPct}% phần cần thu từ thành viên</p>

      <ul className="rent-collection__list">
        {insight.rows.map((row) => {
          const isMe = row.memberId === myMemberId;
          const isPayer = row.memberId === insight.payerId;
          const rowLabel = `${labelOf(row.memberId)}${isMe ? " (Bạn)" : ""}${
            isPayer ? " · Người trả" : ""
          }`;
          return (
            <li
              key={row.memberId}
              className={`rent-collection__item ${isMe ? "rent-collection__item--me" : ""}`.trim()}
            >
              <MemberAvatar memberId={row.memberId} size={32} />
              <div className="rent-collection__body">
                <div className="rent-collection__name">
                  <span
                    className="chart-legend__swatch"
                    style={{ background: chartColorOf(row.memberId) }}
                  />
                  <span className="rent-collection__name-text" title={rowLabel}>
                    {rowLabel}
                  </span>
                </div>
                <div className="rent-collection__meta">
                  Phần <ResponsiveMoney amount={row.share} /> · đã{" "}
                  <ResponsiveMoney amount={row.paid} />
                </div>
                {!isPayer ? (
                  <div className="rent-collection__bar" aria-hidden="true">
                    <span
                      style={{
                        width: `${row.share > 0 ? Math.min(100, (row.paid / row.share) * 100) : 0}%`,
                        background: chartColorOf(row.memberId),
                      }}
                    />
                  </div>
                ) : null}
              </div>
              <strong className={row.due > 0 ? "money-due" : "money-receive"}>
                {isPayer ? "—" : row.due > 0 ? <ResponsiveMoney amount={row.due} /> : "Đủ"}
              </strong>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
