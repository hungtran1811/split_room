import { formatVND } from "../../config/i18n";
import { renderMetricGrid } from "../components/metricTile";

export function filterExpensesByDate(expenses, selectedExpenseDate) {
  if (!selectedExpenseDate) return [];
  return (expenses || []).filter((expense) => expense.date === selectedExpenseDate);
}

export function groupExpensesByDate(expenses) {
  const groups = new Map();
  for (const expense of expenses) {
    const key = expense.date || "Không rõ ngày";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(expense);
  }

  return [...groups.entries()].map(([date, items]) => ({
    date,
    items,
  }));
}

export function renderExpenseSummary(monthExpenses, filteredExpenses, selectedExpenseDate) {
  const monthTotal = monthExpenses.reduce(
    (sum, item) => sum + Number(item.amount || 0),
    0,
  );
  const dayTotal = filteredExpenses.reduce(
    (sum, item) => sum + Number(item.amount || 0),
    0,
  );

  return renderMetricGrid(
    [
      {
        label: "Chi tháng",
        value: formatVND(monthTotal),
        delta: `${monthExpenses.length} khoản`,
        tone: monthTotal > 0 ? "neutral" : "warning",
      },
      {
        label: selectedExpenseDate ? "Chi ngày đã chọn" : "Chi ngày",
        value: selectedExpenseDate ? formatVND(dayTotal) : "—",
        delta: selectedExpenseDate
          ? `${filteredExpenses.length} khoản • ${selectedExpenseDate}`
          : "Chọn ngày bên dưới",
        tone: selectedExpenseDate && dayTotal > 0 ? "positive" : "neutral",
      },
    ],
    { columns: 2 },
  );
}
