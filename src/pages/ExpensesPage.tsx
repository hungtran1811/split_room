import { useMemo, useState } from "react";
import { formatVND } from "../shared/lib/format";
import { Button } from "../shared/ui/Button";
import { BottomSheet } from "../shared/ui/BottomSheet";
import { EmptyState } from "../shared/ui/EmptyState";
import { LockBanner, PageHeader } from "../shared/ui/PageHeader";
import { MetricGrid } from "../shared/ui/MetricTile";
import { PageLoadingSkeleton } from "../shared/ui/Skeleton";
import { useToast } from "../shared/ui/Toast";
import { useSession } from "../app/SessionContext";
import { useLiveMonth } from "../hooks/useLiveMonth";
import { ROSTER, ROSTER_IDS, nameOf } from "../config/roster";
import { resolveMemberIdFromEmail } from "../config/members.map";
import { canAddExpense, canDeleteExpense, canEditExpense } from "../core/roles";
import { getMonthRange, lastDayOfPeriod } from "../core/period";
import { parseVndInput } from "../core/money";
import { buildWholeEqualShares, toWholeVnd } from "../domain/money/whole-vnd";
import type { ExpenseDoc } from "../types/models";
import { addExpense, removeExpense, updateExpense } from "../services/expense.service";
import { AMOUNT_PRESETS, collectRecentNotes, formatPresetLabel, rememberNote } from "../features/expenses/quickEntry";
import { ExpenseDaySection, ExpenseRow } from "../features/expenses/ExpenseTimeline";
import { formatViDateShort } from "../shared/lib/date";

type FormState = {
  date: string;
  amount: string;
  payerId: string;
  note: string;
  participants: string[];
  equalSplit: boolean;
  manualDebts: Record<string, string>;
};

function todayYmd(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

function defaultDateForPeriod(period: string): string {
  const today = todayYmd();
  if (today.slice(0, 7) === period) return today;
  const { start } = getMonthRange(period);
  return start;
}

function buildEmptyForm(period: string, payerId: string): FormState {
  return {
    date: defaultDateForPeriod(period),
    amount: "",
    payerId,
    note: "",
    participants: [...ROSTER_IDS],
    equalSplit: true,
    manualDebts: {},
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

export function ExpensesPage() {
  const session = useSession();
  const { showToast } = useToast();
  const live = useLiveMonth("expenses", session.groupId, session.selectedPeriod);

  const myMemberId =
    session.memberProfile?.memberId ||
    resolveMemberIdFromEmail(session.user?.email) ||
    ROSTER_IDS[0];

  const canAdd = canAddExpense(session.memberProfile, session.user?.email || "");
  const canEdit = canEditExpense(session.memberProfile) && !session.lockedSoft;
  const canDelete = canDeleteExpense(session.memberProfile) && !session.lockedSoft;
  const canAddNow = canAdd && !session.lockedSoft;

  const [sheetOpen, setSheetOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(() => buildEmptyForm(session.selectedPeriod, myMemberId));
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");
  const [dateFilter, setDateFilter] = useState("");

  const expenses = live.expenses as ExpenseDoc[];

  const visibleExpenses = useMemo(() => {
    const sorted = [...expenses].sort((left, right) => String(right.date || "").localeCompare(String(left.date || "")));
    if (!dateFilter) return sorted;
    return sorted.filter((item) => item.date === dateFilter);
  }, [expenses, dateFilter]);

  const groupedByDate = useMemo(() => {
    const groups = new Map<string, ExpenseDoc[]>();
    for (const expense of visibleExpenses) {
      const key = expense.date || "Không rõ ngày";
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(expense);
    }
    return [...groups.entries()];
  }, [visibleExpenses]);

  const monthTotal = expenses.reduce((sum, item) => sum + Number(item.amount || 0), 0);
  const noteSuggestions = useMemo(() => collectRecentNotes(expenses), [expenses]);

  function creatorLabel(uid: string | undefined): string {
    if (!uid) return "-";
    const member = session.members.find((item) => item.uid === uid);
    if (member?.displayName) return member.displayName;
    if (member?.memberId) return nameOf(member.memberId);
    if (session.user?.uid === uid) {
      return session.memberProfile?.displayName || session.user?.displayName || "Bạn";
    }
    return uid;
  }

  function openCreateSheet() {
    setEditingId(null);
    setForm(buildEmptyForm(session.selectedPeriod, myMemberId));
    setFormError("");
    setSheetOpen(true);
  }

  function openEditSheet(expense: ExpenseDoc) {
    const participants =
      expense.participants && expense.participants.length
        ? expense.participants
        : Array.from(new Set([expense.payerId, ...Object.keys(expense.debts || {})].filter(Boolean))) as string[];

    setEditingId(expense.id);
    setForm({
      date: expense.date || defaultDateForPeriod(session.selectedPeriod),
      amount: String(expense.amount || ""),
      payerId: expense.payerId || myMemberId,
      note: expense.note || "",
      participants,
      equalSplit: true,
      manualDebts: Object.fromEntries(
        Object.entries(expense.debts || {}).map(([id, value]) => [id, String(value)]),
      ),
    });
    setFormError("");
    setSheetOpen(true);
  }

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

      if (editingId) {
        await updateExpense(session.groupId!, editingId, payload);
        showToast({ title: "Thành công", message: "Đã cập nhật chi tiêu.", variant: "success" });
      } else {
        await addExpense(session.groupId!, { ...payload, createdBy: session.user?.uid });
        showToast({ title: "Thành công", message: "Đã lưu khoản chi.", variant: "success" });
        rememberNote(form.note);
      }
      setSheetOpen(false);
    } catch (error) {
      setFormError((error as { message?: string })?.message || "Lưu thất bại.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(expense: ExpenseDoc) {
    if (!session.groupId) return;
    const confirmed = window.confirm(
      `Xóa khoản chi ${formatVND(expense.amount)} ngày ${expense.date}?`,
    );
    if (!confirmed) return;

    try {
      await removeExpense(session.groupId, expense.id);
      showToast({ title: "Thành công", message: "Đã xóa khoản chi.", variant: "success" });
    } catch (error) {
      showToast({
        title: "Thất bại",
        message: (error as { message?: string })?.message || "Không thể xóa khoản chi.",
        variant: "danger",
      });
    }
  }

  const debtPreview = computeDebts(form);
  const previewAmount = toWholeVnd(parseVndInput(form.amount));
  const sumDebtsPreview = Object.values(debtPreview).reduce((sum, value) => sum + value, 0);

  return (
    <div className="expenses-page">
      <PageHeader
        title="Chi tiêu"
        subtitle={`Tháng ${session.selectedPeriod} · ghi khoản chi chung của phòng`}
      />

      <MetricGrid
        columns={2}
        tiles={[
          { label: "Chi tháng", value: formatVND(monthTotal), hint: `${expenses.length} khoản` },
          {
            label: "Đang lọc",
            value: dateFilter ? formatVND(visibleExpenses.reduce((s, i) => s + Number(i.amount || 0), 0)) : formatVND(monthTotal),
            hint: dateFilter ? `${visibleExpenses.length} khoản • ${dateFilter}` : "Tất cả",
          },
        ]}
      />

      {!canAddNow ? (
        <LockBanner variant={canAdd ? "info" : "warning"}>
          {session.lockedSoft
            ? "Tháng này đã được chốt — không thể thêm chi tiêu."
            : "Tài khoản chưa được gán thành viên — không thể thêm chi tiêu."}
        </LockBanner>
      ) : null}

      <div className="expense-toolbar">
        <div className="expense-toolbar__filters">
          <label className="form-label" htmlFor="expenseDateFilter">
            Ngày
          </label>
          <input
            id="expenseDateFilter"
            type="date"
            className="form-input expense-toolbar__date"
            value={dateFilter}
            min={getMonthRange(session.selectedPeriod).start}
            max={lastDayOfPeriod(session.selectedPeriod)}
            onChange={(event) => setDateFilter(event.target.value)}
          />
          {dateFilter ? (
            <Button variant="ghost" className="btn--sm" onClick={() => setDateFilter("")}>
              Bỏ lọc · {formatViDateShort(dateFilter)}
            </Button>
          ) : null}
        </div>
        {canAddNow ? (
          <Button variant="primary" onClick={openCreateSheet}>
            + Thêm khoản chi
          </Button>
        ) : null}
      </div>

      {!live.expensesReady ? (
        <PageLoadingSkeleton stats={0} rows={4} />
      ) : !visibleExpenses.length ? (
        <EmptyState
          title={dateFilter ? "Không có khoản chi trong ngày này" : "Chưa có khoản chi trong tháng"}
          description="Bấm “Thêm khoản chi” để ghi nhận khoản chi mới."
          action={
            canAddNow ? (
              <Button variant="primary" onClick={openCreateSheet}>
                + Thêm
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="expense-timeline">
          {groupedByDate.map(([date, items]) => {
            const dayTotal = items.reduce((sum, item) => sum + Number(item.amount || 0), 0);
            return (
              <ExpenseDaySection
                key={date}
                date={date}
                itemCount={items.length}
                dayTotal={dayTotal}
              >
                {items.map((expense) => {
                  const debts = Object.entries(expense.debts || {})
                    .filter(([, amount]) => Number(amount) > 0)
                    .map(([memberId, amount]) => ({
                      id: memberId,
                      label: nameOf(memberId),
                      amount: Number(amount),
                    }));
                  return (
                    <ExpenseRow
                      key={expense.id}
                      note={expense.note || ""}
                      payerLabel={nameOf(expense.payerId || "")}
                      creatorLabel={creatorLabel(expense.createdBy)}
                      amount={Number(expense.amount || 0)}
                      debts={debts}
                      canEdit={canEdit}
                      canDelete={canDelete}
                      onEdit={() => openEditSheet(expense)}
                      onDelete={() => void handleDelete(expense)}
                    />
                  );
                })}
              </ExpenseDaySection>
            );
          })}
        </div>
      )}

      <BottomSheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        title={editingId ? "Sửa chi tiêu" : "Thêm khoản chi"}
      >
        <div className="form-grid">
          <div className="form-field">
            <label className="form-label" htmlFor="exAmount">
              Số tiền (VNĐ)
            </label>
            <input
              id="exAmount"
              className="form-input"
              inputMode="numeric"
              placeholder="VD: 100000"
              value={form.amount}
              onChange={(event) => setForm((current) => ({ ...current, amount: event.target.value }))}
            />
            <div className="chip-row">
              {AMOUNT_PRESETS.map((preset) => (
                <button
                  key={preset}
                  type="button"
                  className={`quick-chip ${form.amount === String(preset) ? "is-active" : ""}`.trim()}
                  onClick={() => setForm((current) => ({ ...current, amount: String(preset) }))}
                >
                  {formatPresetLabel(preset)}
                </button>
              ))}
            </div>
          </div>

          <div className="form-grid form-grid--2">
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
                    {member.name}
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
              <div className="chip-row">
                {noteSuggestions.map((note) => (
                  <button
                    key={note}
                    type="button"
                    className="quick-chip"
                    onClick={() => setForm((current) => ({ ...current, note }))}
                  >
                    {note}
                  </button>
                ))}
              </div>
            ) : null}
          </div>

          <div className="form-field">
            <div className="form-switch-row">
              <span>Người tham gia</span>
              <label className="form-switch-row">
                <input
                  type="checkbox"
                  checked={form.equalSplit}
                  onChange={(event) => setForm((current) => ({ ...current, equalSplit: event.target.checked }))}
                />
                Chia đều
              </label>
            </div>
            <div className="chip-row">
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
                  <span>{member.name}</span>
                </label>
              ))}
            </div>
          </div>

          {!form.equalSplit ? (
            <div className="form-field">
              <span className="form-label">Phân bổ nợ thủ công</span>
              <div className="debts-grid">
                {ROSTER_IDS.filter((id) => id !== form.payerId && form.participants.includes(id)).map((memberId) => (
                  <div key={memberId} className="debt-input-row">
                    <label className="form-hint">
                      {nameOf(memberId)} nợ {nameOf(form.payerId)}
                    </label>
                    <input
                      className="form-input"
                      value={form.manualDebts[memberId] || ""}
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          manualDebts: { ...current.manualDebts, [memberId]: event.target.value },
                        }))
                      }
                    />
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          <div className="expense-summary-strip">
            <div className="expense-summary-strip__item">
              <div className="expense-summary-strip__label">Tổng nợ người khác</div>
              <div className="expense-summary-strip__value">{formatVND(sumDebtsPreview)}</div>
            </div>
            <div className="expense-summary-strip__item">
              <div className="expense-summary-strip__label">Phần người trả</div>
              <div className="expense-summary-strip__value">{formatVND(previewAmount - sumDebtsPreview)}</div>
            </div>
          </div>

          <div className="form-error">{formError}</div>

          <div className="btn-row">
            <Button variant="primary" onClick={() => void handleSubmit()} disabled={saving}>
              {saving ? "Đang lưu..." : "Lưu"}
            </Button>
            <Button variant="ghost" onClick={() => setSheetOpen(false)}>
              Hủy
            </Button>
          </div>
        </div>
      </BottomSheet>
    </div>
  );
}
