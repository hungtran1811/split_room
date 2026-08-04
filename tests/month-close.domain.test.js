import { describe, expect, it } from "vitest";
import { ROSTER } from "../src/config/roster.js";
import { buildMonthlySettlementView } from "../src/domain/matrix/compute.js";
import { buildMonthCloseSnapshot } from "../src/domain/report/month-close.js";

describe("buildMonthCloseSnapshot", () => {
  it("marks snapshot as month-close and matches settlement view", () => {
    const expenses = [
      {
        payerId: "hung",
        amount: 300000,
        debts: { thao: 100000, thinh: 100000, thuy: 100000 },
      },
    ];
    const payments = [{ fromId: "thao", toId: "hung", amount: 50000 }];

    const close = buildMonthCloseSnapshot({
      roster: ROSTER,
      expenses,
      payments,
      rent: null,
      members: [
        { uid: "u1", memberId: "hung", displayName: "Hưng" },
        { uid: "u2", memberId: "thao", displayName: "Thảo" },
      ],
    });

    const canonical = buildMonthlySettlementView({
      roster: ROSTER,
      expenses,
      payments,
    });

    expect(close.snapshotType).toBe("month-close");
    expect(close.balances).toEqual(canonical.balances);
    expect(close.settlementPlan).toEqual(canonical.settlementPlan);
    expect(close.snapshot.settlementPlan).toEqual(canonical.settlementPlan);
    expect(close.stats.settlementCount).toBe(canonical.settlementPlan.length);
  });

  it("includes rent summary when rent is provided", () => {
    const close = buildMonthCloseSnapshot({
      roster: ROSTER,
      expenses: [],
      payments: [],
      rent: {
        payerId: "hung",
        total: 4000000,
        shares: { hung: 1000000, thao: 1000000, thinh: 1000000, thuy: 1000000 },
        paid: { hung: 0, thao: 500000, thinh: 0, thuy: 0 },
      },
      members: [],
    });

    expect(close.rentSummary).toMatchObject({
      payerId: "hung",
      total: 4000000,
      collected: 500000,
    });
    expect(close.stats.rentTotal).toBe(4000000);
  });
});
