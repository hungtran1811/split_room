import { formatVND } from "../../config/i18n";
import { renderBtnGroup } from "./actionButton";

export function renderBalanceHero({
  amount = 0,
  label = "Còn phải trả",
  status = "settled",
  statusLabel = "Ổn",
  breakdown = [],
  actions = [],
} = {}) {
  const tone =
    status === "debt"
      ? "wallet-card--debt"
      : status === "pending"
        ? "wallet-card--pending"
        : "wallet-card--settled";

  return `
    <section class="wallet-card ${tone}">
      <div class="wallet-card__pattern" aria-hidden="true"></div>
      <div class="wallet-card__inner">
        <div class="wallet-card__top">
          <span class="wallet-card__label">${label}</span>
          <span class="wallet-card__badge">${statusLabel}</span>
        </div>
        <div class="wallet-card__amount">${formatVND(amount)}</div>
        ${
          breakdown.length
            ? `
              <div class="wallet-card__breakdown">
                ${breakdown
                  .map(
                    (item) =>
                      `<span class="wallet-card__chip">${item.label} <strong>${formatVND(item.amount)}</strong></span>`,
                  )
                  .join("")}
              </div>
            `
            : ""
        }
        ${actions.length ? `<div class="wallet-card__actions">${renderBtnGroup(actions)}</div>` : ""}
      </div>
    </section>
  `;
}
