import { beforeEach, describe, expect, it, vi } from "vitest";

const hubMocks = vi.hoisted(() => ({
  watchMonthExpenses: vi.fn(),
  watchMonthPayments: vi.fn(),
  watchRentByPeriod: vi.fn(),
  fetchExpensesBefore: vi.fn(),
  fetchPaymentsBefore: vi.fn(),
}));

vi.mock("../src/services/month-ops.service.js", () => ({
  getMonthRange: () => ({ start: "2026-06-01", end: "2026-07-01" }),
  watchMonthExpenses: hubMocks.watchMonthExpenses,
  watchMonthPayments: hubMocks.watchMonthPayments,
}));

vi.mock("../src/services/rent.service.js", () => ({
  watchRentByPeriod: hubMocks.watchRentByPeriod,
}));

vi.mock("../src/services/expense.service.js", () => ({
  fetchExpensesBefore: hubMocks.fetchExpensesBefore,
}));

vi.mock("../src/services/payment.service.js", () => ({
  fetchPaymentsBefore: hubMocks.fetchPaymentsBefore,
}));

import {
  clearHistoricalCache,
  disposeLiveDataHub,
  fetchHistoricalBefore,
  subscribeLiveMonthData,
} from "../src/services/live-data-hub.js";

describe("live-data-hub", () => {
  beforeEach(() => {
    disposeLiveDataHub();
    clearHistoricalCache();
    hubMocks.watchMonthExpenses.mockReset();
    hubMocks.watchMonthPayments.mockReset();
    hubMocks.watchRentByPeriod.mockReset();
    hubMocks.fetchExpensesBefore.mockReset();
    hubMocks.fetchPaymentsBefore.mockReset();

    hubMocks.watchMonthExpenses.mockReturnValue(() => {});
    hubMocks.watchMonthPayments.mockReturnValue(() => {});
    hubMocks.watchRentByPeriod.mockReturnValue(() => {});
  });

  it("starts one watcher set per group+period", () => {
    subscribeLiveMonthData({
      consumerId: "dashboard",
      groupId: "P102",
      period: "2026-06",
      onUpdate: vi.fn(),
    });

    subscribeLiveMonthData({
      consumerId: "payments",
      groupId: "P102",
      period: "2026-06",
      onUpdate: vi.fn(),
    });

    expect(hubMocks.watchMonthExpenses).toHaveBeenCalledTimes(1);
    expect(hubMocks.watchMonthPayments).toHaveBeenCalledTimes(1);
    expect(hubMocks.watchRentByPeriod).toHaveBeenCalledTimes(1);
  });

  it("caches fetchHistoricalBefore per period", async () => {
    hubMocks.fetchExpensesBefore.mockResolvedValue([{ id: "e1" }]);
    hubMocks.fetchPaymentsBefore.mockResolvedValue([{ id: "p1" }]);

    const first = await fetchHistoricalBefore("P102", "2026-06");
    const second = await fetchHistoricalBefore("P102", "2026-06");

    expect(first.expensesBefore).toEqual([{ id: "e1" }]);
    expect(second.paymentsBefore).toEqual([{ id: "p1" }]);
    expect(hubMocks.fetchExpensesBefore).toHaveBeenCalledTimes(1);
    expect(hubMocks.fetchPaymentsBefore).toHaveBeenCalledTimes(1);
  });
});
