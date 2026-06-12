import { renderCompactPeriodNav } from "../components/filterBar";
import { renderIcon } from "../icons";

let shellMounted = false;
let periodLocked = false;

function renderPersistentShellMarkup() {
  return `
    <div class="shell" id="appShell" data-page="">
      <div class="shell__container" id="appShellContainer">
        <header class="shell__header">
          <a class="shell__brand" href="#/dashboard" aria-label="Split Room">SR</a>
          <div id="appPeriodHost" class="shell__period"></div>
          <div class="shell__actions">
            <button
              type="button"
              class="shell__quick"
              id="globalQuickAction"
              aria-label="Thêm nhanh"
            >
              ${renderIcon("plus", { className: "icon", size: 18 })}
            </button>
            <div id="profileMenuHost"></div>
          </div>
        </header>
        <div id="primaryNavHost" class="shell__desktop-nav"></div>
        <main class="shell__main" id="app-main"></main>
      </div>
      <div id="mobileNavHost" class="shell__nav-host"></div>
      <div id="mobileNavSheetHost"></div>
      <button type="button" class="shell__fab" id="globalQuickActionMobile" aria-label="Thêm nhanh">
        ${renderIcon("plus", { className: "icon", size: 24 })}
      </button>
    </div>
  `;
}

export function isAppShellMounted() {
  return shellMounted && !!document.getElementById("app-main");
}

export function mountAppShell() {
  const root = document.getElementById("app");
  if (!root) return;

  if (!isAppShellMounted()) {
    root.innerHTML = renderPersistentShellMarkup();
    shellMounted = true;
  }
}

export function destroyAppShell() {
  shellMounted = false;
  document.getElementById("globalBottomSheet")?.remove();
  document.body.classList.remove("app-sheet-open");
}

export function ensureAppShell() {
  if (!isAppShellMounted()) {
    mountAppShell();
  }
}

export function updateAppShell({
  pageId = "",
  showPeriodFilter = false,
  period = "",
  containerClass = "",
  periodLocked: locked = periodLocked,
} = {}) {
  ensureAppShell();

  const shell = document.getElementById("appShell");
  const container = document.getElementById("appShellContainer");
  const periodHost = document.getElementById("appPeriodHost");

  if (shell) {
    shell.dataset.page = pageId || "";
  }

  if (container) {
    container.className = `shell__container ${containerClass || ""}`.trim();
  }

  if (periodHost) {
    periodHost.innerHTML = showPeriodFilter
      ? renderCompactPeriodNav({ period, locked })
      : "";
  }
}

export function setMainContent(html = "") {
  ensureAppShell();
  const main = document.getElementById("app-main");
  if (main) {
    main.innerHTML = html;
  }
}

export function patchMainContent(selector, html = "") {
  ensureAppShell();
  const main = document.getElementById("app-main");
  if (!main) return false;

  const target = main.querySelector(selector);
  if (!target) return false;

  target.innerHTML = html;
  return true;
}

export function getMainElement() {
  return document.getElementById("app-main");
}

export function getAppRoot() {
  return document.getElementById("appShell") || document.getElementById("app");
}
