import { describe, expect, it } from "vitest";
import { parseVndInput } from "../src/core/money.js";
import { formatVND } from "../src/config/i18n.js";

describe("money formatting and parsing", () => {
  it("rounds parsed VND input to whole numbers", () => {
    expect(parseVndInput("10.000,5")).toBe(10001);
    expect(parseVndInput("0,6")).toBe(1);
    expect(parseVndInput("0,4")).toBe(0);
  });

  it("formats VND without decimal digits", () => {
    expect(formatVND(39500.67)).toBe("39.501 đ");
    expect(formatVND(1.2)).toBe("1 đ");
  });
});
