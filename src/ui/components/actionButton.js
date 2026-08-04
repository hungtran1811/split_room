export function renderBtn({
  label,
  href = "",
  id = "",
  variant = "outline-secondary",
  size = "sm",
  type = "button",
  dataAttrs = {},
  className = "",
} = {}) {
  const idAttr = id ? ` id="${id}"` : "";
  const classes = `btn btn-${variant} ${size ? `btn-${size}` : ""} ${className}`.trim();
  const dataString = Object.entries(dataAttrs)
    .map(([key, value]) => ` data-${key}="${value}"`)
    .join("");

  if (href) {
    return `<a class="${classes}" href="${href}"${idAttr}${dataString}>${label}</a>`;
  }

  return `<button type="${type}" class="${classes}"${idAttr}${dataString}>${label}</button>`;
}

export function renderBtnGroup(buttons = []) {
  if (!buttons.length) return "";

  return `
    <div class="btn-toolbar-compact">
      ${buttons.map((button) => renderBtn(button)).join("")}
    </div>
  `;
}
