export function renderSectionHeader({
  title,
  subtitle = "",
  action = "",
  titleTag = "h2",
  className = "",
} = {}) {
  const safeTitleTag = titleTag || "h2";

  return `
    <div class="section-header ${className || ""}">
      <div class="section-header__copy">
        <${safeTitleTag} class="section-header__title">${title || ""}</${safeTitleTag}>
        ${subtitle ? `<div class="section-header__subtitle">${subtitle}</div>` : ""}
      </div>
      ${action ? `<div class="section-header__action">${action}</div>` : ""}
    </div>
  `;
}
