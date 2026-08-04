import {
  currentPeriod,
  getSelectedPeriod,
  normalizePeriod,
  setSelectedPeriod,
} from "../../core/state";

function parsePeriodParts(period) {
  const normalized = normalizePeriod(period);
  const [yearString, monthString] = normalized.split("-");
  return {
    year: Number(yearString),
    month: Number(monthString),
  };
}

export function shiftPeriod(period, deltaMonths) {
  const { year, month } = parsePeriodParts(period);
  const date = new Date(year, month - 1 + deltaMonths, 1);
  const nextYear = date.getFullYear();
  const nextMonth = String(date.getMonth() + 1).padStart(2, "0");
  return `${nextYear}-${nextMonth}`;
}

export function describePeriodChip(period) {
  const { year, month } = parsePeriodParts(period);
  if (!year || month < 1 || month > 12) return "";
  return `Tháng ${month}/${year}`;
}

export function isCurrentPeriod(period) {
  return normalizePeriod(period) === currentPeriod();
}

export function updatePeriodUi(period) {
  const picker = document.getElementById("globalPeriodPicker");
  if (picker && picker.value !== period) {
    picker.value = period;
  }

  const chip = document.getElementById("globalPeriodChip");
  if (chip) {
    chip.textContent = describePeriodChip(period);
    chip.classList.toggle("period-pill__label--current", isCurrentPeriod(period));
  }

  const todayButton = document.getElementById("globalPeriodToday");
  if (todayButton) {
    todayButton.disabled = isCurrentPeriod(period);
  }
}

export function bindPeriodControls({ onChange } = {}) {
  const picker = document.getElementById("globalPeriodPicker");
  const prevButton = document.getElementById("globalPeriodPrev");
  const nextButton = document.getElementById("globalPeriodNext");
  const todayButton = document.getElementById("globalPeriodToday");

  const emitChange = (nextPeriod) => {
    const normalized = setSelectedPeriod(nextPeriod);
    updatePeriodUi(normalized);
    if (typeof onChange === "function") {
      onChange(normalized);
    }
    return normalized;
  };

  if (picker && !picker.dataset.periodBound) {
    picker.dataset.periodBound = "true";
    picker.addEventListener("change", (event) => {
      emitChange(event.target.value);
    });
  }

  if (prevButton && !prevButton.dataset.periodBound) {
    prevButton.dataset.periodBound = "true";
    prevButton.addEventListener("click", () => {
      emitChange(shiftPeriod(getSelectedPeriod(), -1));
    });
  }

  if (nextButton && !nextButton.dataset.periodBound) {
    nextButton.dataset.periodBound = "true";
    nextButton.addEventListener("click", () => {
      emitChange(shiftPeriod(getSelectedPeriod(), 1));
    });
  }

  if (todayButton && !todayButton.dataset.periodBound) {
    todayButton.dataset.periodBound = "true";
    todayButton.addEventListener("click", () => {
      emitChange(currentPeriod());
    });
  }

  updatePeriodUi(getSelectedPeriod());
}
