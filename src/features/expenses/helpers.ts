export type ExpenseLike = {
  id?: string;
  date?: string;
  amount?: number;
  [key: string]: unknown;
};

export function filterExpensesByDate(
  expenses: ExpenseLike[],
  selectedExpenseDate: string,
): ExpenseLike[] {
  if (!selectedExpenseDate) return [];
  return (expenses || []).filter((expense) => expense.date === selectedExpenseDate);
}

export function getVisibleExpenses(
  expenses: ExpenseLike[],
  {
    selectedExpenseDate = "",
    showAllMonth = false,
  }: { selectedExpenseDate?: string; showAllMonth?: boolean } = {},
): ExpenseLike[] {
  if (showAllMonth) {
    return [...(expenses || [])].sort((left, right) =>
      String(right.date || "").localeCompare(String(left.date || "")),
    );
  }

  return filterExpensesByDate(expenses, selectedExpenseDate);
}

export function groupExpensesByDate(
  expenses: ExpenseLike[],
  { descending = true }: { descending?: boolean } = {},
): Array<{ date: string; items: ExpenseLike[] }> {
  const groups = new Map<string, ExpenseLike[]>();
  for (const expense of expenses) {
    const key = expense.date || "Không rõ ngày";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(expense);
  }

  const entries = [...groups.entries()];
  entries.sort((left, right) =>
    descending
      ? right[0].localeCompare(left[0])
      : left[0].localeCompare(right[0]),
  );

  return entries.map(([date, items]) => ({ date, items }));
}
