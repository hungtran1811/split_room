import { describe, expect, it } from "vitest";
import { ROSTER } from "../src/config/roster.js";
import {
  applyPaymentsToBalances,
  buildMonthlySettlementView,
  buildSettleMatrix,
} from "../src/domain/matrix/compute.js";

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
});
