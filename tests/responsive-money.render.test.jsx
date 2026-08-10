import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { ResponsiveMoney } from "../src/shared/ui/ResponsiveMoney.jsx";

afterEach(cleanup);

describe("ResponsiveMoney", () => {
  it("renders full and compact visual values with the exact value as its tooltip", () => {
    const { container } = render(<ResponsiveMoney amount={1_250_000} className="money-due" />);

    const money = container.querySelector(".responsive-money");
    expect(money?.getAttribute("title")).toBe("1.250.000\u00A0đ");
    expect(money.classList.contains("responsive-money")).toBe(true);
    expect(money.classList.contains("money-due")).toBe(true);
    expect(container.querySelector(".responsive-money__full")?.textContent).toBe("1.250.000\u00A0đ");
    expect(container.querySelector(".responsive-money__compact")?.textContent).toBe("1,25\u00A0tr");
  });

  it("exposes the exact value to assistive technology only once", () => {
    const { container } = render(<ResponsiveMoney amount={1_250_000} showPositiveSign />);

    const fullVisual = container.querySelector(".responsive-money__full");
    const compactVisual = container.querySelector(".responsive-money__compact");
    const accessibleValue = container.querySelector(".sr-only");

    expect(fullVisual?.getAttribute("aria-hidden")).toBe("true");
    expect(compactVisual?.getAttribute("aria-hidden")).toBe("true");
    expect(accessibleValue?.textContent).toBe("+1.250.000\u00A0đ");
    expect(accessibleValue?.hasAttribute("aria-hidden")).toBe(false);
    expect(container.querySelectorAll(".sr-only")).toHaveLength(1);
  });
});
