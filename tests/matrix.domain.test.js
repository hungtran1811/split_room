import { describe, expect, it } from "vitest";
import { ROSTER } from "../src/config/roster.js";
import {
  applyPaymentsToBalances,
  buildMonthlySettlementView,
  buildSettleMatrix,
} from "../src/domain/matrix/compute.js";
import {
  buildWholeEqualShares,
  normalizeWholeBalances,
} from "../src/domain/money/whole-vnd.js";

describe("matrix domain", () => {
  it("builds gross balances and settlement from expenses", () => {
    const view = buildMonthlySettlementView({
      roster: ROSTER,
      expenses: [
        {
          payerId: "hung",
          amount: 300000,
          debts: { thao: 100000, thinh: 100000, thuy: 100000 },
        },
      ],
      payments: [],
    });

    expect(view.balances).toEqual({
      hung: 300000,
      thao: -100000,
      thinh: -100000,
      thuy: -100000,
    });
    expect(view.settlementPlan).toHaveLength(3);
    expect(view.settlementPlan.every((item) => item.amount > 0)).toBe(true);
  });

  it("applies payments before computing settlement", () => {
    const balances = applyPaymentsToBalances(
      { hung: 300000, thao: -100000, thinh: -100000, thuy: -100000 },
      [{ fromId: "thao", toId: "hung", amount: 50000 }],
    );

    expect(balances).toEqual({
      hung: 250000,
      thao: -50000,
      thinh: -100000,
      thuy: -100000,
    });
  });

  it("builds a settlement matrix from settlement lines", () => {
    const matrix = buildSettleMatrix(["hung", "thao", "thinh"], [
      { fromId: "thao", toId: "hung", amount: 50000 },
      { fromId: "thinh", toId: "hung", amount: 100000 },
    ]);

    expect(matrix).toEqual({
      hung: { hung: 0, thao: 0, thinh: 0 },
      thao: { hung: 50000, thao: 0, thinh: 0 },
      thinh: { hung: 100000, thao: 0, thinh: 0 },
    });
  });

  it("returns an empty settlement when the month has no expenses", () => {
    const view = buildMonthlySettlementView({
      roster: ROSTER,
      expenses: [],
      payments: [],
    });

    expect(view.settlementPlan).toEqual([]);
    expect(Object.values(view.balances).every((value) => value === 0)).toBe(
      true,
    );
  });

  it("normalizes legacy decimal balances into whole VND while keeping zero-sum", () => {
    const normalized = normalizeWholeBalances(
      ["hung", "thao", "thinh", "thuy"],
      {
        hung: -269083.67,
        thao: 1598416,
        thinh: -482083.33,
        thuy: -847249,
      },
    );

    expect(normalized).toEqual({
      hung: -269084,
      thao: 1598416,
      thinh: -482083,
      thuy: -847249,
    });

    const positiveTotal = Object.values(normalized)
      .filter((value) => value > 0)
      .reduce((sum, value) => sum + value, 0);
    const negativeTotal = Object.values(normalized)
      .filter((value) => value < 0)
      .reduce((sum, value) => sum + Math.abs(value), 0);

    expect(positiveTotal).toBe(negativeTotal);
  });

  it("settles from balances remaining after payments instead of the original gross debt", () => {
    const view = buildMonthlySettlementView({
      roster: ROSTER,
      expenses: [
        {
          payerId: "thao",
          amount: 1598416,
          debts: {
            hung: 269083.67,
            thinh: 482083.33,
            thuy: 847249,
          },
        },
      ],
      payments: [
        { fromId: "hung", toId: "thao", amount: 37668 },
        { fromId: "thuy", toId: "thao", amount: 318999 },
      ],
    });

    expect(view.balancesBeforePayments).toEqual({
      hung: -269084,
      thao: 1598416,
      thinh: -482083,
      thuy: -847249,
    });
    expect(view.paymentsAppliedTotal).toBe(356667);
    expect(view.balances).toEqual({
      hung: -231416,
      thao: 1241749,
      thinh: -482083,
      thuy: -528250,
    });
    expect(view.settlementPlan).toEqual([
      { fromId: "thuy", toId: "thao", amount: 528250 },
      { fromId: "thinh", toId: "thao", amount: 482083 },
      { fromId: "hung", toId: "thao", amount: 231416 },
    ]);
    expect(view.totals).toEqual({
      grossDebtTotal: 1598416,
      remainingDebtTotal: 1241749,
    });
  });

  it("builds deterministic integer equal shares", () => {
    expect(buildWholeEqualShares(100000, ["hung", "thao", "thinh"])).toEqual({
      hung: 33334,
      thao: 33333,
      thinh: 33333,
    });
  });
});
