import { watchAuth, logout } from "./services/auth.service";
import { setUser, setGroup, setMembers, state } from "./core/state";
import { renderLoginPage } from "./ui/pages/login.page";
import { renderDashboardPage } from "./ui/pages/dashboard.page";
import { renderExpensesPage } from "./ui/pages/expenses.page";

import { ensureDefaultGroup, getMembers } from "./services/group.service";
import { upsertMemberProfile } from "./services/member.service";
import { EMAIL_TO_MEMBER_ID } from "./config/members.map";
import { isAdmin } from "./core/roles";

let authReady = false;

function getRoute() {
  return window.location.hash || "#/dashboard";
}

function renderLoadingScreen() {
  // Loading đơn giản kiểu “ht”: có thể chỉnh UI sau
  const root = document.getElementById("app");
  if (!root) return;

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

async function ensureMemberProfile() {
  const email = state.user?.email || "";
  const memberId = EMAIL_TO_MEMBER_ID[email];

  if (!memberId) {
    // Email không map => không cho vào group
    throw new Error("Email chưa được gán thành viên trong nhóm.");
  }

  await upsertMemberProfile(state.groupId, state.user, {
    memberId,
    role: isAdmin(state.user) ? "admin" : "member",
  });
}

async function afterLoginSetup(user) {
  try {
    // 1) đảm bảo có group
    const groupId = await ensureDefaultGroup(user);
    setGroup(groupId);

    // 2) tạo/đồng bộ member profile (PHẢI nằm sau setGroup)
    await ensureMemberProfile();

    // 3) load members
    const members = await getMembers(groupId);
    setMembers(members);
  } catch (e) {
    alert(e?.message || "Cannot join group.");
    await logout();
  }
}

async function render() {
  // ✅ Chặn render route khi auth chưa sẵn sàng
  if (!authReady) {
    renderLoadingScreen();
    return;
  }

  // authReady rồi mà chưa login
  if (!state.user) {
    renderLoginPage({ onDone: () => render() });
    return;
  }

  const route = getRoute();
  if (route.startsWith("#/expenses")) {
    await renderExpensesPage();
  } else {
    renderDashboardPage();
  }
}

export function startApp() {
  watchAuth(async (user) => {
    authReady = true; // ✅ auth đã trả kết quả lần đầu

    setUser(user);

    if (user) {
      await afterLoginSetup(user);
    } else {
      setGroup(null);
      setMembers([]);
    }

    await render();
  });

  window.addEventListener("hashchange", () => render());

  // ✅ Lúc mới load app: luôn render loading trước
  renderLoadingScreen();
}
