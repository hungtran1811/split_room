import { mountPrimaryNav } from "./navbar";
import {
  bindPeriodControls,
  updatePeriodUi,
} from "../controllers/period.controller";
import { openQuickActionSheet } from "../components/bottomSheet";
import {
  ensureAppShell,
  patchMainContent,
  setMainContent,
  updateAppShell,
} from "./shell-controller";
import { getSelectedPeriod } from "../../core/state";

export { patchMainContent };

let lastShellSignature = "";
let lastNavSignature = "";
let periodControlsBound = false;
let quickActionsBound = false;

function bindGlobalQuickActions() {
  if (quickActionsBound) return;
  quickActionsBound = true;

  document.addEventListener("click", (event) => {
    const trigger = event.target.closest(
      "#globalQuickAction, #globalQuickActionMobile",
    );
    if (!trigger) return;

    event.preventDefault();
    openQuickActionSheet();
  });
}

function buildShellSignature({
  pageId,
  title,
  subtitle,
  meta,
  showPeriodFilter,
  period,
  periodLabel,
  containerClass,
  periodLocked,
}) {
  return JSON.stringify({
    pageId,
    title,
    subtitle,
    meta,
    showPeriodFilter,
    period,
    periodLabel,
    containerClass,
    periodLocked,
  });
}

function buildNavSignature(nav = {}) {
  return JSON.stringify({
    active: nav.active,
    isOwner: nav.isOwner,
    includeLogout: nav.includeLogout,
    userLabel: nav.userLabel,
  });
}

export function resetPageMountCache() {
  lastShellSignature = "";
  lastNavSignature = "";
  periodControlsBound = false;
  quickActionsBound = false;
}

export function mountAuthenticatedPage({
  pageId,
  title,
  subtitle = "",
  meta = [],
  showPeriodFilter = true,
  period = "",
  periodLabel = "Tháng",
  content = "",
  containerClass = "",
  nav = {},
  onPeriodChange,
  periodLocked = false,
} = {}) {
  ensureAppShell();
  bindGlobalQuickActions();

  const activePeriod = period || getSelectedPeriod();

  const shellSignature = buildShellSignature({
    pageId,
    title,
    subtitle,
    meta,
    showPeriodFilter,
    period: activePeriod,
    periodLabel,
    containerClass,
    periodLocked,
  });

  if (shellSignature !== lastShellSignature) {
    updateAppShell({
      pageId,
      showPeriodFilter,
      period: activePeriod,
      containerClass,
      periodLocked,
    });
    lastShellSignature = shellSignature;
    periodControlsBound = false;
  } else if (showPeriodFilter) {
    updatePeriodUi(activePeriod);
  }

  const navSignature = buildNavSignature(nav);
  if (navSignature !== lastNavSignature) {
    mountPrimaryNav(nav);
    lastNavSignature = navSignature;
  }

  if (showPeriodFilter && !periodControlsBound) {
    bindPeriodControls({ onChange: onPeriodChange });
    periodControlsBound = true;
  }

  setMainContent(content);
}
