export function renderFilterBar({
  fields = "",
  actions = "",
  className = "",
} = {}) {
  return `
    <section class="page-filter ${className || ""}">
      <div class="page-filter__main">${fields || ""}</div>
      ${actions ? `<div class="page-filter__side">${actions}</div>` : ""}
    </section>
  `;
}

export function renderGlobalPeriodBar({
  period = "",
  actions = "",
  label = "Tháng đang xem",
  className = "",
} = {}) {
  return renderFilterBar({
    className: `page-filter--global ${className || ""}`.trim(),
    fields: renderMonthField({
      id: "globalPeriodPicker",
      label,
      value: period,
    }),
    actions,
  });
}

export function renderMonthField({
  id,
  label = "Chọn tháng",
  value = "",
} = {}) {
  return `
    <div class="page-filter__field">
      <label class="form-label small mb-1" for="${id}">${label}</label>
      <input id="${id}" type="month" class="form-control" value="${value}" />
    </div>
  `;
}

export function renderFilterPill({
  label,
  tone = "neutral",
} = {}) {
  return `<span class="filter-pill filter-pill--${tone}">${label || ""}</span>`;
}
