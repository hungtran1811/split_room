import { describe, expect, it } from "vitest";
import { ROSTER } from "../src/config/roster.js";
import { buildMonthlySettlementView } from "../src/domain/matrix/compute.js";
import {
  applyPaymentsToBalances,
  buildMonthlyReport,
} from "../src/domain/report/compute.js";

describe("report domain", () => {
  it("builds a monthly report without rent", () => {
    const report = buildMonthlyReport({
      period: "2026-03",
      roster: ROSTER,
      expenses: [
        {
          payerId: "hung",
          amount: 300000,
          debts: { thao: 100000, thinh: 100000, thuy: 100000 },
        },
      ],
      payments: [
        {
          fromId: "thao",
          toId: "hung",
          amount: 50000,
        },
      ],
      rent: null,
    });

    expect(report.stats.expenseCount).toBe(1);
    expect(report.stats.paymentCount).toBe(1);
    expect(report.stats.expenseTotal).toBe(300000);
    expect(report.stats.paymentTotal).toBe(50000);
    expect(report.stats.rentTotal).toBe(0);
    expect(report.rentSummary).toBeNull();
  });

  it("includes rent summary and member rent balances when rent exists", () => {
    const report = buildMonthlyReport({
      period: "2026-03",
      roster: ROSTER,
      expenses: [],
      payments: [],
      rent: {
        payerId: "hung",
        total: 4850000,
        shares: {
          hung: 1326000,
          thao: 1787000,
          thinh: 1637000,
          thuy: 100000,
        },
        paid: {
          hung: 0,
          thao: 1000000,
          thinh: 1637000,
          thuy: 0,
        },
        note: "Tien nha thang 3",
      },
    });

    expect(report.stats.rentTotal).toBe(4850000);
    expect(report.rentSummary).toMatchObject({
      payerId: "hung",
      total: 4850000,
      collected: 2637000,
      remaining: 887000,
    });

    const thao = report.memberSummaries.find((item) => item.memberId === "thao");
    const thuy = report.memberSummaries.find((item) => item.memberId === "thuy");

    expect(thao).toMatchObject({
      rentShare: 1787000,
      rentPaid: 1000000,
      rentRemaining: 787000,
    });
    expect(thuy).toMatchObject({
      rentShare: 100000,
      rentPaid: 0,
      rentRemaining: 100000,
    });
  });

  it("applies payments onto balances before settlement", () => {
    const result = applyPaymentsToBalances(
      { hung: 200000, thao: -100000, thinh: -100000, thuy: 0 },
      [{ fromId: "thao", toId: "hung", amount: 50000 }],
    );

    expect(result).toEqual({
      hung: 150000,
      thao: -50000,
      thinh: -100000,
      thuy: 0,
    });
  });

  it("never emits negative settlement amounts", () => {
    const report = buildMonthlyReport({
      period: "2026-03",
      roster: ROSTER,
      expenses: [
        {
          payerId: "hung",
          amount: 300000,
          debts: { thao: 100000, thinh: 100000, thuy: 100000 },
        },
      ],
      payments: [],
      rent: null,
    });

    expect(report.settlementPlan.every((item) => item.amount > 0)).toBe(true);
    expect(report.stats.settlementCount).toBe(report.settlementPlan.length);
  });

  it("matches the canonical monthly settlement builder", () => {
    const expenses = [
      {
        payerId: "thao",
        amount: 1598416,
        debts: {
          hung: 269083.67,
          thinh: 482083.33,
          thuy: 847249,
        },
      },
    ];
    const payments = [
      { fromId: "hung", toId: "thao", amount: 37668 },
      { fromId: "thuy", toId: "thao", amount: 318999 },
    ];

    const report = buildMonthlyReport({
      period: "2026-03",
      roster: ROSTER,
      expenses,
      payments,
      rent: null,
    });
    const canonical = buildMonthlySettlementView({
      roster: ROSTER,
      expenses,
      payments,
    });

    expect(report.balances).toEqual(canonical.balances);
    expect(report.settlementPlan).toEqual(canonical.settlementPlan);
    expect(report.stats.settlementCount).toBe(canonical.settlementPlan.length);
  });
});
