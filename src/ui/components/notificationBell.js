import { markNotificationRead, watchMyNotifications } from "../../services/notification.service";
import { renderIcon } from "../icons";

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function formatNotifyTime(value) {
  if (!value) return "";
  const date =
    typeof value.toDate === "function" ? value.toDate() : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function isUnread(item) {
  return !item?.readAt;
}

function renderPanel(items = []) {
  if (!items.length) {
    return `
      <div class="notify-bell__empty empty-state empty-state--compact">
        <div class="empty-state__title">Chưa có thông báo</div>
        <div class="empty-state__text">Khi tháng được chốt, nhắc nợ sẽ hiện ở đây.</div>
      </div>
    `;
  }

  return `
    <ul class="notify-bell__list" role="list">
      ${items
        .map((item) => {
          const unread = isUnread(item);
          return `
            <li>
              <button
                type="button"
                class="notify-bell__item ${unread ? "is-unread" : ""}"
                data-notify-id="${escapeHtml(item.id)}"
              >
                <div class="notify-bell__item-top">
                  <span class="notify-bell__item-title">${escapeHtml(item.title || "Thông báo")}</span>
                  ${unread ? `<span class="notify-bell__dot" aria-hidden="true"></span>` : ""}
                </div>
                <div class="notify-bell__item-body">${escapeHtml(item.body || item.message || "")}</div>
                <div class="notify-bell__item-meta">${escapeHtml(formatNotifyTime(item.createdAt))}</div>
              </button>
            </li>
          `;
        })
        .join("")}
    </ul>
  `;
}

function renderMarkup(unreadCount = 0) {
  const badge =
    unreadCount > 0
      ? `<span class="notify-bell__badge" aria-label="${unreadCount} chưa đọc">${unreadCount > 9 ? "9+" : unreadCount}</span>`
      : "";

  return `
    <div class="notify-bell" id="notifyBellRoot">
      <button
        type="button"
        class="notify-bell__trigger"
        id="notifyBellTrigger"
        aria-expanded="false"
        aria-controls="notifyBellPanel"
        aria-label="Thông báo"
      >
        ${renderIcon("bell", { className: "icon", size: 18 })}
        ${badge}
      </button>
      <div class="notify-bell__panel" id="notifyBellPanel" hidden role="region" aria-label="Danh sách thông báo">
        <div class="notify-bell__head">
          <strong>Thông báo</strong>
        </div>
        <div class="notify-bell__body" id="notifyBellBody">
          ${renderPanel([])}
        </div>
      </div>
    </div>
  `;
}

export function mountNotificationBell(host, { groupId, uid } = {}) {
  if (!host) return () => {};

  let items = [];
  let open = false;
  let disposed = false;

  host.innerHTML = renderMarkup(0);

  const root = host.querySelector("#notifyBellRoot");
  const trigger = host.querySelector("#notifyBellTrigger");
  const panel = host.querySelector("#notifyBellPanel");
  const body = host.querySelector("#notifyBellBody");

  function unreadCount() {
    return items.filter(isUnread).length;
  }

  function syncTrigger() {
    if (!trigger) return;
    const count = unreadCount();
    const badgeHtml =
      count > 0
        ? `<span class="notify-bell__badge" aria-label="${count} chưa đọc">${count > 9 ? "9+" : count}</span>`
        : "";
    trigger.innerHTML = `${renderIcon("bell", { className: "icon", size: 18 })}${badgeHtml}`;
    trigger.setAttribute("aria-expanded", open ? "true" : "false");
  }

  function syncPanel() {
    if (body) body.innerHTML = renderPanel(items);
    if (panel) panel.hidden = !open;
    syncTrigger();
  }

  function setOpen(next) {
    open = next;
    syncPanel();
  }

  function onTriggerClick(event) {
    event.preventDefault();
    event.stopPropagation();
    setOpen(!open);
  }

  async function onPanelClick(event) {
    const button = event.target.closest("[data-notify-id]");
    if (!button) return;

    const id = button.getAttribute("data-notify-id");
    const target = items.find((item) => item.id === id);
    if (!target || !isUnread(target)) return;

    try {
      await markNotificationRead(groupId, id);
      items = items.map((item) =>
        item.id === id ? { ...item, readAt: new Date() } : item,
      );
      syncPanel();
    } catch (error) {
      console.warn("[splitroom] markNotificationRead failed", error);
    }
  }

  function onDocumentClick(event) {
    if (!open || !root) return;
    if (root.contains(event.target)) return;
    setOpen(false);
  }

  function onKeyDown(event) {
    if (event.key === "Escape" && open) setOpen(false);
  }

  trigger?.addEventListener("click", onTriggerClick);
  panel?.addEventListener("click", onPanelClick);
  document.addEventListener("click", onDocumentClick);
  document.addEventListener("keydown", onKeyDown);

  const unsubscribe = watchMyNotifications(groupId, uid, (nextItems) => {
    if (disposed) return;
    items = Array.isArray(nextItems) ? nextItems : [];
    syncPanel();
  });

  return () => {
    disposed = true;
    unsubscribe?.();
    trigger?.removeEventListener("click", onTriggerClick);
    panel?.removeEventListener("click", onPanelClick);
    document.removeEventListener("click", onDocumentClick);
    document.removeEventListener("keydown", onKeyDown);
    host.replaceChildren();
  };
}

export function unmountNotificationBell(host) {
  host?.replaceChildren();
}
