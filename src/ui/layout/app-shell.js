import { renderGlobalPeriodBar } from "../components/filterBar";

function renderMetaLines(meta = []) {
  const lines = meta.filter(Boolean);
  if (!lines.length) return "";

  return `
    <div class="app-bar__meta-list">
      ${lines
        .map((line) => `<div class="app-bar__meta">${line}</div>`)
        .join("")}
    </div>
  `;
}

export function renderAppShell({
  pageId,
  title,
  subtitle = "",
  meta = [],
  showPeriodFilter = false,
  period = "",
  periodActions = "",
  periodLabel = "Tháng đang xem",
  content = "",
  containerClass = "",
} = {}) {
  return `
    <div class="app-shell app-shell--authed" data-page="${pageId || ""}">
      <div class="app-shell__container ${containerClass || ""}">
        <header class="app-bar">
          <div class="app-bar__row">
            <div class="app-bar__title-block">
              ${subtitle ? `<div class="app-bar__eyebrow">${subtitle}</div>` : ""}
              <h1 class="app-bar__title">${title || ""}</h1>
              ${renderMetaLines(meta)}
            </div>
            <div id="profileMenuHost" class="app-bar__profile"></div>
          </div>
          <div id="primaryNavHost" class="app-bar__nav-host"></div>
        </header>
        ${
          showPeriodFilter
            ? renderGlobalPeriodBar({
                period,
                actions: periodActions,
                label: periodLabel,
              })
            : ""
        }
        <main class="app-shell__main">${content}</main>
      </div>
      <div id="mobileNavHost" class="app-shell__mobile-nav-host"></div>
      <div id="mobileNavSheetHost" class="app-shell__mobile-sheet-host"></div>
    </div>
  `;
}

export function renderAuthShell({
  title,
  subtitle = "",
  content = "",
  containerClass = "",
} = {}) {
  return `
    <div class="app-shell app-shell--auth">
      <div class="app-shell__container app-shell__container--sm ${containerClass || ""}">
        <div class="auth-shell__hero">
          <h1 class="app-bar__title">${title || ""}</h1>
          ${subtitle ? `<div class="app-bar__meta">${subtitle}</div>` : ""}
        </div>
        <div class="auth-shell__card">
          <div class="auth-shell__stack">${content}</div>
        </div>
      </div>
    </div>
  `;
}
