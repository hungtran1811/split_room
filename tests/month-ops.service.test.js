import { beforeEach, describe, expect, it, vi } from "vitest";

const firestoreMocks = vi.hoisted(() => ({
  collection: vi.fn(() => "COLLECTION_REF"),
  getDocs: vi.fn(),
  orderBy: vi.fn((...args) => ({ type: "orderBy", args })),
  query: vi.fn((...args) => ({ type: "query", args })),
  where: vi.fn((...args) => ({ type: "where", args })),
}));

const serviceMocks = vi.hoisted(() => ({
  watchExpensesByRange: vi.fn(),
  watchPaymentsByRange: vi.fn(),
}));

vi.mock("../src/config/firebase.js", () => ({
  db: {},
}));

vi.mock("firebase/firestore", () => ({
  collection: firestoreMocks.collection,
  getDocs: firestoreMocks.getDocs,
  orderBy: firestoreMocks.orderBy,
  query: firestoreMocks.query,
  where: firestoreMocks.where,
}));

vi.mock("../src/services/expense.service.js", () => ({
  watchExpensesByRange: serviceMocks.watchExpensesByRange,
}));

vi.mock("../src/services/payment.service.js", () => ({
  watchPaymentsByRange: serviceMocks.watchPaymentsByRange,
}));

import {
  getMonthRange,
  loadMonthOps,
  watchMonthExpenses,
  watchMonthPayments,
} from "../src/services/month-ops.service.js";

describe("month ops service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("builds the right month range", () => {
    expect(getMonthRange("2026-03")).toEqual({
      start: "2026-03-01",
      end: "2026-04-01",
    });
  });

  it("delegates month expense watchers to the existing range watcher", () => {
    const cb = vi.fn();

    watchMonthExpenses("P102", "2026-03", cb);

    expect(serviceMocks.watchExpensesByRange).toHaveBeenCalledWith(
      "P102",
      "2026-03-01",
      "2026-04-01",
      cb,
    );
  });

  it("delegates month payment watchers to the existing range watcher", () => {
    const cb = vi.fn();

    watchMonthPayments("P102", "2026-03", cb);

    expect(serviceMocks.watchPaymentsByRange).toHaveBeenCalledWith(
      "P102",
      "2026-03-01",
      "2026-04-01",
      cb,
    );
  });

  it("loads month expenses and payments together", async () => {
    firestoreMocks.getDocs
      .mockResolvedValueOnce({
        docs: [
          {
            id: "expense-1",
            data: () => ({ date: "2026-03-01", amount: 1000 }),
          },
        ],
      })
      .mockResolvedValueOnce({
        docs: [
          {
            id: "payment-1",
            data: () => ({ date: "2026-03-02", amount: 500 }),
          },
        ],
      });

    const result = await loadMonthOps("P102", "2026-03");

    expect(result).toEqual({
      expenses: [{ id: "expense-1", date: "2026-03-01", amount: 1000 }],
      payments: [{ id: "payment-1", date: "2026-03-02", amount: 500 }],
    });
    expect(firestoreMocks.getDocs).toHaveBeenCalledTimes(2);
  });
});
