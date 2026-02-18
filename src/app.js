import { watchAuth, logout } from "./services/auth.service";
import { setUser, setGroup, setMembers, state } from "./core/state";
import { renderLoginPage } from "./ui/pages/login.page";
import { renderDashboardPage } from "./ui/pages/dashboard.page";
import { renderExpensesPage } from "./ui/pages/expenses.page";

import { ensureDefaultGroup, getMembers } from "./services/group.service";

// Nếu bạn vẫn dùng mapping email -> memberId
import { upsertMemberProfile } from "./services/member.service";
import { EMAIL_TO_MEMBER_ID } from "./config/members.map";
import { isAdmin } from "./core/roles";
import { renderRentPage } from "./ui/pages/rent.page";

// ===============================
// APP BOOT STATE
// ===============================
let authReady = false; // Firebase đã trả auth state lần đầu chưa?
let bootLoading = true; // Đang load group/members?
let bootError = null; // Lỗi boot (nếu có)

function getRoute() {
  return window.location.hash || "#/dashboard";
}

// ===============================
// LOADING / ERROR SCREEN (HT STYLE)
// ===============================
function renderBootScreen() {
  const root = document.getElementById("app");
  if (!root) return;

  // ERROR UI
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
      // re-run setup if still logged in
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

  // LOADING UI
  if (!authReady || bootLoading) {
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

// ===============================
// MEMBER PROFILE (OPTIONAL)
// ===============================
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

// ===============================
// AFTER LOGIN BOOT
// ===============================
async function afterLoginSetup(user) {
  bootLoading = true;
  bootError = null;
  renderBootScreen();

  try {
    // 1) đảm bảo có group
    const groupId = await ensureDefaultGroup(user);
    setGroup(groupId);

    // 2) (optional) đồng bộ member profile
    await ensureMemberProfile();

    // 3) load members
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

// ===============================
// ROUTER RENDER
// ===============================
async function render() {
  // Auth chưa sẵn sàng -> chỉ show loading
  if (!authReady) {
    renderBootScreen();
    return;
  }

  // Chưa login -> login page
  if (!state.user) {
    bootLoading = false;
    bootError = null;
    renderLoginPage({ onDone: () => render() });
    return;
  }

  // Đang load group/members -> show loading
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

// ===============================
// APP START
// ===============================
export function startApp() {
  if (!window.location.hash || window.location.hash === "#") {
    window.location.hash = "#/dashboard";
  }
  // 1) Vừa vào app luôn render loading trước (giống ht)
  renderBootScreen();

  // 2) Auth listener
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

  // 3) Router
  window.addEventListener("hashchange", () => render());
}
