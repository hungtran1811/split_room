// src/ui/components/toast.js
export function ensureToastHost() {
  if (document.getElementById("toastHost")) return;

  const host = document.createElement("div");
  host.id = "toastHost";
  host.className = "toast-container position-fixed top-0 end-0 p-3";
  host.style.zIndex = "1080";
  document.body.appendChild(host);
}

export function showToast({
  title = "Thông báo",
  message = "",
  variant = "success",
}) {
  ensureToastHost();

  const id = `t_${Date.now()}_${Math.random().toString(16).slice(2)}`;
  const el = document.createElement("div");
  el.className = `toast align-items-center text-bg-${variant} border-0`;
  el.id = id;
  el.role = "alert";
  el.ariaLive = "assertive";
  el.ariaAtomic = "true";
  el.innerHTML = `
    <div class="d-flex">
      <div class="toast-body">
        <div class="fw-semibold">${escapeHtml(title)}</div>
        <div class="small">${escapeHtml(message)}</div>
      </div>
      <button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast" aria-label="Close"></button>
    </div>
  `;

  document.getElementById("toastHost").appendChild(el);
  // bootstrap Toast global
  const toast = new window.bootstrap.Toast(el, { delay: 2200 });
  toast.show();

  el.addEventListener("hidden.bs.toast", () => el.remove());
}

function escapeHtml(str) {
  return String(str ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
