// src/ui/components/confirmModal.js

export function ensureConfirmModal() {
  if (document.getElementById("confirmModal")) return;

  const wrap = document.createElement("div");
  wrap.innerHTML = `
  <div class="modal fade" id="confirmModal" tabindex="-1" aria-hidden="true">
    <div class="modal-dialog modal-dialog-centered">
      <div class="modal-content">
        <div class="modal-header">
          <h5 class="modal-title" id="confirmTitle">Xác nhận</h5>
          <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
        </div>

        <div class="modal-body">
          <div id="confirmMessage" class="mb-2"></div>
          <div id="confirmMeta" class="small text-secondary"></div>
          <div id="confirmErr" class="small text-danger mt-2" style="min-height: 18px;"></div>
        </div>

        <div class="modal-footer">
          <button type="button" class="btn btn-outline-secondary" data-bs-dismiss="modal">Hủy</button>
          <button type="button" class="btn btn-danger" id="confirmOk">Xóa</button>
        </div>
      </div>
    </div>
  </div>
  `;
  document.body.appendChild(wrap.firstElementChild);
}

/**
 * options:
 * - title: string
 * - message: string (main)
 * - meta: string (small text)
 * - okText: string
 * - danger: boolean (true -> nút đỏ)
 * - onConfirm: async () => void
 */
export function openConfirmModal({
  title = "Xác nhận",
  message = "Bạn chắc chắn chứ?",
  meta = "",
  okText = "Xóa",
  danger = true,
  onConfirm,
}) {
  ensureConfirmModal();

  const modalEl = document.getElementById("confirmModal");
  const titleEl = document.getElementById("confirmTitle");
  const msgEl = document.getElementById("confirmMessage");
  const metaEl = document.getElementById("confirmMeta");
  const errEl = document.getElementById("confirmErr");
  const okBtn = document.getElementById("confirmOk");

  titleEl.textContent = title;
  msgEl.textContent = message;
  metaEl.textContent = meta;
  errEl.textContent = "";

  okBtn.textContent = okText;
  okBtn.className = danger ? "btn btn-danger" : "btn btn-primary";
  okBtn.disabled = false;

  const modal = new window.bootstrap.Modal(modalEl);
  modal.show();

  okBtn.onclick = async () => {
    errEl.textContent = "";
    okBtn.disabled = true;
    try {
      await onConfirm?.();
      modal.hide();
    } catch (e) {
      errEl.textContent = e?.message || "Thao tác thất bại.";
    } finally {
      okBtn.disabled = false;
    }
  };
}
