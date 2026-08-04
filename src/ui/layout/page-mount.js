import { mountPrimaryNav } from "./navbar";
import {
  bindPeriodControls,
  updatePeriodUi,
} from "./period-controls";
import { openQuickExpenseSheet } from "../components/quickExpenseSheet";
import { openQuickActionSheet } from "../components/bottomSheet";
import { mountNotificationBell } from "../components/notificationBell";
import {
  ensureAppShell,
  patchMainContent,
  setMainContent,
  updateAppShell,
} from "./shell-controller";
import { getSelectedPeriod, state } from "../../core/state";

export { patchMainContent };

let lastShellSignature = "";
let lastNavSignature = "";
let periodControlsBound = false;
let quickActionsBound = false;
let notificationUnmount = null;
let notificationKey = "";

function ensureNotificationBell() {
  const host = document.getElementById("notificationBellHost");
  const groupId = state.groupId;
  const uid = state.user?.uid;
  if (!host || !groupId || !uid) return;

  const nextKey = `${groupId}:${uid}`;
  if (notificationUnmount && notificationKey === nextKey) return;

  notificationUnmount?.();
  notificationUnmount = mountNotificationBell(host, { groupId, uid });
  notificationKey = nextKey;
}

function bindGlobalQuickActions() {
  if (quickActionsBound) return;
  quickActionsBound = true;

  document.addEventListener("click", (event) => {
    const trigger = event.target.closest(
      "#globalQuickAction, #globalQuickActionMobile",
    );
    if (!trigger) return;

    event.preventDefault();
    if (event.altKey) {
      openQuickActionSheet();
      return;
    }

    openQuickExpenseSheet();
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
  notificationUnmount?.();
  notificationUnmount = null;
  notificationKey = "";
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
  ensureNotificationBell();

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
