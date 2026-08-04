import { describe, expect, it } from "vitest";
import { buildMonthlyReportCsv } from "../src/services/report-export.service.js";

describe("report-export.service", () => {
  it("builds csv with stats and member rows", () => {
    const csv = buildMonthlyReportCsv(
      {
        stats: {
          expenseTotal: 100000,
          expenseCount: 2,
          paymentTotal: 50000,
          paymentCount: 1,
          rentTotal: 2000000,
          settlementCount: 1,
        },
        memberSummaries: [
          {
            name: "A",
            netBalance: -10000,
            rentShare: 500000,
            rentPaid: 400000,
            rentRemaining: 100000,
          },
        ],
        settlementPlan: [{ fromId: "a", toId: "b", amount: 10000 }],
      },
      "2026-06",
    );

    expect(csv).toContain("2026-06");
    expect(csv).toContain("100.000");
    expect(csv).toContain("A");
    expect(csv).toContain("a -> b");
  });
});
