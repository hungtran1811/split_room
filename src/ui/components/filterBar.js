import { renderIcon } from "../icons";

export function renderCompactPeriodNav({
  period = "",
  locked = false,
  className = "",
} = {}) {
  const lockBadge = locked
    ? `<span class="filter-pill filter-pill--success period-pill__lock">Đã chốt</span>`
    : "";

  return `
    <div class="period-pill ${className || ""}">
      <button
        type="button"
        class="period-pill__btn"
        id="globalPeriodPrev"
        aria-label="Tháng trước"
      >
        ${renderIcon("chevronLeft", { className: "icon icon--sm", size: 16 })}
      </button>
      <label class="period-pill__chip" for="globalPeriodPicker">
        <span class="period-pill__label" id="globalPeriodChip">${describePeriodChip(period)}</span>
        <input id="globalPeriodPicker" type="month" class="period-pill__input" value="${period}" />
      </label>
      <button
        type="button"
        class="period-pill__btn"
        id="globalPeriodNext"
        aria-label="Tháng sau"
      >
        ${renderIcon("chevronRight", { className: "icon icon--sm", size: 16 })}
      </button>
      <button
        type="button"
        class="period-pill__today"
        id="globalPeriodToday"
        aria-label="Về tháng hiện tại"
        ${isCurrentPeriodValue(period) ? "disabled" : ""}
      >
        Tháng này
      </button>
      ${lockBadge}
    </div>
  `;
}

function describePeriodChip(period) {
  const normalized = String(period || "").trim();
  const match = normalized.match(/^(\d{4})-(\d{2})$/);
  if (!match) return "Chọn tháng";

  const year = Number(match[1]);
  const month = Number(match[2]);
  if (!year || month < 1 || month > 12) return "Chọn tháng";

  return `Tháng ${month}/${year}`;
}

function isCurrentPeriodValue(period) {
  const normalized = String(period || "").trim();
  const now = new Date();
  const current = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  return normalized === current;
}
