import { formatVND } from "../../config/i18n";
import { renderMetricGrid } from "../components/metricTile";

export function filterExpensesByDate(expenses, selectedExpenseDate) {
  if (!selectedExpenseDate) return [];
  return (expenses || []).filter((expense) => expense.date === selectedExpenseDate);
}

export function getVisibleExpenses(
  expenses,
  { selectedExpenseDate = "", showAllMonth = false } = {},
) {
  if (showAllMonth) {
    return [...(expenses || [])].sort((left, right) =>
      String(right.date || "").localeCompare(String(left.date || "")),
    );
  }

  return filterExpensesByDate(expenses, selectedExpenseDate);
}

export function groupExpensesByDate(expenses, { descending = true } = {}) {
  const groups = new Map();
  for (const expense of expenses) {
    const key = expense.date || "Không rõ ngày";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(expense);
  }

  const entries = [...groups.entries()];
  entries.sort((left, right) =>
    descending
      ? right[0].localeCompare(left[0])
      : left[0].localeCompare(right[0]),
  );

  return entries.map(([date, items]) => ({
    date,
    items,
  }));
}

export function renderExpenseSummary(
  monthExpenses,
  filteredExpenses,
  { selectedExpenseDate = "", showAllMonth = false } = {},
) {
  const monthTotal = monthExpenses.reduce(
    (sum, item) => sum + Number(item.amount || 0),
    0,
  );
  const dayTotal = filteredExpenses.reduce(
    (sum, item) => sum + Number(item.amount || 0),
    0,
  );

  const detailMetric = showAllMonth
    ? {
        label: "Đang xem",
        value: formatVND(monthTotal),
        delta: `${monthExpenses.length} khoản • Cả tháng`,
        tone: monthTotal > 0 ? "positive" : "neutral",
      }
    : {
        label: selectedExpenseDate ? "Chi ngày đã chọn" : "Chi ngày",
        value: selectedExpenseDate ? formatVND(dayTotal) : "—",
        delta: selectedExpenseDate
          ? `${filteredExpenses.length} khoản • ${selectedExpenseDate}`
          : "Chọn ngày hoặc xem cả tháng",
        tone: selectedExpenseDate && dayTotal > 0 ? "positive" : "neutral",
      };

  return renderMetricGrid(
    [
      {
        label: "Chi tháng",
        value: formatVND(monthTotal),
        delta: `${monthExpenses.length} khoản`,
        tone: monthTotal > 0 ? "neutral" : "warning",
      },
      detailMetric,
    ],
    { columns: 2 },
  );
}
