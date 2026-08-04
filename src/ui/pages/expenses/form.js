import {
  addExpense,
  removeExpense,
  updateExpense,
} from "../../../services/expense.service";

function byId(id) {
  return document.getElementById(id);
}

export function createExpense(groupId, expense) {
  return addExpense(groupId, expense);
}

export function deleteExpense(groupId, expenseId) {
  return removeExpense(groupId, expenseId);
}

export function editExpense(groupId, expenseId, expense) {
  return updateExpense(groupId, expenseId, expense);
}

export function bindExpensesFormEvents({
  applyRepeatableExpense,
  findLastExpense,
  onEmptyRepeatableExpense,
  onViewAllMonth,
  onApplyDate,
  onResetDate,
  onPayerChange,
  onAmountChange,
  onEqualSplitChange,
  onParticipantChange,
  onDebtInput,
  onReset,
  onSave,
  onHistoryToggle,
}) {
  byId("btnRepeatLastExpense")?.addEventListener("click", () => {
    const lastExpense = findLastExpense();
    if (!lastExpense) {
      onEmptyRepeatableExpense();
      return;
    }
    applyRepeatableExpense(lastExpense);
  });

  byId("btnViewAllMonthExpenses")?.addEventListener("click", onViewAllMonth);
  byId("btnApplyExpenseDate")?.addEventListener("click", onApplyDate);
  byId("expenseDateFilter")?.addEventListener("keydown", (event) => {
    if (event.key === "Enter") onApplyDate(event.target.value || "");
  });
  byId("btnResetExpenseDate")?.addEventListener("click", onResetDate);

  byId("exPayer")?.addEventListener("change", onPayerChange);
  byId("exAmount")?.addEventListener("input", onAmountChange);
  byId("exEqual")?.addEventListener("change", onEqualSplitChange);
  document.querySelectorAll(".exPart").forEach((checkbox) => {
    checkbox.addEventListener("change", onParticipantChange);
  });
  byId("debtsBox")?.addEventListener("input", (event) => {
    if (event.target?.classList?.contains("debtInput")) onDebtInput();
  });
  byId("btnResetExpense")?.addEventListener("click", onReset);
  byId("btnSaveExpense")?.addEventListener("click", onSave);
  byId("expensesHistory")?.addEventListener("toggle", onHistoryToggle);
}
