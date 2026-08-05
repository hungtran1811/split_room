import { describe, expect, it } from "vitest";
import {
  computeSettlementPlan,
  filterBalancesForMember,
  filterPaymentsForMember,
  filterSettlementForMember,
} from "../src/domain/settlement/compute.js";

describe("settlement domain", () => {
  it("does not create negative or impossible payments", () => {
    const result = computeSettlementPlan({
      hung: 100000,
      thao: -60000,
      thinh: -40000,
    });

    expect(result).toEqual([
      { fromId: "thao", toId: "hung", amount: 60000 },
      { fromId: "thinh", toId: "hung", amount: 40000 },
    ]);
  });

  it("filters settlement and payments to the current member", () => {
    const plan = [
      { fromId: "thao", toId: "hung", amount: 60000 },
      { fromId: "thinh", toId: "hung", amount: 40000 },
      { fromId: "thinh", toId: "thao", amount: 10000 },
    ];

    expect(filterSettlementForMember(plan, "thao")).toEqual([
      { fromId: "thao", toId: "hung", amount: 60000 },
      { fromId: "thinh", toId: "thao", amount: 10000 },
    ]);
    expect(filterPaymentsForMember(plan, "hung")).toHaveLength(2);
    expect(filterBalancesForMember({ hung: 100, thao: -60, thinh: -40 }, "thao")).toEqual({
      thao: -60,
    });
  });
});
