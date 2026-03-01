import { describe, expect, it } from "vitest";
import {
  buildEqualShares,
  computeRentCosts,
  sanitizeRentPayload,
} from "../src/domain/rent/compute.js";
import { validateShares, clampPaidToShares } from "../src/domain/rent/validate.js";

describe("rent domain", () => {
  it("buildEqualShares preserves total", () => {
    const shares = buildEqualShares(10, ["a", "b", "c"]);
    expect(Object.values(shares).reduce((sum, value) => sum + value, 0)).toBe(10);
  });

  it("computeRentCosts calculates water, electric and total", () => {
    const result = computeRentCosts(
      { rent: 4000000, wifi: 150000, other: 0 },
      {
        headcount: 4,
        water: { unitPrice: 100000, mode: "perPerson" },
        electric: { oldKwh: 11214, newKwh: 11289, unitPrice: 4000 },
      },
    );

    expect(result.waterCost).toBe(400000);
    expect(result.kwhUsed).toBe(75);
    expect(result.electricCost).toBe(300000);
    expect(result.total).toBe(4850000);
  });

  it("validateShares rejects totals that do not match", () => {
    expect(validateShares(100, { a: 50, b: 40 })).toContain("Tổng phần chia");
  });

  it("clampPaidToShares does not let paid exceed shares", () => {
    expect(clampPaidToShares({ a: 200, b: -10 }, { a: 100, b: 50 })).toEqual({
      a: 100,
      b: 0,
    });
  });

  it("sanitizeRentPayload preserves createdBy and finalized metadata from existing docs", () => {
    const payload = sanitizeRentPayload(
      "2026-03",
      {
        payerId: "hung",
        items: { rent: 1, wifi: 2, other: 3 },
        total: 6,
        headcount: 4,
        water: { unitPrice: 100000, mode: "perPerson" },
        electric: { oldKwh: 1, newKwh: 2, unitPrice: 3000 },
        computed: { waterCost: 4, kwhUsed: 1, electricCost: 3 },
        splitMode: "equal",
        shares: { a: 3, b: 3 },
        paid: { a: 0, b: 0 },
        createdBy: "new-admin",
      },
      {
        createdBy: "old-admin",
        status: "finalized",
        finalizedAt: "2026-03-01T00:00:00.000Z",
        finalizedBy: "old-admin",
      },
    );

    expect(payload.createdBy).toBe("old-admin");
    expect(payload.status).toBe("finalized");
    expect(payload.finalizedBy).toBe("old-admin");
  });
});
