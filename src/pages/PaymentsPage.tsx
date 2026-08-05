import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { formatVND } from "../shared/lib/format";
import { Button } from "../shared/ui/Button";
import { BottomSheet } from "../shared/ui/BottomSheet";
import { EmptyState } from "../shared/ui/EmptyState";
import { LockBanner, PageHeader, RowAction } from "../shared/ui/PageHeader";
import { SegmentedTabs, type SegmentedTab } from "../shared/ui/SegmentedTabs";
import { SkeletonList } from "../shared/ui/Skeleton";
import { useToast } from "../shared/ui/Toast";
import { useSession } from "../app/SessionContext";
import { useLiveMonth } from "../hooks/useLiveMonth";
import { ROSTER, ROSTER_IDS, nameOf } from "../config/roster";
import { resolveMemberIdFromEmail } from "../config/members.map";
import { canOperateMonth } from "../core/roles";
import { getMonthRange, lastDayOfPeriod } from "../core/period";
import { parseVndInput } from "../core/money";
import { buildMonthlySettlementView } from "../domain/matrix/compute";
import type { SettlementPlanItem } from "../domain/settlement/compute";
import type { PaymentDoc } from "../types/models";
import { addPayment, removePayment, updatePayment } from "../services/payment.service";

const TABS: SegmentedTab[] = [
  { id: "suggest", label: "Gợi ý" },
  { id: "history", label: "Lịch sử" },
  { id: "matrix", label: "Ma trận" },
];

function todayYmd(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

function defaultPaymentDate(period: string): string {
  const today = todayYmd();
  if (today.startsWith(`${period}-`)) return today;
  return lastDayOfPeriod(period);
}

type PaySheetState = {
  open: boolean;
  fromId: string;
  toId: string;
  amount: string;
  maxAmount: number | null;
  lockAmount: boolean;
  date: string;
  note: string;
  title: string;
};

type EditPaymentState = {
  open: boolean;
  paymentId: string;
  date: string;
  note: string;
};

function emptyPaySheet(): PaySheetState {
  return {
    open: false,
    fromId: "",
    toId: "",
    amount: "",
    maxAmount: null,
    lockAmount: false,
    date: "",
    note: "",
    title: "Ghi nhận thanh toán",
  };
}

export function PaymentsPage() {
  const session = useSession();
  const navigate = useNavigate();
  const { showToast } = useToast();
  const live = useLiveMonth("payments", session.groupId, session.selectedPeriod);
  const [activeTab, setActiveTab] = useState("suggest");
  const [paySheet, setPaySheet] = useState<PaySheetState>(emptyPaySheet);
  const [payError, setPayError] = useState("");
  const [paySaving, setPaySaving] = useState(false);
  const [editPayment, setEditPayment] = useState<EditPaymentState>({ open: false, paymentId: "", date: "", note: "" });
  const [editError, setEditError] = useState("");
  const [editSaving, setEditSaving] = useState(false);

  const myMemberId =
    session.memberProfile?.memberId ||
    resolveMemberIdFromEmail(session.user?.email) ||
    ROSTER_IDS[0];

  const canOperate = canOperateMonth(session.memberProfile) && !session.lockedSoft;

  const expenses = live.expenses;
  const payments = live.payments as PaymentDoc[];

  const liveSettlement = useMemo(
    () =>
      buildMonthlySettlementView({
        roster: [...ROSTER],
        expenses: expenses as Array<{ payerId?: string; debts?: Record<string, number> }>,
        payments: payments as Array<{ amount?: number; fromId?: string; toId?: string }>,
      }),
    [expenses, payments],
  );

  const frozenSettlementPlan =
    session.lockedSoft && session.periodDoc?.snapshot?.settlementPlan
      ? (session.periodDoc.snapshot.settlementPlan as SettlementPlanItem[])
      : null;

  const settlementPlan = frozenSettlementPlan || liveSettlement.settlementPlan;

  const orderedSettlement = useMemo(() => {
    return [...settlementPlan].sort((a, b) => {
      const aMine = a.fromId === myMemberId ? 0 : 1;
      const bMine = b.fromId === myMemberId ? 0 : 1;
      return aMine - bMine;
    });
  }, [settlementPlan, myMemberId]);

  const ready = live.expensesReady && live.paymentsReady;

  function openPaySheet(item: SettlementPlanItem, lockAmount: boolean) {
    const amount = Math.max(0, Math.round(item.amount));
    setPaySheet({
      open: true,
      fromId: item.fromId,
      toId: item.toId,
      amount: String(amount),
      maxAmount: lockAmount ? null : amount,
      lockAmount,
      date: defaultPaymentDate(session.selectedPeriod),
      note: lockAmount ? "Trả đủ theo cấn trừ" : "Trả một phần theo cấn trừ",
      title: lockAmount ? "Ghi nhận trả đủ" : "Ghi nhận trả một phần",
    });
    setPayError("");
  }

  async function submitPaySheet() {
    setPayError("");
    const { start, end } = getMonthRange(session.selectedPeriod);
    const amount = Math.round(parseVndInput(paySheet.amount));

    if (!amount || amount <= 0) {
      setPayError("Số tiền không hợp lệ.");
      return;
    }
    if (typeof paySheet.maxAmount === "number" && amount > paySheet.maxAmount) {
      setPayError("Không được vượt quá số tiền đang nợ theo cấn trừ.");
      return;
    }
    if (!paySheet.date || paySheet.date < start || paySheet.date >= end) {
      setPayError(`Ngày ghi nhận phải thuộc tháng ${session.selectedPeriod}.`);
      return;
    }

    setPaySaving(true);
    try {
      await addPayment(session.groupId!, {
        fromId: paySheet.fromId,
        toId: paySheet.toId,
        amount,
        date: paySheet.date,
        note: paySheet.note.trim(),
        createdBy: session.user?.uid,
      });
      showToast({ title: "Thành công", message: "Đã ghi nhận thanh toán.", variant: "success" });
      setPaySheet(emptyPaySheet());
    } catch (error) {
      setPayError((error as { message?: string })?.message || "Không thể ghi nhận thanh toán.");
    } finally {
      setPaySaving(false);
    }
  }

  function openEditPayment(payment: PaymentDoc) {
    setEditPayment({ open: true, paymentId: payment.id, date: payment.date || "", note: payment.note || "" });
    setEditError("");
  }

  async function submitEditPayment() {
    setEditError("");
    if (!editPayment.date) {
      setEditError("Ngày thanh toán không được để trống.");
      return;
    }
    setEditSaving(true);
    try {
      await updatePayment(session.groupId!, editPayment.paymentId, {
        date: editPayment.date,
        note: editPayment.note.trim(),
      });
      showToast({ title: "Thành công", message: "Đã cập nhật thanh toán.", variant: "success" });
      setEditPayment({ open: false, paymentId: "", date: "", note: "" });
    } catch (error) {
      setEditError((error as { message?: string })?.message || "Không thể cập nhật thanh toán.");
    } finally {
      setEditSaving(false);
    }
  }

  async function handleDeletePayment(payment: PaymentDoc) {
    if (!session.groupId) return;
    const confirmed = window.confirm(
      `Xóa thanh toán ${nameOf(payment.fromId || "")} → ${nameOf(payment.toId || "")} (${formatVND(payment.amount)})?`,
    );
    if (!confirmed) return;

    try {
      await removePayment(session.groupId, payment.id);
      showToast({ title: "Đã xóa", message: "Thanh toán đã được xóa.", variant: "success" });
    } catch (error) {
      showToast({
        title: "Thất bại",
        message: (error as { message?: string })?.message || "Không thể xóa thanh toán.",
        variant: "danger",
      });
    }
  }

  const sortedPayments = useMemo(
    () => [...payments].sort((a, b) => String(b.date || "").localeCompare(String(a.date || ""))),
    [payments],
  );

  return (
    <div className="payments-page">
      <PageHeader title="Cấn trừ" subtitle={`Tháng ${session.selectedPeriod}`} />

      <SegmentedTabs tabs={TABS} value={activeTab} onChange={setActiveTab} ariaLabel="Chuyển tab cấn trừ" />

      {session.lockedSoft ? (
        <LockBanner>Tháng {session.selectedPeriod} đã chốt — không thể ghi nhận thanh toán mới.</LockBanner>
      ) : null}

      <div className="payments-page__body">
        {!ready ? (
          <SkeletonList count={3} />
        ) : activeTab === "suggest" ? (
          <section className="card">
            <div className="card__head">
              <h2 className="card__title">Gợi ý cấn trừ tháng này</h2>
              {frozenSettlementPlan ? <span className="status-badge status-badge--pending">Đã chốt</span> : null}
            </div>
            {!orderedSettlement.length ? (
              <EmptyState
                title={expenses.length ? "Đã cân bằng" : "Chưa có chi tiêu"}
                description={
                  expenses.length
                    ? "Không còn khoản cấn trừ nào trong tháng này."
                    : "Thêm chi tiêu trước để hệ thống gợi ý cấn trừ."
                }
                action={
                  <Button variant="primary" onClick={() => navigate("/expenses")}>
                    {expenses.length ? "Xem chi tiêu" : "Thêm chi tiêu"}
                  </Button>
                }
              />
            ) : (
              <div className="stack-list">
                {orderedSettlement.map((item, index) => {
                  const mine = item.fromId === myMemberId;
                  return (
                    <article key={`${item.fromId}-${item.toId}-${index}`} className={`list-row ${mine ? "settlement-item--mine" : ""}`.trim()}>
                      <div className="list-row__body">
                        <div className="list-row__title">
                          {nameOf(item.fromId)} → {nameOf(item.toId)}
                        </div>
                        {mine ? <div className="list-row__subtitle">Bạn phải trả</div> : null}
                      </div>
                      <div className="list-row__amount">{formatVND(item.amount)}</div>
                      {canOperate ? (
                        <div className="list-row__actions">
                          <RowAction label="Đủ" variant="primary" onClick={() => openPaySheet(item, true)} />
                          <RowAction label="Một phần" onClick={() => openPaySheet(item, false)} />
                        </div>
                      ) : null}
                    </article>
                  );
                })}
              </div>
            )}
          </section>
        ) : activeTab === "history" ? (
          <section className="card">
            <h2 className="card__title">Lịch sử thanh toán tháng này</h2>
            {!sortedPayments.length ? (
              <EmptyState
                title="Chưa có giao dịch"
                description="Ghi nhận thanh toán từ tab Gợi ý hoặc sau khi có chi tiêu trong tháng."
              />
            ) : (
              <div className="stack-list">
                {sortedPayments.map((payment) => (
                  <article key={payment.id} className="list-row">
                    <div className="list-row__body">
                      <div className="list-row__title">
                        {nameOf(payment.fromId || "")} → {nameOf(payment.toId || "")}
                      </div>
                      <div className="list-row__subtitle">
                        {payment.date}
                        {payment.note ? ` • ${payment.note}` : ""}
                      </div>
                    </div>
                    <div className="list-row__amount">{formatVND(payment.amount)}</div>
                    {canOperate ? (
                      <div className="list-row__actions">
                        <RowAction label="Sửa" onClick={() => openEditPayment(payment)} />
                        <RowAction label="Xóa" variant="danger" onClick={() => void handleDeletePayment(payment)} />
                      </div>
                    ) : null}
                  </article>
                ))}
              </div>
            )}
          </section>
        ) : (
          <>
            <div className="summary-strip">
              <div className="summary-strip__item">
                <span className="summary-strip__label">Tổng nợ gốc</span>
                <span className="summary-strip__value">{formatVND(liveSettlement.totals.grossDebtTotal)}</span>
              </div>
              <div className="summary-strip__item">
                <span className="summary-strip__label">Payment đã áp</span>
                <span className="summary-strip__value">{formatVND(liveSettlement.paymentsAppliedTotal)}</span>
              </div>
              <div className="summary-strip__item">
                <span className="summary-strip__label">Còn phải thanh toán</span>
                <span className="summary-strip__value">{formatVND(liveSettlement.totals.remainingDebtTotal)}</span>
              </div>
            </div>

            <section className="card">
              <h2 className="card__title">Ma trận nợ gốc</h2>
              <div className="matrix-table-wrap">
                <table className="matrix-table">
                  <thead>
                    <tr>
                      <th>Nợ \ Được nhận</th>
                      {ROSTER.map((member) => (
                        <th key={member.id}>{member.name}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {ROSTER.map((row) => (
                      <tr key={row.id}>
                        <th>{row.name}</th>
                        {ROSTER.map((col) => {
                          const isDiag = row.id === col.id;
                          const value = liveSettlement.grossMatrix?.[row.id]?.[col.id] ?? 0;
                          return (
                            <td key={col.id} className={isDiag ? "is-diag" : ""}>
                              {isDiag ? "-" : formatVND(value)}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="matrix-legend">Hàng = con nợ · Cột = chủ nợ</p>
            </section>

            <section className="card">
              <h2 className="card__title">Số dư sau khi áp payment</h2>
              <div>
                {ROSTER.map((member) => {
                  const value = Number(liveSettlement.balances?.[member.id] || 0);
                  const label = value > 0 ? "Đã trả nhiều hơn phần đang nợ" : value < 0 ? "Đang còn nợ trong tháng" : "Đã cân bằng";
                  return (
                    <div key={member.id} className="balances-list__row">
                      <div>
                        <div className="list-row__title">{member.name}</div>
                        <div className="list-row__subtitle">{label}</div>
                      </div>
                      <strong>{formatVND(Math.abs(value))}</strong>
                    </div>
                  );
                })}
              </div>
            </section>
          </>
        )}
      </div>

      <BottomSheet open={paySheet.open} onClose={() => setPaySheet(emptyPaySheet())} title={paySheet.title}>
        <div className="form-grid">
          <p className="form-hint">
            {paySheet.lockAmount
              ? `Trả đủ theo cấn trừ: ${formatVND(Number(paySheet.amount))}.`
              : `Tối đa theo cấn trừ: ${formatVND(paySheet.maxAmount || 0)}.`}
          </p>
          <div className="form-grid form-grid--2">
            <div className="form-field">
              <span className="form-label">Người trả</span>
              <input className="form-input" value={nameOf(paySheet.fromId)} disabled />
            </div>
            <div className="form-field">
              <span className="form-label">Người nhận</span>
              <input className="form-input" value={nameOf(paySheet.toId)} disabled />
            </div>
          </div>
          <div className="form-field">
            <label className="form-label" htmlFor="payAmount">
              Số tiền
            </label>
            <input
              id="payAmount"
              className="form-input"
              disabled={paySheet.lockAmount}
              value={paySheet.amount}
              onChange={(event) => setPaySheet((current) => ({ ...current, amount: event.target.value }))}
            />
          </div>
          <div className="form-field">
            <label className="form-label" htmlFor="payDate">
              Ngày ghi nhận
            </label>
            <input
              id="payDate"
              type="date"
              className="form-input"
              value={paySheet.date}
              min={getMonthRange(session.selectedPeriod).start}
              max={lastDayOfPeriod(session.selectedPeriod)}
              onChange={(event) => setPaySheet((current) => ({ ...current, date: event.target.value }))}
            />
          </div>
          <div className="form-field">
            <label className="form-label" htmlFor="payNote">
              Ghi chú
            </label>
            <input
              id="payNote"
              className="form-input"
              value={paySheet.note}
              onChange={(event) => setPaySheet((current) => ({ ...current, note: event.target.value }))}
            />
          </div>
          <div className="form-error">{payError}</div>
          <div className="btn-row">
            <Button variant="primary" onClick={() => void submitPaySheet()} disabled={paySaving}>
              {paySaving ? "Đang lưu..." : "Xác nhận"}
            </Button>
            <Button variant="ghost" onClick={() => setPaySheet(emptyPaySheet())}>
              Hủy
            </Button>
          </div>
        </div>
      </BottomSheet>

      <BottomSheet
        open={editPayment.open}
        onClose={() => setEditPayment({ open: false, paymentId: "", date: "", note: "" })}
        title="Sửa thanh toán"
      >
        <div className="form-grid">
          <div className="form-field">
            <label className="form-label" htmlFor="paymentEditDate">
              Ngày
            </label>
            <input
              id="paymentEditDate"
              type="date"
              className="form-input"
              value={editPayment.date}
              onChange={(event) => setEditPayment((current) => ({ ...current, date: event.target.value }))}
            />
          </div>
          <div className="form-field">
            <label className="form-label" htmlFor="paymentEditNote">
              Ghi chú
            </label>
            <input
              id="paymentEditNote"
              className="form-input"
              value={editPayment.note}
              onChange={(event) => setEditPayment((current) => ({ ...current, note: event.target.value }))}
            />
          </div>
          <p className="form-hint">
            Bản ghi này chỉ cho sửa ngày và ghi chú. Nếu sai số tiền, hãy xóa rồi ghi nhận lại.
          </p>
          <div className="form-error">{editError}</div>
          <div className="btn-row">
            <Button variant="primary" onClick={() => void submitEditPayment()} disabled={editSaving}>
              {editSaving ? "Đang lưu..." : "Cập nhật"}
            </Button>
            <Button variant="ghost" onClick={() => setEditPayment({ open: false, paymentId: "", date: "", note: "" })}>
              Hủy
            </Button>
          </div>
        </div>
      </BottomSheet>
    </div>
  );
}
