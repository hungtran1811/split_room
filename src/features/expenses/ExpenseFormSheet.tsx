import { useEffect, useRef, useState } from "react";
import { formatVND } from "../../shared/lib/format";
import { Button } from "../../shared/ui/Button";
import { BottomSheet } from "../../shared/ui/BottomSheet";
import { useToast } from "../../shared/ui/Toast";
import { useSession } from "../../app/SessionContext";
import { ROSTER, ROSTER_IDS } from "../../config/roster";
import { useMemberLabel } from "../../hooks/useMemberLabel";
import { resolveMemberIdFromEmail } from "../../config/members.map";
import { defaultExpenseDateForPeriod, getMonthRange, lastDayOfPeriod } from "../../core/period";
import { parseVndInput } from "../../core/money";
import { buildWholeEqualShares, toWholeVnd } from "../../domain/money/whole-vnd";
import type { ExpenseDoc } from "../../types/models";
import { addExpense, updateExpense } from "../../services/expense.service";
import { AMOUNT_PRESETS, formatPresetLabel, rememberNote } from "./quickEntry";

type FormState = {
  date: string;
  amount: string;
  payerId: string;
  note: string;
  participants: string[];
  equalSplit: boolean;
  manualDebts: Record<string, string>;
};

type ExpenseFormSheetProps = {
  open: boolean;
  onClose: () => void;
  expense?: ExpenseDoc | null;
  noteSuggestions?: string[];
};

function buildEmptyForm(period: string, payerId: string): FormState {
  return {
    date: defaultExpenseDateForPeriod(period),
    amount: "",
    payerId,
    note: "",
    participants: [...ROSTER_IDS],
    equalSplit: true,
    manualDebts: {},
  };
}

function formFromExpense(expense: ExpenseDoc, period: string, fallbackPayerId: string): FormState {
  const participants =
    expense.participants && expense.participants.length
      ? expense.participants
      : (Array.from(
          new Set([expense.payerId, ...Object.keys(expense.debts || {})].filter(Boolean)),
        ) as string[]);

  return {
    date: expense.date || defaultExpenseDateForPeriod(period),
    amount: String(expense.amount || ""),
    payerId: expense.payerId || fallbackPayerId,
    note: expense.note || "",
    participants,
    equalSplit: true,
    manualDebts: Object.fromEntries(
      Object.entries(expense.debts || {}).map(([id, value]) => [id, String(value)]),
    ),
  };
}

function computeDebts(form: FormState): Record<string, number> {
  const amount = toWholeVnd(parseVndInput(form.amount));
  const debtors = form.participants.filter((id) => id !== form.payerId);

  if (form.equalSplit) {
    const equalShares = buildWholeEqualShares(amount, form.participants);
    const debts: Record<string, number> = {};
    for (const id of debtors) {
      const share = equalShares[id] || 0;
      if (share > 0) debts[id] = share;
    }
    return debts;
  }

  const debts: Record<string, number> = {};
  for (const id of debtors) {
    const value = toWholeVnd(parseVndInput(form.manualDebts[id] || "0"));
    if (value > 0) debts[id] = value;
  }
  return debts;
}

export function ExpenseFormSheet({
  open,
  onClose,
  expense = null,
  noteSuggestions = [],
}: ExpenseFormSheetProps) {
  const session = useSession();
  const { showToast } = useToast();
  const labelOf = useMemberLabel();
  const amountInputRef = useRef<HTMLInputElement>(null);
  const myMemberId =
    session.memberProfile?.memberId ||
    resolveMemberIdFromEmail(session.user?.email) ||
    ROSTER_IDS[0];

  const [form, setForm] = useState<FormState>(() =>
    buildEmptyForm(session.selectedPeriod, myMemberId),
  );
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");

  useEffect(() => {
    if (!open) return;
    setForm(
      expense
        ? formFromExpense(expense, session.selectedPeriod, myMemberId)
        : buildEmptyForm(session.selectedPeriod, myMemberId),
    );
    setFormError("");
    if (window.matchMedia("(max-width: 639px)").matches) return;
    const timer = window.setTimeout(() => amountInputRef.current?.focus(), 40);
    return () => window.clearTimeout(timer);
  }, [open, expense?.id, session.selectedPeriod, myMemberId]);

  function toggleParticipant(memberId: string) {
    setForm((current) => {
      const isIn = current.participants.includes(memberId);
      const participants = isIn
        ? current.participants.filter((id) => id !== memberId)
        : [...current.participants, memberId];
      return { ...current, participants };
    });
  }

  async function handleSubmit() {
    setFormError("");
    const amount = toWholeVnd(parseVndInput(form.amount));
    if (!amount || amount <= 0) {
      setFormError("Số tiền phải lớn hơn 0.");
      return;
    }
    if (!form.payerId) {
      setFormError("Hãy chọn người trả.");
      return;
    }
    if (!form.participants.length) {
      setFormError("Phải chọn ít nhất một người tham gia.");
      return;
    }
    const { start, end } = getMonthRange(session.selectedPeriod);
    if (form.date < start || form.date >= end) {
      setFormError(`Ngày ghi chi phải thuộc tháng ${session.selectedPeriod}.`);
      return;
    }
    if (!session.groupId) {
      setFormError("Chưa chọn nhóm.");
      return;
    }

    const debts = computeDebts(form);
    const sumDebts = Object.values(debts).reduce((sum, value) => sum + value, 0);
    if (sumDebts - amount > 0.000001) {
      setFormError("Tổng nợ của người khác không được lớn hơn tổng tiền.");
      return;
    }

    setSaving(true);
    try {
      const payload = {
        date: form.date,
        amount,
        payerId: form.payerId,
        participants: form.participants,
        debts,
        note: form.note.trim(),
      };

      if (expense?.id) {
        await updateExpense(session.groupId, expense.id, payload);
        showToast({ title: "Thành công", message: "Đã cập nhật chi tiêu.", variant: "success" });
      } else {
        await addExpense(session.groupId, { ...payload, createdBy: session.user?.uid });
        showToast({ title: "Thành công", message: "Đã lưu khoản chi.", variant: "success" });
        rememberNote(form.note);
      }
      onClose();
    } catch (error) {
      setFormError((error as { message?: string })?.message || "Lưu thất bại.");
    } finally {
      setSaving(false);
    }
  }

  const debtPreview = computeDebts(form);
  const previewAmount = toWholeVnd(parseVndInput(form.amount));
  const sumDebtsPreview = Object.values(debtPreview).reduce((sum, value) => sum + value, 0);
  const editing = Boolean(expense?.id);

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      title={editing ? "Sửa chi tiêu" : "Thêm khoản chi"}
      footer={
        <div className="btn-row">
          <Button variant="primary" onClick={() => void handleSubmit()} disabled={saving}>
            {saving ? "Đang lưu..." : editing ? "Cập nhật" : "Lưu khoản chi"}
          </Button>
          <Button variant="ghost" onClick={onClose}>
            Hủy
          </Button>
        </div>
      }
    >
      <form
        className="expense-form"
        onSubmit={(event) => {
          event.preventDefault();
          void handleSubmit();
        }}
      >
        <div className="form-field">
          <label className="form-label" htmlFor="exAmount">
            Số tiền (VNĐ)
          </label>
          <input
            ref={amountInputRef}
            id="exAmount"
            className="form-input expense-form__amount"
            inputMode="numeric"
            placeholder="0"
            value={form.amount}
            onChange={(event) => setForm((current) => ({ ...current, amount: event.target.value }))}
          />
          <div className="chip-row expense-form__chips">
            {AMOUNT_PRESETS.map((preset) => (
              <button
                key={preset}
                type="button"
                className={`quick-chip quick-chip--sm ${form.amount === String(preset) ? "is-active" : ""}`.trim()}
                onClick={() => setForm((current) => ({ ...current, amount: String(preset) }))}
              >
                {formatPresetLabel(preset)}
              </button>
            ))}
          </div>
        </div>

        <div className="expense-form__row">
          <div className="form-field">
            <label className="form-label" htmlFor="exDate">
              Ngày
            </label>
            <input
              id="exDate"
              type="date"
              className="form-input"
              value={form.date}
              min={getMonthRange(session.selectedPeriod).start}
              max={lastDayOfPeriod(session.selectedPeriod)}
              onChange={(event) => setForm((current) => ({ ...current, date: event.target.value }))}
            />
          </div>
          <div className="form-field">
            <label className="form-label" htmlFor="exPayer">
              Người trả
            </label>
            <select
              id="exPayer"
              className="form-select"
              value={form.payerId}
              onChange={(event) => setForm((current) => ({ ...current, payerId: event.target.value }))}
            >
              {ROSTER.map((member) => (
                <option key={member.id} value={member.id}>
                  {labelOf(member.id)}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="form-field">
          <label className="form-label" htmlFor="exNote">
            Ghi chú
          </label>
          <input
            id="exNote"
            className="form-input"
            placeholder="VD: Ăn uống, đi chợ..."
            value={form.note}
            onChange={(event) => setForm((current) => ({ ...current, note: event.target.value }))}
          />
          {noteSuggestions.length ? (
            <div className="chip-row expense-form__chips">
              {noteSuggestions.slice(0, 4).map((note) => (
                <button
                  key={note}
                  type="button"
                  className={`quick-chip quick-chip--sm ${form.note === note ? "is-active" : ""}`.trim()}
                  onClick={() => setForm((current) => ({ ...current, note }))}
                >
                  {note}
                </button>
              ))}
            </div>
          ) : null}
        </div>

        <div className="expense-form__split">
          <div className="form-switch-row expense-form__split-head">
            <span>Người tham gia</span>
            <label className="form-switch-row">
              <input
                type="checkbox"
                checked={form.equalSplit}
                onChange={(event) =>
                  setForm((current) => ({ ...current, equalSplit: event.target.checked }))
                }
              />
              Chia đều
            </label>
          </div>
          <div className="chip-row expense-form__chips">
            {ROSTER.map((member) => (
              <label
                key={member.id}
                className={`chip-toggle ${form.participants.includes(member.id) ? "is-active" : ""}`.trim()}
              >
                <input
                  type="checkbox"
                  checked={form.participants.includes(member.id)}
                  onChange={() => toggleParticipant(member.id)}
                />
                <span>{labelOf(member.id)}</span>
              </label>
            ))}
          </div>

          {!form.equalSplit ? (
            <div className="debts-grid">
              {ROSTER_IDS.filter((id) => id !== form.payerId && form.participants.includes(id)).map(
                (memberId) => (
                  <div key={memberId} className="debt-input-row">
                    <label className="form-hint">
                      {labelOf(memberId)} nợ {labelOf(form.payerId)}
                    </label>
                    <input
                      className="form-input"
                      inputMode="numeric"
                      value={form.manualDebts[memberId] || ""}
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          manualDebts: { ...current.manualDebts, [memberId]: event.target.value },
                        }))
                      }
                    />
                  </div>
                ),
              )}
            </div>
          ) : null}
        </div>

        <div className="expense-summary-strip">
          <div className="expense-summary-strip__item">
            <div className="expense-summary-strip__label">Nợ người khác</div>
            <div className="expense-summary-strip__value">{formatVND(sumDebtsPreview)}</div>
          </div>
          <div className="expense-summary-strip__item">
            <div className="expense-summary-strip__label">Phần người trả</div>
            <div className="expense-summary-strip__value">
              {formatVND(previewAmount - sumDebtsPreview)}
            </div>
          </div>
        </div>

        {formError ? <div className="form-error">{formError}</div> : null}
      </form>
    </BottomSheet>
  );
}
