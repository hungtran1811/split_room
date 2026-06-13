import {
  getAuthErrorMessage,
  logout,
  resolvePendingGoogleRedirect,
  watchAuth,
} from "./services/auth.service";
import {
  initSelectedPeriod,
  setGroup,
  setMemberProfile,
  setMembers,
  setUser,
  state,
} from "./core/state";
import { normalizeMemberRole } from "./core/roles";
import { renderLoginPage } from "./ui/pages/login.page";
import { renderDashboardPage } from "./ui/pages/dashboard.page";
import { renderExpensesPage } from "./ui/pages/expenses.page";
import { renderPaymentsPage } from "./ui/pages/payments.page";
import { getRoutePath } from "./core/routing";
import { destroyAppShell } from "./ui/layout/shell-controller";
import { resetPageMountCache } from "./ui/layout/page-mount";
import { renderRentPage } from "./ui/pages/rent.page";
import { renderReportsPage } from "./ui/pages/reports.page";
import { renderAdminPage } from "./ui/pages/admin.page";
import { renderAuthScreen } from "./ui/components/authScreen";
import { unmountPrimaryNav } from "./ui/layout/navbar";
import { ensureDefaultGroup } from "./services/group.service";
import {
  getCurrentMemberProfile,
  upsertMemberProfile,
  watchGroupMembers,
  watchMyMemberProfile,
} from "./services/member.service";
import { EMAIL_TO_MEMBER_ID, resolveMemberIdFromEmail } from "./config/members.map";
import { LEGACY_OWNER_UID } from "./config/constants";

let authReady = false;
let bootLoading = true;
let bootError = null;
let redirectResolved = false;
let pendingLoginMessage = "";
let unsubMyMemberProfile = null;
let unsubGroupMembers = null;

function getRoute() {
  return getRoutePath(window.location.hash || "#/dashboard");
}

function redirectMatrixRoute() {
  const hash = window.location.hash || "";
  if (!hash.startsWith("#/matrix")) return false;

  const queryIndex = hash.indexOf("?");
  const query = queryIndex === -1 ? "" : hash.slice(queryIndex);
  const nextHash = query.includes("tab=")
    ? `#/payments${query}`
    : "#/payments?tab=matrix";
  window.location.replace(nextHash);
  return true;
}

function renderBootScreen() {
  const root = document.getElementById("app");
  if (!root) return;
  unmountPrimaryNav();

  if (bootError) {
    root.innerHTML = renderAuthScreen({
      variant: "boot",
      bootTitle: "Không thể tải dữ liệu",
      bootSubtitle: bootError,
      content: `
        <div class="auth-screen__stack">
          <div class="d-flex gap-2 justify-content-center flex-wrap">
            <button class="btn btn-primary btn-sm" id="btnRetry">Thử lại</button>
            <button class="btn btn-outline-secondary btn-sm" id="btnLogout">Đăng xuất</button>
          </div>
        </div>
      `,
    });

    root.querySelector("#btnRetry")?.addEventListener("click", async () => {
      bootError = null;
      bootLoading = true;
      renderBootScreen();

      if (state.user) {
        await afterLoginSetup(state.user);
        await render();
      }
    });

    root.querySelector("#btnLogout")?.addEventListener("click", async () => {
      await logout();
    });

    return;
  }

  if (!redirectResolved || !authReady || bootLoading) {
    root.innerHTML = renderAuthScreen({
      variant: "boot",
      bootTitle: "Đang tải...",
      bootSubtitle: "Vui lòng chờ trong giây lát",
    });
  }
}

function stopGroupSubscriptions() {
  if (unsubMyMemberProfile) {
    unsubMyMemberProfile();
    unsubMyMemberProfile = null;
  }

  if (unsubGroupMembers) {
    unsubGroupMembers();
    unsubGroupMembers = null;
  }
}

function startGroupSubscriptions(groupId, uid) {
  stopGroupSubscriptions();

  unsubMyMemberProfile = watchMyMemberProfile(groupId, uid, (profile) => {
    setMemberProfile(profile);
  });

  unsubGroupMembers = watchGroupMembers(groupId, (members) => {
    setMembers(members);
  });
}

async function ensureMemberProfile() {
  const email = state.user?.email || "";
  const memberId = resolveMemberIdFromEmail(email);

  if (!memberId) {
    throw new Error("Email chưa được gán thành viên trong nhóm.");
  }

  const currentProfile = await getCurrentMemberProfile(
    state.groupId,
    state.user.uid,
  );
  const role = normalizeMemberRole({
    ...(currentProfile || {}),
    uid: state.user.uid,
    memberId,
    role:
      state.user.uid === LEGACY_OWNER_UID
        ? "owner"
        : currentProfile?.role,
  });

  await upsertMemberProfile(state.groupId, state.user, {
    memberId,
    role,
  });

  const nextProfile = await getCurrentMemberProfile(
    state.groupId,
    state.user.uid,
  );
  setMemberProfile(
    nextProfile || {
      uid: state.user.uid,
      email,
      displayName: state.user.displayName || "",
      photoURL: state.user.photoURL || "",
      memberId,
      role,
    },
  );
}

async function afterLoginSetup(user) {
  bootLoading = true;
  bootError = null;
  renderBootScreen();

  try {
    const groupId = await ensureDefaultGroup(user);
    setGroup(groupId);

    await ensureMemberProfile();
    startGroupSubscriptions(groupId, user.uid);

    bootLoading = false;
  } catch (error) {
    console.error("Boot setup failed:", error);
    bootError = error?.message || "Unknown error";
    bootLoading = false;
    renderBootScreen();
  }
}

async function render() {
  if (!redirectResolved || !authReady) {
    renderBootScreen();
    return;
  }

  if (!state.user) {
    bootLoading = false;
    bootError = null;
    destroyAppShell();
    resetPageMountCache();

    const initialMessage = pendingLoginMessage;
    pendingLoginMessage = "";
    renderLoginPage({ initialMessage });
    return;
  }

  if (bootLoading || bootError) {
    renderBootScreen();
    return;
  }

  if (redirectMatrixRoute()) {
    return;
  }

  const route = getRoute();
  if (route.startsWith("#/expenses")) {
    await renderExpensesPage();
    return;
  }

  if (route.startsWith("#/payments")) {
    await renderPaymentsPage();
    return;
  }

  if (route.startsWith("#/rent")) {
    await renderRentPage();
    return;
  }

  if (route.startsWith("#/reports")) {
    await renderReportsPage();
    return;
  }

  if (route.startsWith("#/admin")) {
    await renderAdminPage();
    return;
  }

  renderDashboardPage();
}

async function initAuthFlow() {
  try {
    await resolvePendingGoogleRedirect();
  } catch (error) {
    pendingLoginMessage = getAuthErrorMessage(error);
  } finally {
    redirectResolved = true;
    renderBootScreen();
  }

  watchAuth(async (user) => {
    authReady = true;
    setUser(user);

    if (user) {
      await afterLoginSetup(user);
    } else {
      stopGroupSubscriptions();
      setGroup(null);
      setMembers([]);
      setMemberProfile(null);
      bootLoading = false;
      bootError = null;
    }

    await render();
  });

  window.addEventListener("hashchange", () => render());
}

function ensureOfflineBanner() {
  let banner = document.getElementById("offlineBanner");
  if (!banner) {
    banner = document.createElement("div");
    banner.id = "offlineBanner";
    banner.className = "offline-banner";
    banner.hidden = true;
    banner.textContent = "Đang offline — chỉ xem dữ liệu đã tải";
    document.body.prepend(banner);
  }

  const update = () => {
    banner.hidden = navigator.onLine;
  };

  window.addEventListener("online", update);
  window.addEventListener("offline", update);
  update();
}

function registerServiceWorker() {
  if (import.meta.env.DEV || !("serviceWorker" in navigator)) return;
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  });
}

async function clearDevServiceWorkerCache() {
  if (!import.meta.env.DEV || !("serviceWorker" in navigator)) return;

  const registrations = await navigator.serviceWorker.getRegistrations();
  await Promise.all(registrations.map((registration) => registration.unregister()));

  if ("caches" in window) {
    const keys = await caches.keys();
    await Promise.all(keys.map((key) => caches.delete(key)));
  }
}

function ensureClientMonitoring() {
  window.addEventListener("error", (event) => {
    console.error("[splitroom] client error", event.error || event.message);
  });

  window.addEventListener("unhandledrejection", (event) => {
    console.error("[splitroom] unhandled rejection", event.reason);
  });
}

export function startApp() {
  ensureClientMonitoring();
  initSelectedPeriod();
  ensureOfflineBanner();
  void clearDevServiceWorkerCache();
  registerServiceWorker();

  if (!window.location.hash || window.location.hash === "#") {
    window.location.hash = "#/dashboard";
  }

  renderBootScreen();
  void initAuthFlow();
}
