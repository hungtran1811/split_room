import { formatVND } from "../../../config/i18n";
import { nameOf } from "../../../config/roster";
import { renderMetricGrid } from "../../components/metricTile";

export function todayYmd() {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function expenseDateForPeriod(period) {
  const today = new Date();
  const [year, month] = String(period || "").split("-").map(Number);
  if (!year || !month) return todayYmd();

  const currentDay = today.getDate();
  const lastDay = new Date(year, month, 0).getDate();
  const day = String(Math.min(currentDay, lastDay)).padStart(2, "0");
  return `${year}-${String(month).padStart(2, "0")}-${day}`;
}

export function lastDayOfPeriod(period) {
  const [year, month] = String(period || "").split("-").map(Number);
  if (!year || !month) return todayYmd();
  const day = String(new Date(year, month, 0).getDate()).padStart(2, "0");
  return `${year}-${String(month).padStart(2, "0")}-${day}`;
}

export function defaultExpenseDate(period) {
  const today = todayYmd();
  if (today.slice(0, 7) === period) return today;
  return expenseDateForPeriod(period);
}

export function defaultListDate(period) {
  const today = todayYmd();
  return today.slice(0, 7) === period ? today : "";
}

export function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

export function renderExpenseDebtors(debts) {
  const entries = Object.entries(debts || {}).filter(
    ([, amount]) => Number(amount) > 0,
  );

  if (!entries.length) {
    return '<span class="expense-item__debtor expense-item__debtor--empty">Không có người nợ</span>';
  }

  return entries
    .map(
      ([memberId, amount]) => `
        <span class="expense-item__debtor">
          ${escapeHtml(nameOf(memberId))}
          <strong>${formatVND(amount)}</strong>
        </span>
      `,
    )
    .join("");
}

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

  return entries.map(([date, items]) => ({ date, items }));
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
