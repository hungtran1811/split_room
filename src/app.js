import {
  watchAuth,
  logout,
  resolvePendingGoogleRedirect,
  getAuthErrorMessage,
} from "./services/auth.service";
import { setUser, setGroup, setMembers, state } from "./core/state";
import { renderLoginPage } from "./ui/pages/login.page";
import { renderDashboardPage } from "./ui/pages/dashboard.page";
import { renderExpensesPage } from "./ui/pages/expenses.page";
import { renderRentPage } from "./ui/pages/rent.page";
import { ensureDefaultGroup, getMembers } from "./services/group.service";
import { upsertMemberProfile } from "./services/member.service";
import { EMAIL_TO_MEMBER_ID } from "./config/members.map";
import { isAdmin } from "./core/roles";

let authReady = false;
let bootLoading = true;
let bootError = null;
let redirectResolved = false;
let pendingLoginMessage = "";

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

async function ensureMemberProfile() {
  const email = state.user?.email || "";
  const memberId = EMAIL_TO_MEMBER_ID[email];

  if (!memberId) {
    throw new Error("Email chưa được gán thành viên trong nhóm.");
  }

  await upsertMemberProfile(state.groupId, state.user, {
    memberId,
    role: isAdmin(state.user) ? "admin" : "member",
  });
}

async function afterLoginSetup(user) {
  bootLoading = true;
  bootError = null;
  renderBootScreen();

  try {
    const groupId = await ensureDefaultGroup(user);
    setGroup(groupId);

    await ensureMemberProfile();

    const members = await getMembers(groupId);
    setMembers(members);

    bootLoading = false;
  } catch (e) {
    console.error("Boot setup failed:", e);
    bootError = e?.message || "Unknown error";
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
  } else if (route.startsWith("#/rent")) {
    await renderRentPage();
  } else {
    renderDashboardPage();
  }
}

async function initAuthFlow() {
  try {
    await resolvePendingGoogleRedirect();
  } catch (e) {
    pendingLoginMessage = getAuthErrorMessage(e);
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
      setGroup(null);
      setMembers([]);
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
