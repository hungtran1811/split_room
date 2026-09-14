import { describe, expect, it } from "vitest";
import { parseVndInput } from "../src/core/money.js";
import { formatCompactVND, formatVND } from "../src/config/i18n.js";

describe("money formatting and parsing", () => {
  it("rounds parsed VND input to whole numbers", () => {
    expect(parseVndInput("10.000,5")).toBe(10001);
    expect(parseVndInput("0,6")).toBe(1);
    expect(parseVndInput("0,4")).toBe(0);
  });

  it("formats VND without decimal digits", () => {
    expect(formatVND(39500.67)).toBe("39.501\u00A0đ");
    expect(formatVND(1.2)).toBe("1\u00A0đ");
  });

  it("keeps exact VND values below one million", () => {
    expect(formatCompactVND(0)).toBe("0\u00A0đ");
    expect(formatCompactVND(999_999)).toBe("999.999\u00A0đ");
  });

  it("compacts millions and billions to at most two decimal places", () => {
    expect(formatCompactVND(1_000_000)).toBe("1\u00A0tr");
    expect(formatCompactVND(1_250_000)).toBe("1,25\u00A0tr");
    expect(formatCompactVND(1_234_567_890)).toBe("1,23\u00A0tỷ");
  });

  it("preserves negative signs and can show an explicit positive sign", () => {
    expect(formatCompactVND(-1_250_000)).toBe("-1,25\u00A0tr");
    expect(formatCompactVND(1_250_000, { showPositiveSign: true })).toBe("+1,25\u00A0tr");
    expect(formatCompactVND(0, { showPositiveSign: true })).toBe("0\u00A0đ");
  });
});
