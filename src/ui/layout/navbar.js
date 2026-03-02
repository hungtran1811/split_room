const PRIMARY_ITEMS = [
  { id: "dashboard", label: "Dashboard", href: "#/dashboard" },
  { id: "expenses", label: "Chi tiêu", href: "#/expenses" },
  { id: "payments", label: "Thanh toán", href: "#/payments" },
  { id: "rent", label: "Tiền nhà", href: "#/rent" },
  { id: "reports", label: "Báo cáo", href: "#/reports" },
];

export function renderPrimaryNav({
  active,
  isOwner = false,
  includeLogout = false,
} = {}) {
  const items = isOwner
    ? [...PRIMARY_ITEMS, { id: "admin", label: "Quản trị", href: "#/admin" }]
    : PRIMARY_ITEMS;

  return `
    <nav class="primary-nav" aria-label="Điều hướng chính">
      <div class="primary-nav__scroller">
        ${items
          .map((item) => {
            const activeClass =
              item.id === active
                ? "btn btn-primary btn-sm primary-nav__link"
                : "btn btn-outline-secondary btn-sm primary-nav__link";

            return `<a class="${activeClass}" href="${item.href}" ${
              item.id === active ? 'aria-current="page"' : ""
            }>${item.label}</a>`;
          })
          .join("")}
        ${
          includeLogout
            ? '<span class="primary-nav__spacer"></span><button id="btnLogout" class="btn btn-outline-danger btn-sm primary-nav__logout">Đăng xuất</button>'
            : ""
        }
      </div>
    </nav>
  `;
}

export function mountPrimaryNav({
  hostId = "primaryNavHost",
  active,
  isOwner = false,
  includeLogout = false,
  onLogout = null,
} = {}) {
  const host = document.getElementById(hostId);
  if (!host) return;

  host.className = "app-shell__nav-host";
  host.innerHTML = renderPrimaryNav({ active, isOwner, includeLogout });

  if (includeLogout && typeof onLogout === "function") {
    host.querySelector("#btnLogout")?.addEventListener("click", onLogout);
  }
}
