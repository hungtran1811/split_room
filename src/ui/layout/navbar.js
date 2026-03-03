import {
  renderDesktopProfileMenu,
  renderMobileProfileButton,
  renderMobileProfileSheet,
} from "../components/profileMenu";

const CORE_ITEMS = [
  { id: "dashboard", label: "Dashboard", href: "#/dashboard" },
  { id: "expenses", label: "Chi tiêu", href: "#/expenses" },
  { id: "payments", label: "Thanh toán", href: "#/payments" },
  { id: "rent", label: "Tiền nhà", href: "#/rent" },
];

function resolvePrimary(active) {
  return CORE_ITEMS.some((item) => item.id === active) ? active : null;
}

function renderDesktopNav(activePrimaryNav) {
  return `
    <nav class="primary-nav" aria-label="Điều hướng chính">
      <div class="primary-nav__tabs">
        ${CORE_ITEMS.map((item) => {
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
              ${item.label}
            </a>
          `;
        }).join("")}
      </div>
    </nav>
  `;
}

function renderBottomNav(activePrimaryNav) {
  return `
    <nav class="app-mobile-nav" aria-label="Điều hướng nhanh">
      <div class="app-mobile-nav__inner">
        ${CORE_ITEMS.map((item) => {
          const activeClass =
            item.id === activePrimaryNav
              ? "app-mobile-nav__link is-active"
              : "app-mobile-nav__link";

          return `
            <a
              class="${activeClass}"
              href="${item.href}"
              ${item.id === activePrimaryNav ? 'aria-current="page"' : ""}
            >
              <span>${item.label}</span>
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
    mobileHost.className = "app-shell__mobile-nav-host";
    document.body.appendChild(mobileHost);
  }

  if (!mobileSheetHost) {
    mobileSheetHost = document.createElement("div");
    mobileSheetHost.id = "mobileNavSheetHost";
    mobileSheetHost.className = "app-shell__mobile-sheet-host";
    document.body.appendChild(mobileSheetHost);
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
      ${renderMobileProfileButton({ active: profileMenuActive })}
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
