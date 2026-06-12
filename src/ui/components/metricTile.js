export function renderMetricTile({
  label,
  value,
  href = "",
  tone = "neutral",
  delta = "",
  className = "",
} = {}) {
  const content = `
    <article class="metric-tile metric-tile--${tone} ${className}">
      <div class="metric-tile__label">${label || ""}</div>
      <div class="metric-tile__value">${value || ""}</div>
      ${delta ? `<div class="metric-tile__delta">${delta}</div>` : ""}
    </article>
  `;

  if (href) {
    return `<a class="metric-tile-link" href="${href}">${content}</a>`;
  }

  return content;
}

export function renderMetricGrid(tiles = [], { columns = 4 } = {}) {
  return `
    <section class="metric-grid metric-grid--${columns}">
      ${tiles.map((tile) => renderMetricTile(tile)).join("")}
    </section>
  `;
}

// Backward compat
export function renderMoneyStatCard({
  label,
  value,
  hint = "",
  tone = "neutral",
  size = "md",
  className = "",
  href = "",
} = {}) {
  return renderMetricTile({
    label,
    value,
    tone,
    delta: hint,
    className: `metric-tile--${size} ${className}`.trim(),
    href,
  });
}
