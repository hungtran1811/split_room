import { describe, expect, it } from "vitest";
import {
  isRosterMemberId,
  resolveMemberLabel,
  sanitizeNickname,
} from "../src/domain/members/nicknames";

describe("nicknames", () => {
  it("sanitizes and clamps nickname length", () => {
    expect(sanitizeNickname("  Mèo   béo  ")).toBe("Mèo béo");
    expect(sanitizeNickname("x".repeat(40))).toBe("x".repeat(24));
    expect(sanitizeNickname("   ")).toBe("");
  });

  it("resolves nickname before roster name", () => {
    expect(resolveMemberLabel("thao", { thao: "Mèo" })).toBe("Mèo");
    expect(resolveMemberLabel("thao", {})).toBe("Thảo");
    expect(resolveMemberLabel("unknown", {})).toBe("unknown");
  });

  it("only accepts roster member ids", () => {
    expect(isRosterMemberId("hung")).toBe(true);
    expect(isRosterMemberId("stranger")).toBe(false);
  });
});
