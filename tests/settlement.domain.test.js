import { describe, expect, it } from "vitest";
import { computeSettlementPlan } from "../src/domain/settlement/compute.js";

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
});
