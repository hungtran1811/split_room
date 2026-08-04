import { describe, expect, it, beforeEach, vi } from "vitest";
import {
  AMOUNT_PRESETS,
  collectRecentNotes,
  findLastRepeatableExpense,
  rememberExpenseNote,
} from "../src/ui/utils/expense-quick-entry.js";

function mockLocalStorage() {
  const storage = new Map();
  vi.stubGlobal("localStorage", {
    getItem: (key) => (storage.has(key) ? storage.get(key) : null),
    setItem: (key, value) => storage.set(key, value),
    clear: () => storage.clear(),
  });
}

describe("expense-quick-entry", () => {
  beforeEach(() => {
    mockLocalStorage();
    localStorage.clear();
  });

  it("merges stored and expense notes without duplicates", () => {
    rememberExpenseNote("Đi chợ");
    const notes = collectRecentNotes(
      [
        { note: "Đi chợ", date: "2026-06-13" },
        { note: "Ăn trưa", date: "2026-06-12" },
      ],
      4,
    );

    expect(notes).toEqual(["Đi chợ", "Ăn trưa"]);
  });

  it("finds last repeatable expense for payer", () => {
    const expenses = [
      { amount: 0, participants: [] },
      {
        amount: 100_000,
        payerId: "hung",
        participants: ["hung", "thao"],
        note: "Cũ",
      },
      {
        amount: 50_000,
        payerId: "thinh",
        participants: ["thinh", "thuy"],
        note: "Mới",
      },
    ];

    expect(findLastRepeatableExpense(expenses, "hung")?.note).toBe("Cũ");
    expect(findLastRepeatableExpense(expenses)?.note).toBe("Cũ");
  });

  it("exposes common amount presets", () => {
    expect(AMOUNT_PRESETS).toContain(50_000);
    expect(AMOUNT_PRESETS).toContain(100_000);
  });
});
