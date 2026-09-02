import { useEffect, useMemo, useState } from "react";
import { formatVND } from "../shared/lib/format";
import { Button } from "../shared/ui/Button";
import { EmptyState } from "../shared/ui/EmptyState";
import { LockBanner, PageHeader } from "../shared/ui/PageHeader";
import { MetricGrid } from "../shared/ui/MetricTile";
import { PageLoadingSkeleton } from "../shared/ui/Skeleton";
import { useToast } from "../shared/ui/Toast";
import { useSession } from "../app/SessionContext";
import { useLiveMonth } from "../hooks/useLiveMonth";
import { useMemberLabel } from "../hooks/useMemberLabel";
import { canAddExpense, canDeleteExpense, canEditExpense } from "../core/roles";
import {
  currentPeriod,
  defaultViewDateForPeriod,
  getMonthRange,
  lastDayOfPeriod,
  todayYmd,
} from "../core/period";
import type { ExpenseDoc } from "../types/models";
import { removeExpense } from "../services/expense.service";
import { collectRecentNotes } from "../features/expenses/quickEntry";
import { ExpenseFormSheet } from "../features/expenses/ExpenseFormSheet";
import { ExpenseDaySection, ExpenseRow } from "../features/expenses/ExpenseTimeline";
import { formatViDateShort } from "../shared/lib/date";

export function ExpensesPage() {
  const session = useSession();
  const { showToast } = useToast();
  const labelOf = useMemberLabel();
  const live = useLiveMonth("expenses", session.groupId, session.selectedPeriod);

  const canAdd = canAddExpense(session.memberProfile, session.user?.email || "");
  const canEdit = canEditExpense(session.memberProfile) && !session.lockedSoft;
  const canDelete = canDeleteExpense(session.memberProfile) && !session.lockedSoft;
  const canAddNow = canAdd && !session.lockedSoft;

  const [sheetOpen, setSheetOpen] = useState(false);
  const [editingExpense, setEditingExpense] = useState<ExpenseDoc | null>(null);
  const [dateFilter, setDateFilter] = useState(() =>
    defaultViewDateForPeriod(session.selectedPeriod),
  );

  useEffect(() => {
    setDateFilter(defaultViewDateForPeriod(session.selectedPeriod));
  }, [session.selectedPeriod]);

  useEffect(() => {
    function syncViewDate() {
      if (session.selectedPeriod !== currentPeriod()) return;
      setDateFilter(todayYmd());
    }

    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") syncViewDate();
    };

    document.addEventListener("visibilitychange", onVisibilityChange);
    const intervalId = window.setInterval(syncViewDate, 60_000);

    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.clearInterval(intervalId);
    };
  }, [session.selectedPeriod]);

  const expenses = live.expenses as ExpenseDoc[];

  const visibleExpenses = useMemo(() => {
    const sorted = [...expenses].sort((left, right) =>
      String(right.date || "").localeCompare(String(left.date || "")),
    );
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
    if (member?.memberId) return labelOf(member.memberId);
    if (session.user?.uid === uid) {
      return session.memberProfile?.displayName || session.user?.displayName || "Bạn";
    }
    return uid;
  }

  function openCreateSheet() {
    setEditingExpense(null);
    setSheetOpen(true);
  }

  function openEditSheet(expense: ExpenseDoc) {
    setEditingExpense(expense);
    setSheetOpen(true);
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
            value: dateFilter
              ? formatVND(visibleExpenses.reduce((sum, item) => sum + Number(item.amount || 0), 0))
              : formatVND(monthTotal),
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
                      label: labelOf(memberId),
                      amount: Number(amount),
                    }));
                  return (
                    <ExpenseRow
                      key={expense.id}
                      note={expense.note || ""}
                      payerLabel={labelOf(expense.payerId || "")}
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

      <ExpenseFormSheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        expense={editingExpense}
        noteSuggestions={noteSuggestions}
      />
    </div>
  );
}
