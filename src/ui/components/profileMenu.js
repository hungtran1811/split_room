function getProfileItems({ isOwner = false, includeLogout = false } = {}) {
  const items = [{ id: "reports", label: "Báo cáo", href: "#/reports" }];

  if (isOwner) {
    items.push({ id: "admin", label: "Quản trị", href: "#/admin" });
  }

  if (includeLogout) {
    items.push({ id: "logout", label: "Đăng xuất", action: true });
  }

  return items;
}

function isItemActive(itemId, active) {
  return active === itemId;
}

export function renderDesktopProfileMenu({
  active,
  isOwner = false,
  includeLogout = false,
  userLabel = "Tài khoản",
} = {}) {
  const items = getProfileItems({ isOwner, includeLogout });
  const activeMenu = items.some((item) => isItemActive(item.id, active));

  return `
    <details class="profile-menu profile-menu--desktop ${activeMenu ? "is-active" : ""}">
      <summary class="profile-menu__trigger" aria-label="Mở hồ sơ của ${userLabel}">
        <span class="profile-menu__name">${userLabel}</span>
        <span class="profile-menu__caret" aria-hidden="true">▾</span>
      </summary>
      <div class="profile-menu__panel">
        ${items
          .map((item) => {
            if (item.action) {
              return `
                <button
                  type="button"
                  class="profile-menu__item profile-menu__item--danger"
                  id="btnLogoutDesktop"
                >
                  ${item.label}
                </button>
              `;
            }

            return `
              <a
                class="profile-menu__item ${isItemActive(item.id, active) ? "is-active" : ""}"
                href="${item.href}"
                data-profile-menu-dismiss="desktop"
                ${isItemActive(item.id, active) ? 'aria-current="page"' : ""}
              >
                ${item.label}
              </a>
            `;
          })
          .join("")}
      </div>
    </details>
  `;
}

export function renderMobileProfileButton({ active = false } = {}) {
  return `
    <button
      type="button"
      class="profile-button profile-button--mobile ${active ? "is-active" : ""}"
      data-profile-sheet-open="true"
      aria-label="Mở hồ sơ"
    >
      Hồ sơ
    </button>
  `;
}

export function renderMobileProfileSheet({
  active,
  isOwner = false,
  includeLogout = false,
  userLabel = "Tài khoản",
} = {}) {
  const items = getProfileItems({ isOwner, includeLogout });

  return `
    <div class="profile-sheet" id="profileSheet" hidden>
      <button class="profile-sheet__backdrop" type="button" data-profile-sheet-close="true" aria-label="Đóng"></button>
      <div class="profile-sheet__panel" role="dialog" aria-modal="true" aria-labelledby="profileSheetTitle">
        <div class="profile-sheet__header">
          <div>
            <div class="profile-sheet__eyebrow">Tài khoản</div>
            <div class="profile-sheet__title" id="profileSheetTitle">${userLabel}</div>
          </div>
          <button type="button" class="profile-sheet__close" data-profile-sheet-close="true" aria-label="Đóng">
            Đóng
          </button>
        </div>
        <div class="profile-sheet__list">
          ${items
            .map((item) => {
              if (item.action) {
                return `
                  <button
                    type="button"
                    class="profile-sheet__item profile-sheet__item--danger"
                    id="btnLogoutMobile"
                  >
                    ${item.label}
                  </button>
                `;
              }

              return `
                <a
                  class="profile-sheet__item ${isItemActive(item.id, active) ? "is-active" : ""}"
                  href="${item.href}"
                  data-profile-menu-dismiss="mobile"
                  ${isItemActive(item.id, active) ? 'aria-current="page"' : ""}
                >
                  ${item.label}
                </a>
              `;
            })
            .join("")}
        </div>
      </div>
    </div>
  `;
}
