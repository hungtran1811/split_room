import { describe, expect, it } from "vitest";
import {
  filterExpensesByDate,
  getVisibleExpenses,
  groupExpensesByDate,
} from "../src/ui/views/expenses.view.js";

describe("expenses.view", () => {
  const expenses = [
    { id: "1", date: "2026-06-01", amount: 100 },
    { id: "2", date: "2026-06-13", amount: 200 },
    { id: "3", date: "2026-06-13", amount: 50 },
  ];

  it("filters expenses by selected date", () => {
    expect(filterExpensesByDate(expenses, "2026-06-13")).toHaveLength(2);
    expect(filterExpensesByDate(expenses, "")).toEqual([]);
  });

  it("returns all month expenses sorted newest first", () => {
    const visible = getVisibleExpenses(expenses, { showAllMonth: true });
    expect(visible.map((item) => item.id)).toEqual(["2", "3", "1"]);
  });

  it("groups expenses by date in descending order", () => {
    const groups = groupExpensesByDate(expenses);
    expect(groups.map((group) => group.date)).toEqual([
      "2026-06-13",
      "2026-06-01",
    ]);
    expect(groups[0].items).toHaveLength(2);
  });
});
