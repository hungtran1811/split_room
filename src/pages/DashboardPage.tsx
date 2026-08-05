import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { formatVND } from "../shared/lib/format";
import { Button } from "../shared/ui/Button";
import { EmptyState } from "../shared/ui/EmptyState";
import { MetricGrid } from "../shared/ui/MetricTile";
import { MoneyRow } from "../shared/ui/MoneyRow";
import { OverviewSection } from "../shared/ui/OverviewSection";
import { PageLoadingSkeleton } from "../shared/ui/Skeleton";
import { useToast } from "../shared/ui/Toast";
import { LockBanner, PageHeader } from "../shared/ui/PageHeader";
import { useSession } from "../app/SessionContext";
import { useLiveMonth } from "../hooks/useLiveMonth";
import {
  filterMyPreviousDebts,
  usePreviousDebts,
} from "../hooks/usePreviousDebts";
import { ROSTER, ROSTER_IDS, nameOf } from "../config/roster";
import { resolveMemberIdFromEmail } from "../config/members.map";
import { canOperateMonth, canViewFullSettlement } from "../core/roles";
import { buildMonthlySettlementView } from "../domain/matrix/compute";
import {
  filterBalancesForMember,
  filterSettlementForMember,
  type SettlementPlanItem,
} from "../domain/settlement/compute";
import type { ExpenseDoc } from "../types/models";
import { closeMonthManual } from "../services/month-close.service";

function formatPeriodShort(period: string): string {
  const [year, month] = String(period || "").split("-");
  if (!year || !month) return period || "";
  return `Tháng ${Number(month)}/${year}`;
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
  const previous = usePreviousDebts(session.groupId, session.selectedPeriod);
  const ready = live.expensesReady && live.paymentsReady && live.rentReady;

  const liveView = useMemo(() => {
    return buildMonthlySettlementView({
      roster: [...ROSTER],
      expenses: live.expenses as Array<{ payerId?: string; debts?: Record<string, number> }>,
      payments: live.payments as Array<{ amount?: number; fromId?: string; toId?: string }>,
    });
  }, [live.expenses, live.payments]);

  const expenses = live.expenses as ExpenseDoc[];
  const expenseTotal = expenses.reduce((sum, item) => sum + Number(item.amount || 0), 0);
  const paymentsApplied = liveView.paymentsAppliedTotal;
  const settlementPlanRaw =
    (session.lockedSoft && session.periodDoc?.snapshot?.settlementPlan
      ? (session.periodDoc.snapshot.settlementPlan as SettlementPlanItem[])
      : liveView.settlementPlan) || [];
  const balancesRaw =
    (session.lockedSoft && session.periodDoc?.snapshot?.balances
      ? (session.periodDoc.snapshot.balances as Record<string, number>)
      : liveView.balances) || liveView.balances;

  const viewFull = canViewFullSettlement(session.memberProfile);
  const settlementPlan = viewFull
    ? settlementPlanRaw
    : filterSettlementForMember(settlementPlanRaw, myMemberId);
  const balances = viewFull
    ? balancesRaw
    : filterBalancesForMember(balancesRaw, myMemberId);

  const rentDoc = live.rent;
  const rentTotal = Number(rentDoc?.total || 0);
  const rentShares = (rentDoc?.shares as Record<string, number>) || {};
  const rentPaid = (rentDoc?.paid as Record<string, number>) || {};
  const rentPayerId = String(rentDoc?.payerId || "hung");

  const myPayTotal = settlementPlan
    .filter((item) => item.fromId === myMemberId)
    .reduce((sum, item) => sum + Number(item.amount || 0), 0);
  const myReceiveTotal = settlementPlan
    .filter((item) => item.toId === myMemberId)
    .reduce((sum, item) => sum + Number(item.amount || 0), 0);

  const remainingDebt = viewFull
    ? liveView.totals.remainingDebtTotal
    : settlementPlan.reduce((sum, item) => sum + Number(item.amount || 0), 0);

  const myOldDebts = useMemo(
    () => filterMyPreviousDebts(previous.months, myMemberId),
    [previous.months, myMemberId],
  );
  const oldDebtTotal = myOldDebts.reduce((sum, item) => sum + item.amount, 0);

  const groupPrevDebts = useMemo(() => {
    const rows: Array<{ period: string; fromId: string; toId: string; amount: number }> = [];
    for (const month of previous.months) {
      for (const item of month.carryPlan || []) {
        if (Number(item.amount) <= 0) continue;
        if (
          !viewFull &&
          item.fromId !== myMemberId &&
          item.toId !== myMemberId
        ) {
          continue;
        }
        rows.push({
          period: month.period,
          fromId: item.fromId,
          toId: item.toId,
          amount: Number(item.amount),
        });
      }
    }
    return rows;
  }, [previous.months, viewFull, myMemberId]);

  const recentExpenses = useMemo(
    () =>
      [...expenses]
        .sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")))
        .slice(0, 6),
    [expenses],
  );

  const orderedSettlement = useMemo(() => {
    return [...settlementPlan].sort((a, b) => {
      const aMine = a.fromId === myMemberId || a.toId === myMemberId ? 0 : 1;
      const bMine = b.fromId === myMemberId || b.toId === myMemberId ? 0 : 1;
      return aMine - bMine || Number(b.amount || 0) - Number(a.amount || 0);
    });
  }, [settlementPlan, myMemberId]);

  const memberBalances = useMemo(() => {
    const ids = viewFull ? ROSTER.map((m) => m.id) : [myMemberId];
    return ids
      .map((id) => {
        const rosterMember = ROSTER.find((m) => m.id === id);
        const value = Number(balances?.[id] || 0);
        return { id, name: rosterMember?.name || nameOf(id), value };
      })
      .sort((a, b) => a.value - b.value);
  }, [balances, viewFull, myMemberId]);

  const maxAbsBalance = useMemo(
    () => Math.max(1, ...memberBalances.map((item) => Math.abs(item.value))),
    [memberBalances],
  );

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
      showToast({
        title: "Xong",
        message: `Đã khóa tháng ${session.selectedPeriod} và gửi nhắc cho nhóm.`,
        variant: "success",
      });
    } catch (error) {
      showToast({
        title: "Chưa được",
        message: (error as { message?: string })?.message || "Không khóa được tháng này.",
        variant: "danger",
      });
    } finally {
      setClosing(false);
    }
  }

  if (!ready) {
    return (
      <div className="dashboard-page overview-page">
        <PageLoadingSkeleton stats={4} rows={4} />
      </div>
    );
  }

  return (
    <div className="dashboard-page overview-page">
      <PageHeader
        title="Tổng quan"
        subtitle={
          viewFull
            ? `Tháng ${session.selectedPeriod} · mọi người trong nhóm đều xem được`
            : `Tháng ${session.selectedPeriod} · chỉ khoản nợ liên quan bạn`
        }
        action={
          <Button variant="ghost" className="btn--sm" onClick={() => navigate("/expenses")}>
            + Chi tiêu
          </Button>
        }
      />

      {session.lockedSoft ? (
        <LockBanner>
          Tháng {session.selectedPeriod} đã khóa — mọi người chỉ xem, không thêm hay sửa.
        </LockBanner>
      ) : null}

      <MetricGrid
        columns={4}
        tiles={[
          {
            key: "expense",
            label: "Tổng chi chung",
            value: formatVND(expenseTotal),
            hint: `${expenses.length} khoản`,
          },
          {
            key: "paid",
            label: "Đã chuyển",
            value: formatVND(paymentsApplied),
            tone: "positive",
            hint: `${live.payments.length} giao dịch`,
          },
          {
            key: "remain",
            label: "Còn cần chuyển",
            value: formatVND(remainingDebt),
            tone: remainingDebt > 0 ? "danger" : "positive",
            hint: `${settlementPlan.length} giao dịch gợi ý`,
          },
          {
            key: "rent",
            label: "Tiền nhà",
            value: rentDoc ? formatVND(rentTotal) : "Chưa có",
            hint: rentDoc ? `Người trả: ${nameOf(rentPayerId)}` : "Chưa nhập",
            tone: rentDoc ? "neutral" : "warning",
          },
        ]}
      />

      <section className="balance-strip balance-strip--personal" aria-label="Phần của bạn">
        <p className="balance-strip__period">Phần của bạn</p>
        <div className="balance-strip__grid">
          <div className="balance-strip__cell">
            <span className="balance-strip__label">Bạn cần trả</span>
            <span
              className={`balance-strip__value ${
                myPayTotal + oldDebtTotal > 0 ? "money-due" : "money-neutral"
              }`}
            >
              {formatVND(myPayTotal + oldDebtTotal)}
            </span>
          </div>
          <div className="balance-strip__divider" aria-hidden="true" />
          <div className="balance-strip__cell">
            <span className="balance-strip__label">Bạn sẽ nhận</span>
            <span
              className={`balance-strip__value ${
                myReceiveTotal > 0 ? "money-receive" : "money-neutral"
              }`}
            >
              {formatVND(myReceiveTotal)}
            </span>
          </div>
        </div>
        {oldDebtTotal > 0 ? (
          <p className="balance-strip__hint">
            Gồm nợ tháng trước {formatVND(oldDebtTotal)}
          </p>
        ) : null}
        <div className="balance-strip__actions btn-row">
          {myPayTotal + oldDebtTotal > 0 ? (
            <Button variant="primary" onClick={() => navigate("/payments?tab=suggest")}>
              Xử lý thanh toán
            </Button>
          ) : null}
          {viewFull ? (
            <Button variant="ghost" onClick={() => navigate("/payments?tab=matrix")}>
              Xem chi tiết nhóm
            </Button>
          ) : (
            <Button variant="ghost" onClick={() => navigate("/payments?tab=suggest")}>
              Xem khoản nợ của bạn
            </Button>
          )}
        </div>
      </section>

      <div className="overview-grid">
        <OverviewSection
          title={viewFull ? "Ai cần chuyển cho ai" : "Khoản nợ liên quan bạn"}
          action={
            <Button
              variant="ghost"
              className="btn--sm"
              onClick={() => navigate("/payments?tab=suggest")}
            >
              Thanh toán
            </Button>
          }
        >
          {!orderedSettlement.length ? (
            <EmptyState
              title="Không còn giao dịch cần chuyển"
              description="Chi chung đã được cân bằng hoặc chưa có khoản chi."
            />
          ) : (
            <div className="money-row-list">
              {orderedSettlement.map((item, index) => {
                const mine = item.fromId === myMemberId || item.toId === myMemberId;
                const iPay = item.fromId === myMemberId;
                const tone = iPay ? "due" : item.toId === myMemberId ? "receive" : "neutral";
                return (
                  <MoneyRow
                    key={`${item.fromId}-${item.toId}-${index}`}
                    memberId={item.fromId}
                    avatarLabel={nameOf(item.fromId)}
                    title={`${nameOf(item.fromId)} → ${nameOf(item.toId)}`}
                    subtitle={mine ? (iPay ? "Bạn cần chuyển" : "Bạn sẽ nhận") : undefined}
                    amount={formatVND(item.amount)}
                    tone={tone}
                    highlight={mine}
                  />
                );
              })}
            </div>
          )}
        </OverviewSection>

        <OverviewSection title={viewFull ? "Số dư từng người" : "Số dư của bạn"}>
          <div className="money-row-list">
            {memberBalances.map((member) => {
              const isMe = member.id === myMemberId;
              const tone =
                member.value < 0 ? "due" : member.value > 0 ? "receive" : "neutral";
              const label =
                member.value < 0
                  ? "Còn cần chuyển"
                  : member.value > 0
                    ? "Đang được nhận"
                    : "Ổn";
              return (
                <MoneyRow
                  key={member.id}
                  memberId={member.id}
                  avatarLabel={member.name}
                  title={member.name}
                  subtitle={label}
                  badge={isMe ? "Bạn" : undefined}
                  amount={formatVND(Math.abs(member.value))}
                  tone={tone}
                  highlight={isMe}
                  barPercent={(Math.abs(member.value) / maxAbsBalance) * 100}
                />
              );
            })}
          </div>
        </OverviewSection>
      </div>

      {groupPrevDebts.length > 0 ? (
        <OverviewSection
          title="Nợ còn treo từ tháng trước"
          subtitle={
            viewFull
              ? `${groupPrevDebts.length} khoản · mọi người trong nhóm đều thấy`
              : `${groupPrevDebts.length} khoản liên quan bạn`
          }
        >
          <div className="money-row-list">
            {groupPrevDebts.slice(0, 8).map((item) => (
              <MoneyRow
                key={`${item.period}-${item.fromId}-${item.toId}`}
                memberId={item.fromId}
                avatarLabel={nameOf(item.fromId)}
                title={`${nameOf(item.fromId)} → ${nameOf(item.toId)}`}
                badge={formatPeriodShort(item.period)}
                amount={formatVND(item.amount)}
                tone={item.fromId === myMemberId ? "due" : "neutral"}
                highlight={item.fromId === myMemberId || item.toId === myMemberId}
              />
            ))}
          </div>
          {groupPrevDebts.length > 8 ? (
            <p className="payments-note">+{groupPrevDebts.length - 8} khoản khác</p>
          ) : null}
        </OverviewSection>
      ) : null}

      <div className="overview-grid">
        <OverviewSection
          title="Chi gần đây"
          subtitle={`Trong tháng ${session.selectedPeriod}`}
          action={
            <Button variant="ghost" className="btn--sm" onClick={() => navigate("/expenses")}>
              Tất cả
            </Button>
          }
        >
          {!recentExpenses.length ? (
            <EmptyState
              title="Chưa có chi tiêu"
              description="Thêm khoản chi để nhóm theo dõi chung."
              action={
                <Button variant="primary" onClick={() => navigate("/expenses")}>
                  Thêm khoản chi
                </Button>
              }
            />
          ) : (
            <div className="money-row-list">
              {recentExpenses.map((expense) => (
                <MoneyRow
                  key={expense.id}
                  memberId={expense.payerId || ""}
                  avatarLabel={nameOf(expense.payerId || "")}
                  title={expense.note || "Khoản chi"}
                  subtitle={`${expense.date} · ${nameOf(expense.payerId || "")} trả`}
                  amount={formatVND(expense.amount)}
                />
              ))}
            </div>
          )}
        </OverviewSection>

        <OverviewSection
          title="Tiền nhà tháng này"
          subtitle={rentDoc ? `Tổng ${formatVND(rentTotal)}` : "Chưa có dữ liệu"}
          action={
            <Button variant="ghost" className="btn--sm" onClick={() => navigate("/rent")}>
              Chi tiết
            </Button>
          }
        >
          {!rentDoc ? (
            <EmptyState
              title="Chưa nhập tiền nhà"
              description="Khi có người nhập, phần của từng thành viên sẽ hiện ở đây."
            />
          ) : (
            <div className="money-row-list">
              {(viewFull ? ROSTER : ROSTER.filter((m) => m.id === myMemberId)).map((member) => {
                const share = Number(rentShares[member.id] || 0);
                const paid = Number(rentPaid[member.id] || 0);
                const due = Math.max(0, share - paid);
                const isPayer = member.id === rentPayerId;
                return (
                  <MoneyRow
                    key={member.id}
                    memberId={member.id}
                    avatarLabel={member.name}
                    title={member.name}
                    badge={isPayer ? "Người trả" : member.id === myMemberId ? "Bạn" : undefined}
                    subtitle={`Phần ${formatVND(share)} · đã ${formatVND(paid)}`}
                    amount={due > 0 ? formatVND(due) : "Đủ"}
                    tone={due > 0 ? "due" : "receive"}
                    highlight={member.id === myMemberId}
                  />
                );
              })}
            </div>
          )}
        </OverviewSection>
      </div>

      {canCloseMonth ? (
        <section className="home-close">
          <p className="section-label">Cuối tháng</p>
          <p className="home-close__hint">
            Khóa tháng {session.selectedPeriod} — nhóm chỉ xem và nhận nhắc.
          </p>
          <Button variant="ghost" disabled={closing} onClick={() => void handleCloseMonth()}>
            {closing ? "Đang khóa…" : "Khóa tháng này"}
          </Button>
        </section>
      ) : null}
    </div>
  );
}
