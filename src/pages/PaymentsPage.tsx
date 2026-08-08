import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { formatVND } from "../shared/lib/format";
import { Button } from "../shared/ui/Button";
import { BottomSheet } from "../shared/ui/BottomSheet";
import { EmptyState } from "../shared/ui/EmptyState";
import { LockBanner, PageHeader, RowAction } from "../shared/ui/PageHeader";
import { SegmentedTabs, type SegmentedTab } from "../shared/ui/SegmentedTabs";
import { PageLoadingSkeleton } from "../shared/ui/Skeleton";
import { useToast } from "../shared/ui/Toast";
import { useSession } from "../app/SessionContext";
import { useLiveMonth } from "../hooks/useLiveMonth";
import {
  filterMyPreviousDebts,
  usePreviousDebts,
} from "../hooks/usePreviousDebts";
import { ROSTER, ROSTER_IDS } from "../config/roster";
import { useMemberLabel } from "../hooks/useMemberLabel";
import { resolveMemberIdFromEmail } from "../config/members.map";
import { canRecordPayment, canViewFullSettlement } from "../core/roles";
import { getMonthRange, lastDayOfPeriod } from "../core/period";
import { parseVndInput } from "../core/money";
import { buildMonthlySettlementView } from "../domain/matrix/compute";
import {
  filterPaymentsForMember,
  filterSettlementForMember,
  type SettlementPlanItem,
} from "../domain/settlement/compute";
import type { PaymentDoc } from "../types/models";
import { addPayment, removePayment, updatePayment } from "../services/payment.service";

function formatPeriodShort(period: string): string {
  const [year, month] = String(period || "").split("-");
  if (!year || !month) return period || "";
  return `Tháng ${Number(month)}/${year}`;
}

const TABS: SegmentedTab[] = [
  { id: "suggest", label: "Cần chuyển" },
  { id: "history", label: "Đã chuyển" },
  { id: "matrix", label: "Chi tiết" },
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
  const [searchParams] = useSearchParams();
  const { showToast } = useToast();
  const labelOf = useMemberLabel();
  const live = useLiveMonth("payments", session.groupId, session.selectedPeriod);
  const previous = usePreviousDebts(session.groupId, session.selectedPeriod);
  const [activeTab, setActiveTab] = useState("suggest");

  useEffect(() => {
    const tab = searchParams.get("tab");
    if (tab && TABS.some((item) => item.id === tab)) {
      setActiveTab(tab);
    }
  }, [searchParams]);
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

  const canOperate = canRecordPayment(session.memberProfile) && !session.lockedSoft;
  const viewFull = canViewFullSettlement(session.memberProfile);

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

  const settlementPlanRaw = frozenSettlementPlan || liveSettlement.settlementPlan;
  const settlementPlan = viewFull
    ? settlementPlanRaw
    : filterSettlementForMember(settlementPlanRaw, myMemberId);

  const orderedSettlement = useMemo(() => {
    return [...settlementPlan].sort((a, b) => {
      const aMine = a.fromId === myMemberId ? 0 : 1;
      const bMine = b.fromId === myMemberId ? 0 : 1;
      return aMine - bMine;
    });
  }, [settlementPlan, myMemberId]);

  const visiblePayments = useMemo(() => {
    return viewFull ? payments : filterPaymentsForMember(payments, myMemberId);
  }, [payments, viewFull, myMemberId]);

  const myOldDebts = useMemo(
    () => filterMyPreviousDebts(previous.months, myMemberId),
    [previous.months, myMemberId],
  );
  const oldDebtTotal = myOldDebts.reduce((sum, item) => sum + item.amount, 0);

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
      note: lockAmount ? "Đã chuyển đủ" : "Đã chuyển một phần",
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
      setPayError("Số tiền không được lớn hơn số còn cần chuyển.");
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
      `Xóa thanh toán ${labelOf(payment.fromId || "")} → ${labelOf(payment.toId || "")} (${formatVND(payment.amount)})?`,
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
    () =>
      [...visiblePayments].sort((a, b) => String(b.date || "").localeCompare(String(a.date || ""))),
    [visiblePayments],
  );

  const paymentTabs = viewFull ? TABS : TABS.filter((tab) => tab.id !== "matrix");

  return (
    <div className="payments-page">
      <PageHeader
        title="Thanh toán"
        subtitle={
          viewFull
            ? `Tháng ${session.selectedPeriod} · ai cần chuyển cho ai`
            : `Tháng ${session.selectedPeriod} · chỉ khoản nợ liên quan bạn`
        }
      />

      <SegmentedTabs
        tabs={paymentTabs}
        value={activeTab === "matrix" && !viewFull ? "suggest" : activeTab}
        onChange={setActiveTab}
        ariaLabel="Chuyển mục thanh toán"
      />

      {session.lockedSoft ? (
        <LockBanner>
          Tháng {session.selectedPeriod} đã khóa — không ghi nhận chuyển tiền mới.
        </LockBanner>
      ) : null}

      <div className="payments-page__body">
        {!ready ? (
          <PageLoadingSkeleton stats={0} rows={4} />
        ) : activeTab === "suggest" ? (
          <section className="payments-suggest">
            {myOldDebts.length > 0 ? (
              <div className="card card--note">
                <div className="card__head">
                  <h2 className="card__title">Tháng trước còn lại</h2>
                  <span className="money-due">{formatVND(oldDebtTotal)}</span>
                </div>
                <div className="stack-list">
                  {myOldDebts.map((item) => (
                    <article
                      key={`${item.period}-${item.fromId}-${item.toId}`}
                      className="list-row settlement-item--mine"
                    >
                      <div className="list-row__body">
                        <div className="list-row__title">Bạn → {labelOf(item.toId)}</div>
                        <div className="list-row__subtitle">{formatPeriodShort(item.period)}</div>
                      </div>
                      <div className="list-row__amount money-due">{formatVND(item.amount)}</div>
                    </article>
                  ))}
                </div>
              </div>
            ) : null}

            <div className="card">
              <div className="card__head">
                <h2 className="card__title">{viewFull ? "Ai cần chuyển" : "Khoản nợ liên quan bạn"}</h2>
                {frozenSettlementPlan ? (
                  <span className="status-badge status-badge--pending">Đã khóa tháng</span>
                ) : null}
              </div>
              {!orderedSettlement.length ? (
                <EmptyState
                  title={
                    myOldDebts.length
                      ? "Tháng này không còn khoản cần chuyển"
                      : expenses.length
                        ? "Không còn ai cần chuyển"
                        : "Chưa có chi tiêu"
                  }
                  description={
                    myOldDebts.length
                      ? "Bạn vẫn còn khoản tháng trước ở danh sách trên."
                      : expenses.length
                        ? "Mọi người đã ổn trong tháng này."
                        : "Thêm khoản chi trước, app sẽ gợi ý ai cần chuyển cho ai."
                  }
                  action={
                    <Button variant="primary" onClick={() => navigate("/expenses")}>
                      {expenses.length ? "Xem chi tiêu" : "Thêm khoản chi"}
                    </Button>
                  }
                />
              ) : (
                <div className="stack-list">
                  {orderedSettlement.map((item, index) => {
                    const iPay = item.fromId === myMemberId;
                    const iReceive = item.toId === myMemberId;
                    const mine = iPay || iReceive;
                    return (
                      <article
                        key={`${item.fromId}-${item.toId}-${index}`}
                        className={`list-row ${mine ? "settlement-item--mine" : ""}`.trim()}
                      >
                        <div className="list-row__body">
                          <div className="list-row__title">
                            {iPay
                              ? `Bạn → ${labelOf(item.toId)}`
                              : iReceive
                                ? `${labelOf(item.fromId)} → Bạn`
                                : `${labelOf(item.fromId)} → ${labelOf(item.toId)}`}
                          </div>
                          {mine ? (
                            <div className="list-row__subtitle">
                              {iPay ? "Bạn cần chuyển" : "Bạn sẽ nhận"}
                            </div>
                          ) : null}
                        </div>
                        <div className={`list-row__amount ${iPay ? "money-due" : ""}`.trim()}>
                          {formatVND(item.amount)}
                        </div>
                        {canOperate ? (
                          <div className="list-row__actions">
                            <RowAction
                              label="Đã chuyển"
                              variant="primary"
                              onClick={() => openPaySheet(item, true)}
                            />
                            <RowAction
                              label="Một phần"
                              onClick={() => openPaySheet(item, false)}
                            />
                          </div>
                        ) : null}
                      </article>
                    );
                  })}
                </div>
              )}
            </div>
          </section>
        ) : activeTab === "history" ? (
          <section className="card">
            <h2 className="card__title">Đã chuyển trong tháng</h2>
            {!sortedPayments.length ? (
              <EmptyState
                title="Chưa ghi nhận lần chuyển nào"
                description="Khi ai đó chuyển tiền, bấm “Đã chuyển” ở mục Cần chuyển."
              />
            ) : (
              <div className="stack-list">
                {sortedPayments.map((payment) => (
                  <article key={payment.id} className="list-row">
                    <div className="list-row__body">
                      <div className="list-row__title">
                        {labelOf(payment.fromId || "")} → {labelOf(payment.toId || "")}
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
                <span className="summary-strip__label">Tổng từ chi chung</span>
                <span className="summary-strip__value">{formatVND(liveSettlement.totals.grossDebtTotal)}</span>
              </div>
              <div className="summary-strip__item">
                <span className="summary-strip__label">Đã chuyển</span>
                <span className="summary-strip__value">{formatVND(liveSettlement.paymentsAppliedTotal)}</span>
              </div>
              <div className="summary-strip__item">
                <span className="summary-strip__label">Còn lại</span>
                <span
                  className={`summary-strip__value ${
                    liveSettlement.totals.remainingDebtTotal > 0 ? "money-due" : ""
                  }`.trim()}
                >
                  {formatVND(liveSettlement.totals.remainingDebtTotal)}
                </span>
              </div>
            </div>

            <section className="card">
              <h2 className="card__title">Bảng ai còn nợ ai</h2>
              <div className="matrix-table-wrap">
                <table className="matrix-table">
                  <thead>
                    <tr>
                      <th></th>
                      {ROSTER.map((member) => (
                        <th key={member.id}>{labelOf(member.id)}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {ROSTER.map((row) => (
                      <tr key={row.id}>
                        <th>{labelOf(row.id)}</th>
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
              <p className="matrix-legend">Ô giao nhau: người bên trái còn nợ người phía trên</p>
            </section>

            <section className="card">
              <h2 className="card__title">Tóm tắt từng người</h2>
              <div>
                {ROSTER.map((member) => {
                  const value = Number(liveSettlement.balances?.[member.id] || 0);
                  const label =
                    value > 0
                      ? "Đang được nhận thêm"
                      : value < 0
                        ? "Còn cần chuyển"
                        : "Ổn";
                  return (
                    <div key={member.id} className="balances-list__row">
                      <div>
                        <div className="list-row__title">{labelOf(member.id)}</div>
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
              ? `Ghi nhận đã chuyển đủ ${formatVND(Number(paySheet.amount))}.`
              : `Số còn cần chuyển tối đa ${formatVND(paySheet.maxAmount || 0)}.`}
          </p>
          <div className="form-grid form-grid--2">
            <div className="form-field">
              <span className="form-label">Người trả</span>
              <input className="form-input" value={labelOf(paySheet.fromId)} disabled />
            </div>
            <div className="form-field">
              <span className="form-label">Người nhận</span>
              <input className="form-input" value={labelOf(paySheet.toId)} disabled />
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
