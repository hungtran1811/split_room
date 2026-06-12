import { formatVND } from "../../config/i18n";

function formatDayLabel(daysAgo) {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() - daysAgo);
  return `${date.getDate()}/${date.getMonth() + 1}`;
}

export function renderSparkline({
  values = [],
  label = "",
  width = 320,
  height = 88,
  strokeClass = "sparkline__stroke",
} = {}) {
  const nums = values.map((v) => Math.max(0, Number(v) || 0));
  const days = nums.length || 7;

  if (!nums.length) {
    return `
      <div class="sparkline sparkline--empty">
        ${label ? `<div class="sparkline__label">${label}</div>` : ""}
        <div class="sparkline__placeholder"></div>
      </div>
    `;
  }

  const max = Math.max(...nums, 1);
  const total = nums.reduce((sum, value) => sum + value, 0);
  const padX = 12;
  const padTop = 10;
  const padBottom = 4;
  const chartH = height - padTop - padBottom;
  const innerW = width - padX * 2;
  const step = nums.length > 1 ? innerW / (nums.length - 1) : 0;

  const points = nums
    .map((value, index) => {
      const x = padX + index * step;
      const y = padTop + chartH - (value / max) * chartH;
      return { x, y, value, index };
    });

  const polylinePoints = points.map((point) => `${point.x},${point.y}`).join(" ");
  const areaPoints = `${padX},${padTop + chartH} ${polylinePoints} ${padX + (nums.length - 1) * step},${padTop + chartH}`;

  const dayLabels = Array.from({ length: days }, (_, index) =>
    formatDayLabel(days - 1 - index),
  );

  return `
    <div class="sparkline">
      <div class="sparkline__head">
        ${label ? `<div class="sparkline__label">${label}</div>` : ""}
        <div class="sparkline__total">Tổng: <strong>${formatVND(total)}</strong></div>
      </div>
      <svg
        class="sparkline__svg"
        viewBox="0 0 ${width} ${height}"
        preserveAspectRatio="xMidYMid meet"
        role="img"
        aria-label="${label || "Biểu đồ chi tiêu 7 ngày"}"
      >
        <line
          class="sparkline__grid"
          x1="${padX}"
          y1="${padTop + chartH}"
          x2="${width - padX}"
          y2="${padTop + chartH}"
        />
        <polygon class="sparkline__fill" points="${areaPoints}" />
        <polyline
          class="${strokeClass}"
          points="${polylinePoints}"
          fill="none"
          stroke-width="2.5"
          stroke-linecap="round"
          stroke-linejoin="round"
        />
        ${points
          .map(
            (point) => `
              <circle
                class="sparkline__dot"
                cx="${point.x}"
                cy="${point.y}"
                r="3.5"
              >
                <title>${dayLabels[point.index]}: ${formatVND(point.value)}</title>
              </circle>
            `,
          )
          .join("")}
      </svg>
      <div class="sparkline__days" aria-hidden="true">
        ${dayLabels
          .map((day) => `<span class="sparkline__day">${day}</span>`)
          .join("")}
      </div>
    </div>
  `;
}

export function buildDailyTotals(items = [], days = 7) {
  const totals = Array.from({ length: days }, () => 0);
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  for (const item of items) {
    const date = String(item?.date || "");
    if (!date) continue;
    const itemStart = new Date(date);
    itemStart.setHours(0, 0, 0, 0);
    const diff = Math.floor((todayStart - itemStart) / 86400000);
    if (diff >= 0 && diff < days) {
      totals[days - 1 - diff] += Number(item.amount || 0);
    }
  }

  return totals;
}
