import { renderIcon } from "../icons";

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

export function renderListRow({
  leading = "",
  title = "",
  subtitle = "",
  amount = "",
  actions = "",
  className = "",
  dataAttrs = {},
} = {}) {
  const dataString = Object.entries(dataAttrs)
    .map(([key, value]) => ` data-${key}="${escapeHtml(value)}"`)
    .join("");

  return `
    <article class="list-row ${className}"${dataString}>
      ${leading ? `<div class="list-row__leading">${leading}</div>` : ""}
      <div class="list-row__body">
        <div class="list-row__title">${title}</div>
        ${subtitle ? `<div class="list-row__subtitle">${subtitle}</div>` : ""}
      </div>
      ${amount ? `<div class="list-row__amount">${amount}</div>` : ""}
      ${actions ? `<div class="list-row__actions">${actions}</div>` : ""}
    </article>
  `;
}

export function renderIconButton({
  icon,
  label,
  variant = "outline-secondary",
  dataAttrs = {},
  className = "",
} = {}) {
  const dataString = Object.entries(dataAttrs)
    .map(([key, value]) => ` data-${key}="${escapeHtml(value)}"`)
    .join("");

  return `
    <button
      type="button"
      class="btn btn-${variant} btn-sm icon-btn ${className}"
      aria-label="${escapeHtml(label)}"
      title="${escapeHtml(label)}"
      ${dataString}
    >
      ${renderIcon(icon, { className: "icon icon--sm" })}
    </button>
  `;
}
