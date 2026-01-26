import { watchAuth } from "./services/auth.service";
import { setUser, setGroup, setMembers, state } from "./core/state";
import { renderLoginPage } from "./ui/pages/login.page";
import { renderDashboardPage } from "./ui/pages/dashboard.page";
import { ensureDefaultGroup, getMembers } from "./services/group.service";
import { logout } from "./services/auth.service";
import { renderExpensesPage } from "./ui/pages/expenses.page";
import { upsertMemberProfile } from "./services/member.service";
import { EMAIL_TO_MEMBER_ID } from "./config/members.map";
import { isAdmin } from "./core/roles";

async function ensureMemberProfile() {
  const email = state.user?.email || "";
  const memberId = EMAIL_TO_MEMBER_ID[email];

  if (!memberId) {
    // Email không map => rules sẽ chặn đọc group (đúng theo thiết kế)
    throw new Error("Email chưa được gán thành viên trong nhóm.");
  }

  await upsertMemberProfile(state.groupId, state.user, {
    memberId,
    role: isAdmin(state.user) ? "admin" : "member",
  });
}

await ensureMemberProfile();

async function afterLoginSetup(user) {
  try {
    const groupId = await ensureDefaultGroup(user);
    setGroup(groupId);

    const members = await getMembers(groupId);
    setMembers(members);
  } catch (e) {
    alert(e?.message || "Cannot join group.");
    await logout();
  }
}

function getRoute() {
  const h = window.location.hash || "#/dashboard";
  return h;
}

async function render() {
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
    setUser(user);

    if (user) {
      try {
        await afterLoginSetup(user);
      } catch (e) {
        console.error("Setup error:", e);
      }
    } else {
      setGroup(null);
      setMembers([]);
    }

    await render();
  });

  window.addEventListener("hashchange", () => render());
  render();
}
