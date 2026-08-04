import { getNavIcon, renderIcon } from "../icons";

const QUICK_ACTIONS = [
  {
    href: "#/expenses",
    icon: "receipt",
    title: "Chi tiêu",
    subtitle: "Ghi khoản chi mới",
    tone: "primary",
  },
  {
    href: "#/payments?tab=suggest",
    icon: "swap",
    title: "Cấn trừ",
    subtitle: "Ghi thanh toán giữa thành viên",
    tone: "accent",
  },
  {
    href: "#/rent",
    icon: "building",
    title: "Tiền nhà",
    subtitle: "Cập nhật tiền nhà tháng này",
    tone: "neutral",
  },
];

function renderQuickActionItems() {
  return QUICK_ACTIONS.map(
    (action) => `
      <a
        class="quick-actions__item quick-actions__item--${action.tone}"
        href="${action.href}"
        data-sheet-action="true"
      >
        <span class="quick-actions__icon" aria-hidden="true">
          ${renderIcon(action.icon, { className: "icon", size: 20 })}
        </span>
        <span class="quick-actions__copy">
          <strong class="quick-actions__title">${action.title}</strong>
          <span class="quick-actions__subtitle">${action.subtitle}</span>
        </span>
        <span class="quick-actions__chevron" aria-hidden="true">›</span>
      </a>
    `,
  ).join("");
}

export function openBottomSheet({
  title = "",
  content = "",
  onClose = null,
  variant = "sheet",
} = {}) {
  const existing = document.getElementById("globalBottomSheet");
  existing?.remove();

  const overlay = document.createElement("div");
  overlay.className = `bottom-sheet bottom-sheet--${variant}`;
  overlay.id = "globalBottomSheet";
  overlay.innerHTML = `
    <button type="button" class="bottom-sheet__backdrop" data-sheet-close="true" aria-label="Đóng"></button>
    <div class="bottom-sheet__panel" role="dialog" aria-modal="true" aria-labelledby="globalBottomSheetTitle">
      <div class="bottom-sheet__handle" aria-hidden="true"></div>
      <div class="bottom-sheet__header">
        <h2 class="bottom-sheet__title" id="globalBottomSheetTitle">${title}</h2>
        <button type="button" class="bottom-sheet__close" data-sheet-close="true" aria-label="Đóng">×</button>
      </div>
      <div class="bottom-sheet__body">${content}</div>
    </div>
  `;

  const close = () => {
    overlay.remove();
    document.body.classList.remove("app-sheet-open");
    if (typeof onClose === "function") onClose();
  };

  overlay.querySelectorAll("[data-sheet-close='true']").forEach((node) => {
    node.addEventListener("click", close);
  });

  overlay.querySelectorAll("[data-sheet-action='true']").forEach((node) => {
    node.addEventListener("click", close);
  });

  document.body.appendChild(overlay);
  document.body.classList.add("app-sheet-open");

  requestAnimationFrame(() => {
    overlay.classList.add("is-open");
  });

  return { close, root: overlay };
}

export function openQuickActionSheet() {
  return openBottomSheet({
    title: "Thêm nhanh",
    variant: "quick",
    content: `<div class="quick-actions">${renderQuickActionItems()}</div>`,
  });
}
