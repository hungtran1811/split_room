import {
  getAuthErrorMessage,
  logout,
  resolvePendingGoogleRedirect,
  watchAuth,
} from "./services/auth.service";
import {
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
import { renderRentPage } from "./ui/pages/rent.page";
import { ensureDefaultGroup } from "./services/group.service";
import {
  getCurrentMemberProfile,
  upsertMemberProfile,
  watchGroupMembers,
  watchMyMemberProfile,
} from "./services/member.service";
import { EMAIL_TO_MEMBER_ID } from "./config/members.map";

let authReady = false;
let bootLoading = true;
let bootError = null;
let redirectResolved = false;
let pendingLoginMessage = "";
let unsubMyMemberProfile = null;
let unsubGroupMembers = null;

function getRoute() {
  return window.location.hash || "#/dashboard";
}

function renderBootScreen() {
  const root = document.getElementById("app");
  if (!root) return;

  if (bootError) {
    root.innerHTML = `
      <div class="container py-5">
        <div class="alert alert-danger">
          <div class="fw-semibold mb-1">Không thể tải dữ liệu</div>
          <div class="small mb-3">${bootError}</div>
          <div class="d-flex gap-2">
            <button class="btn btn-primary" id="btnRetry">Thử lại</button>
            <button class="btn btn-outline-secondary" id="btnLogout">Đăng xuất</button>
          </div>
        </div>
      </div>
    `;

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
    root.innerHTML = `
      <div class="container py-5">
        <div class="d-flex align-items-center gap-3">
          <div class="spinner-border" role="status" aria-label="Loading"></div>
          <div>
            <div class="fw-semibold">Đang tải...</div>
            <div class="text-secondary small">Vui lòng chờ trong giây lát</div>
          </div>
        </div>
      </div>
    `;
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
  const memberId = EMAIL_TO_MEMBER_ID[email];

  if (!memberId) {
    throw new Error("Email chưa được gán thành viên trong nhóm.");
  }

  const currentProfile = await getCurrentMemberProfile(
    state.groupId,
    state.user.uid,
  );
  const role = normalizeMemberRole(currentProfile || { memberId });

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

    const initialMessage = pendingLoginMessage;
    pendingLoginMessage = "";
    renderLoginPage({ initialMessage });
    return;
  }

  if (bootLoading || bootError) {
    renderBootScreen();
    return;
  }

  const route = getRoute();
  if (route.startsWith("#/expenses")) {
    await renderExpensesPage();
    return;
  }

  if (route.startsWith("#/rent")) {
    await renderRentPage();
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

export function startApp() {
  if (!window.location.hash || window.location.hash === "#") {
    window.location.hash = "#/dashboard";
  }

  renderBootScreen();
  void initAuthFlow();
}
