import { afterEach, describe, expect, it, vi } from "vitest";
import {
  comparePeriod,
  defaultExpenseDateForPeriod,
  defaultViewDateForPeriod,
  lastDayOfPeriod,
  resolveActivePeriod,
  todayYmd,
} from "../src/core/period";

describe("period helpers", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("compares YYYY-MM periods", () => {
    expect(comparePeriod("2026-08", "2026-09")).toBeLessThan(0);
    expect(comparePeriod("2026-09", "2026-09")).toBe(0);
    expect(comparePeriod("2026-10", "2026-09")).toBeGreaterThan(0);
  });

  it("resolves stale stored period to current month", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-02T10:00:00"));

    expect(resolveActivePeriod("2026-08")).toBe("2026-09");
    expect(resolveActivePeriod("2026-09")).toBe("2026-09");
    expect(resolveActivePeriod("2026-10")).toBe("2026-10");
  });

  it("defaults expense and view dates to today for current month", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-15T10:00:00"));

    expect(todayYmd()).toBe("2026-09-15");
    expect(defaultExpenseDateForPeriod("2026-09")).toBe("2026-09-15");
    expect(defaultViewDateForPeriod("2026-09")).toBe("2026-09-15");
  });

  it("defaults expense and view dates to month end for past months", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-15T10:00:00"));

    expect(defaultExpenseDateForPeriod("2026-08")).toBe(lastDayOfPeriod("2026-08"));
    expect(defaultViewDateForPeriod("2026-08")).toBe("2026-08-31");
  });
});
