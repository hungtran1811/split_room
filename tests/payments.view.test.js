import { afterEach, describe, expect, it, vi } from "vitest";
import { lastDayOfPeriod } from "../src/core/period.js";
import {
  buildPreviousDebtByMonth,
  defaultPaymentDateForPeriod,
  parseSettlementAction,
  settlementActionValue,
  isPaymentDateInPeriod,
} from "../src/ui/views/payments.view.js";

describe("payments.view settlement dates", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("uses today for the current month and last day for past months", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-13T12:00:00"));

    expect(defaultPaymentDateForPeriod("2026-06")).toBe("2026-06-13");
    expect(defaultPaymentDateForPeriod("2026-04")).toBe("2026-04-30");
    expect(lastDayOfPeriod("2026-04")).toBe("2026-04-30");
  });

  it("encodes and parses debt period in settlement actions", () => {
    const value = settlementActionValue(
      { fromId: "hung", toId: "thao", amount: 125000 },
      "2026-04",
    );

    expect(value).toBe("hung|thao|125000|2026-04");
    expect(parseSettlementAction(value, "2026-06")).toEqual({
      fromId: "hung",
      toId: "thao",
      amount: 125000,
      debtPeriod: "2026-04",
    });
  });

  it("falls back to viewing period for legacy 3-part actions", () => {
    expect(parseSettlementAction("hung|thao|50000", "2026-06")).toEqual({
      fromId: "hung",
      toId: "thao",
      amount: 50000,
      debtPeriod: "2026-06",
    });
  });

  it("validates payment dates inside debt period month", () => {
    expect(isPaymentDateInPeriod("2026-04-30", "2026-04")).toBe(true);
    expect(isPaymentDateInPeriod("2026-05-01", "2026-04")).toBe(false);
    expect(isPaymentDateInPeriod("2026-04-01", "2026-04")).toBe(true);
  });

  it("reduces previous-debt carry when payment is dated in source month", () => {
    const allExpenses = [
      {
        id: "e1",
        date: "2026-04-15",
        amount: 100000,
        payerId: "thao",
        participants: ["hung", "thao"],
        debts: { hung: 50000 },
      },
    ];
    const allPayments = [
      {
        id: "p1",
        date: "2026-04-30",
        amount: 50000,
        fromId: "hung",
        toId: "thao",
      },
    ];

    const timeline = buildPreviousDebtByMonth(
      allExpenses,
      allPayments,
      "2026-06",
    );

    expect(timeline).toEqual([]);
  });
});
