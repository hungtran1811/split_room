import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { formatVND } from "../shared/lib/format";
import { MetricGrid } from "../shared/ui/MetricTile";
import { SkeletonList, SkeletonStatGrid } from "../shared/ui/Skeleton";
import { useToast } from "../shared/ui/Toast";
import { useSession } from "../app/SessionContext";
import { useLiveMonth } from "../hooks/useLiveMonth";
import { ROSTER, ROSTER_IDS } from "../config/roster";
import { resolveMemberIdFromEmail } from "../config/members.map";
import { canOperateMonth } from "../core/roles";
import { buildMonthlySettlementView } from "../domain/matrix/compute";
import type { SettlementPlanItem } from "../domain/settlement/compute";
import { closeMonthManual } from "../services/month-close.service";

type RentSummary =
  | { mode: "payer"; total: number; myShare: number; collectedFromOthers: number; remaining: number }
  | { mode: "member"; total: number; share: number; alreadyPaid: number; remaining: number };

function summarizeRentForMember(
  rentDoc: Record<string, unknown> | null,
  memberId: string | null,
): RentSummary | null {
  if (!rentDoc || !memberId) return null;

  const payerId = String(rentDoc.payerId || "hung");
  const shares = (rentDoc.shares as Record<string, number>) || {};
  const paid = (rentDoc.paid as Record<string, number>) || {};
  const total = Number(rentDoc.total || 0);

  if (memberId === payerId) {
    const myShare = Number(shares[payerId] || 0);
    const expectedFromOthers = Math.max(0, total - myShare);
    const collectedFromOthers = Object.entries(paid).reduce(
      (sum, [id, value]) => sum + (id === payerId ? 0 : Number(value || 0)),
      0,
    );
    return {
      mode: "payer",
      total,
      myShare,
      collectedFromOthers,
      remaining: Math.max(0, expectedFromOthers - collectedFromOthers),
    };
  }

  const share = Number(shares[memberId] || 0);
  const alreadyPaid = Number(paid[memberId] || 0);
  return {
    mode: "member",
    total,
    share,
    alreadyPaid,
    remaining: Math.max(0, share - alreadyPaid),
  };
}

function computePersonalDebt(
  myMemberId: string | null,
  rentSummary: RentSummary | null,
  settlementPlan: SettlementPlanItem[],
  hasRentDoc: boolean,
) {
  const rentDebt = rentSummary?.mode === "member" ? Math.max(0, rentSummary.remaining) : 0;
  const expenseDebt = settlementPlan.reduce(
    (sum, item) => sum + (item.fromId === myMemberId ? Math.max(0, Number(item.amount || 0)) : 0),
    0,
  );
  const total = rentDebt + expenseDebt;
  const breakdown: Array<{ label: string; amount: number }> = [];
  if (rentDebt > 0) breakdown.push({ label: "Tiền nhà", amount: rentDebt });
  if (expenseDebt > 0) breakdown.push({ label: "Chi tiêu chung", amount: expenseDebt });

  const status = total > 0 ? "debt" : !hasRentDoc ? "pending" : "settled";
  const statusLabel = status === "debt" ? "Còn nợ" : status === "pending" ? "Chưa nhập nhà" : "Ổn";
  return { total, breakdown, status, statusLabel };
}

export function DashboardPage() {
  const session = useSession();
  const navigate = useNavigate();
  const { showToast } = useToast();
  const [closing, setClosing] = useState(false);

  const myMemberId =
    session.memberProfile?.memberId ||
    resolveMemberIdFromEmail(session.user?.email) ||
    ROSTER_IDS[0];

  const live = useLiveMonth("dashboard", session.groupId, session.selectedPeriod);
  const ready = live.expensesReady && live.paymentsReady && live.rentReady;

  const settlement = useMemo(() => {
    const snapshot = session.periodDoc?.snapshot;
    if (session.lockedSoft && snapshot?.balances && snapshot?.settlementPlan) {
      return {
        settlementPlan: snapshot.settlementPlan as SettlementPlanItem[],
      };
    }
    return buildMonthlySettlementView({
      roster: [...ROSTER],
      expenses: live.expenses as Array<{ payerId?: string; debts?: Record<string, number> }>,
      payments: live.payments as Array<{ amount?: number; fromId?: string; toId?: string }>,
    });
  }, [session.lockedSoft, session.periodDoc, live.expenses, live.payments]);

  const rentSummary = summarizeRentForMember(live.rent, myMemberId);
  const personalDebt = computePersonalDebt(
    myMemberId,
    rentSummary,
    settlement.settlementPlan,
    Boolean(live.rent),
  );

  const expenseTotal = live.expenses.reduce((sum, item) => sum + Number((item as { amount?: number }).amount || 0), 0);
  const paymentTotal = live.payments.reduce((sum, item) => sum + Number((item as { amount?: number }).amount || 0), 0);
  const rentTotal = Number((live.rent as { total?: number } | null)?.total || 0);

  const operator = canOperateMonth(session.memberProfile);
  const canCloseMonth = operator && !session.lockedSoft;

  async function handleCloseMonth() {
    if (!session.groupId) return;
    setClosing(true);
    try {
      await closeMonthManual(session.groupId, session.selectedPeriod, {
        uid: session.user?.uid,
      });
      await session.refreshPeriod();
      showToast({ title: "Thành công", message: `Đã chốt tháng ${session.selectedPeriod}.`, variant: "success" });
    } catch (error) {
      showToast({
        title: "Thất bại",
        message: (error as { message?: string })?.message || "Không thể chốt tháng.",
        variant: "danger",
      });
    } finally {
      setClosing(false);
    }
  }

  if (!ready) {
    return (
      <div className="dashboard-page">
        <SkeletonStatGrid />
        <SkeletonList count={2} />
      </div>
    );
  }

  return (
    <div className="dashboard-page">
      <section className={`balance-card balance-card--${personalDebt.status}`}>
        <div className="balance-card__top">
          <span className="balance-card__label">Còn phải trả</span>
          <span className="balance-card__badge">{personalDebt.statusLabel}</span>
        </div>
        <div className="balance-card__amount">{formatVND(personalDebt.total)}</div>
        {personalDebt.breakdown.length ? (
          <div className="balance-card__breakdown">
            {personalDebt.breakdown.map((item) => (
              <span key={item.label} className="balance-card__chip">
                {item.label} <strong>{formatVND(item.amount)}</strong>
              </span>
            ))}
          </div>
        ) : null}
        <div className="balance-card__actions">
          {personalDebt.total > 0 ? (
            <button type="button" className="btn btn--primary" onClick={() => navigate("/payments?tab=suggest")}>
              Cấn trừ ngay
            </button>
          ) : (
            <button type="button" className="btn btn--primary" onClick={() => navigate("/expenses")}>
              Ghi chi tiêu
            </button>
          )}
        </div>
      </section>

      <MetricGrid
        columns={4}
        tiles={[
          { label: "Chi", value: formatVND(expenseTotal) },
          { label: "Đã trả", value: formatVND(paymentTotal), tone: paymentTotal > 0 ? "positive" : "neutral" },
          { label: "Nhà", value: formatVND(rentTotal), tone: rentTotal > 0 ? "warning" : "neutral" },
          {
            label: "Cấn trừ",
            value: settlement.settlementPlan.length || 0,
            tone: settlement.settlementPlan.length ? "danger" : "positive",
          },
        ]}
      />

      <div className="dash-cta-row">
        <button type="button" className="btn btn--ghost" onClick={() => navigate("/expenses")}>
          Chi tiêu
        </button>
        <button type="button" className="btn btn--ghost" onClick={() => navigate("/payments")}>
          Cấn trừ
        </button>
        <button type="button" className="btn btn--ghost" onClick={() => navigate("/rent")}>
          Tiền nhà
        </button>
      </div>

      <section className="card">
        <div className="card__head">
          <h2 className="card__title">Tiền nhà tháng này</h2>
          <button type="button" className="btn btn--ghost btn--sm" onClick={() => navigate("/rent")}>
            Mở
          </button>
        </div>
        {!rentSummary ? (
          <p className="form-hint">Chưa có dữ liệu tiền nhà tháng {session.selectedPeriod}.</p>
        ) : (
          <div className="rent-panel">
            <div className="rent-panel__stats">
              {rentSummary.mode === "payer" ? (
                <>
                  <div className="rent-panel__stat">
                    <div className="rent-panel__stat-label">Phần của bạn</div>
                    <div className="rent-panel__stat-value">{formatVND(rentSummary.myShare)}</div>
                  </div>
                  <div className="rent-panel__stat">
                    <div className="rent-panel__stat-label">Đã thu</div>
                    <div className="rent-panel__stat-value">{formatVND(rentSummary.collectedFromOthers)}</div>
                  </div>
                </>
              ) : (
                <>
                  <div className="rent-panel__stat">
                    <div className="rent-panel__stat-label">Cần trả</div>
                    <div className="rent-panel__stat-value">{formatVND(rentSummary.share)}</div>
                  </div>
                  <div className="rent-panel__stat">
                    <div className="rent-panel__stat-label">Đã trả</div>
                    <div className="rent-panel__stat-value">{formatVND(rentSummary.alreadyPaid)}</div>
                  </div>
                </>
              )}
              <div className="rent-panel__stat">
                <div className="rent-panel__stat-label">Còn thiếu</div>
                <div className="rent-panel__stat-value">{formatVND(rentSummary.remaining)}</div>
              </div>
            </div>
          </div>
        )}
      </section>

      {canCloseMonth ? (
        <section className="card">
          <div className="card__head">
            <div>
              <h2 className="card__title">Chốt tháng {session.selectedPeriod}</h2>
              <p className="card__subtitle">
                Khóa mềm tháng này và lưu snapshot số dư, cấn trừ, tiền nhà hiện tại.
              </p>
            </div>
          </div>
          <button type="button" className="btn btn--primary" disabled={closing} onClick={() => void handleCloseMonth()}>
            {closing ? "Đang chốt..." : "Chốt tháng"}
          </button>
        </section>
      ) : null}
    </div>
  );
}
