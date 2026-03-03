export function renderMoneyStatCard({
  label,
  value,
  hint = "",
  tone = "neutral",
  size = "md",
  className = "",
} = {}) {
  return `
    <article class="money-card money-card--${tone} money-card--${size} ${className || ""}">
      <div class="money-card__label">${label || ""}</div>
      <div class="money-card__value">${value || ""}</div>
      ${hint ? `<div class="money-card__hint">${hint}</div>` : ""}
    </article>
  `;
}
