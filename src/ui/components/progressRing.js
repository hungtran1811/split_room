export function renderProgressRing({
  percent = 0,
  label = "",
  sublabel = "",
  size = 88,
  stroke = 8,
} = {}) {
  const clamped = Math.max(0, Math.min(100, Number(percent) || 0));
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (clamped / 100) * circumference;
  const hasCaption = Boolean(label || sublabel);

  return `
    <div class="progress-ring-wrap ${hasCaption ? "progress-ring-wrap--caption" : ""}">
      <div class="progress-ring" style="--ring-size:${size}px">
        <svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" aria-hidden="true">
          <circle class="progress-ring__track" cx="${size / 2}" cy="${size / 2}" r="${radius}" stroke-width="${stroke}" fill="none" />
          <circle
            class="progress-ring__value"
            cx="${size / 2}"
            cy="${size / 2}"
            r="${radius}"
            stroke-width="${stroke}"
            fill="none"
            stroke-dasharray="${circumference}"
            stroke-dashoffset="${offset}"
            transform="rotate(-90 ${size / 2} ${size / 2})"
          />
        </svg>
        <div class="progress-ring__center">
          <div class="progress-ring__percent">${Math.round(clamped)}%</div>
        </div>
      </div>
      ${
        hasCaption
          ? `
            <div class="progress-ring__caption">
              ${label ? `<div class="progress-ring__label">${label}</div>` : ""}
              ${sublabel ? `<div class="progress-ring__sublabel">${sublabel}</div>` : ""}
            </div>
          `
          : ""
      }
    </div>
  `;
}
