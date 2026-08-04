import {
  renderDesktopProfileMenu,
  renderMobileProfileButton,
  renderMobileProfileSheet,
} from "../components/profileMenu";
import { getNavIcon, renderIcon } from "../icons";

const CORE_ITEMS = [
  { id: "dashboard", label: "Tổng quan", mobileLabel: "Tổng quan", href: "#/dashboard" },
  { id: "expenses", label: "Chi tiêu", mobileLabel: "Chi", href: "#/expenses" },
  { id: "payments", label: "Cấn trừ", mobileLabel: "Cấn trừ", href: "#/payments" },
  { id: "rent", label: "Tiền nhà", mobileLabel: "Nhà", href: "#/rent" },
  { id: "reports", label: "Báo cáo", mobileLabel: "Báo cáo", href: "#/reports" },
];

const ALL_PRIMARY_ITEMS = CORE_ITEMS;

function resolvePrimary(active) {
  return ALL_PRIMARY_ITEMS.some((item) => item.id === active) ? active : null;
}

function renderDesktopNav(activePrimaryNav) {
  return `
    <nav class="primary-nav primary-nav--shell" aria-label="Điều hướng chính">
      <div class="primary-nav__tabs">
        ${ALL_PRIMARY_ITEMS.map((item) => {
          const activeClass =
            item.id === activePrimaryNav
              ? "primary-nav__item is-active"
              : "primary-nav__item";

          return `
            <a
              class="${activeClass}"
              href="${item.href}"
              ${item.id === activePrimaryNav ? 'aria-current="page"' : ""}
            >
              ${renderIcon(getNavIcon(item.id), { className: "icon icon--nav", size: 18 })}
              <span>${item.label}</span>
            </a>
          `;
        }).join("")}
      </div>
    </nav>
  `;
}

function renderBottomNav(activePrimaryNav) {
  return `
    <nav class="shell-nav" aria-label="Điều hướng nhanh">
      <div class="shell-nav__inner">
        ${CORE_ITEMS.map((item) => {
          const activeClass =
            item.id === activePrimaryNav
              ? "shell-nav__item is-active"
              : "shell-nav__item";

          return `
            <a
              class="${activeClass}"
              href="${item.href}"
              ${item.id === activePrimaryNav ? 'aria-current="page"' : ""}
            >
              ${renderIcon(getNavIcon(item.id), { className: "icon icon--nav", size: 22 })}
              <span>${item.mobileLabel || item.label}</span>
            </a>
          `;
        }).join("")}
      </div>
    </nav>
  `;
}

function closeDesktopMenus() {
  document.querySelectorAll(".profile-menu[open]").forEach((menu) => {
    menu.removeAttribute("open");
  });
}

function openProfileSheet() {
  const sheet = document.getElementById("profileSheet");
  if (!sheet) return;
  sheet.hidden = false;
  document.body.classList.add("app-sheet-open");
}

function closeProfileSheet() {
  const sheet = document.getElementById("profileSheet");
  if (!sheet) return;
  sheet.hidden = true;
  document.body.classList.remove("app-sheet-open");
}

export function unmountPrimaryNav() {
  document.getElementById("primaryNavHost")?.replaceChildren();
  document.getElementById("profileMenuHost")?.replaceChildren();
  document.getElementById("mobileNavHost")?.remove();
  document.getElementById("mobileNavSheetHost")?.remove();
  document.body.classList.remove("app-sheet-open");
}

export function mountPrimaryNav({
  active,
  activePrimaryNav,
  isOwner = false,
  includeLogout = false,
  onLogout = null,
  userLabel = "Tài khoản",
} = {}) {
  const currentActive = active || activePrimaryNav || null;
  const primaryActive = resolvePrimary(currentActive);
  const profileMenuActive = !primaryActive && !!currentActive;

  const desktopHost = document.getElementById("primaryNavHost");
  const profileHost = document.getElementById("profileMenuHost");
  let mobileHost = document.getElementById("mobileNavHost");
  let mobileSheetHost = document.getElementById("mobileNavSheetHost");

  if (!mobileHost) {
    mobileHost = document.createElement("div");
    mobileHost.id = "mobileNavHost";
    mobileHost.className = "shell__nav-host";
    const shell = document.getElementById("appShell");
    if (shell) shell.appendChild(mobileHost);
    else document.body.appendChild(mobileHost);
  }

  if (!mobileSheetHost) {
    mobileSheetHost = document.createElement("div");
    mobileSheetHost.id = "mobileNavSheetHost";
    const shell = document.getElementById("appShell");
    if (shell) shell.appendChild(mobileSheetHost);
    else document.body.appendChild(mobileSheetHost);
  }

  if (desktopHost) {
    desktopHost.innerHTML = renderDesktopNav(primaryActive);
  }

  if (profileHost) {
    profileHost.innerHTML = `
      ${renderDesktopProfileMenu({
        active: currentActive,
        isOwner,
        includeLogout,
        userLabel,
      })}
      ${renderMobileProfileButton({ active: profileMenuActive, userLabel })}
    `;
  }

  if (mobileHost) {
    mobileHost.innerHTML = renderBottomNav(primaryActive);
  }

  if (mobileSheetHost) {
    mobileSheetHost.innerHTML = renderMobileProfileSheet({
      active: currentActive,
      isOwner,
      includeLogout,
      userLabel,
    });
  }

  if (includeLogout && typeof onLogout === "function") {
    document.getElementById("btnLogoutDesktop")?.addEventListener("click", async () => {
      closeDesktopMenus();
      await onLogout();
    });
    document.getElementById("btnLogoutMobile")?.addEventListener("click", async () => {
      closeProfileSheet();
      await onLogout();
    });
  }

  document.querySelectorAll("[data-profile-menu-dismiss='desktop']").forEach((node) => {
    node.addEventListener("click", () => {
      closeDesktopMenus();
    });
  });

  document.querySelectorAll("[data-profile-menu-dismiss='mobile']").forEach((node) => {
    node.addEventListener("click", () => {
      closeProfileSheet();
    });
  });

  document.querySelectorAll("[data-profile-sheet-open='true']").forEach((node) => {
    node.addEventListener("click", () => {
      openProfileSheet();
    });
  });

  document.querySelectorAll("[data-profile-sheet-close='true']").forEach((node) => {
    node.addEventListener("click", () => {
      closeProfileSheet();
    });
  });
}
