// src/ui/components/paymentModal.js
import { formatVND } from "../../config/i18n";

export function ensurePaymentModal() {
  if (document.getElementById("payModal")) return;

  const wrap = document.createElement("div");
  wrap.innerHTML = `
  <div class="modal fade" id="payModal" tabindex="-1" aria-hidden="true">
    <div class="modal-dialog modal-dialog-centered">
      <div class="modal-content">
        <div class="modal-header">
          <h5 class="modal-title">Ghi nhận thanh toán</h5>
          <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
        </div>

        <div class="modal-body">
          <div class="mb-2 small text-secondary" id="payModalHint"></div>

          <div class="mb-3">
            <label class="form-label">Người trả</label>
            <input id="payFrom" class="form-control" disabled />
          </div>

          <div class="mb-3">
            <label class="form-label">Người nhận</label>
            <input id="payTo" class="form-control" disabled />
          </div>

          <div class="mb-3">
            <label class="form-label">Số tiền</label>
            <input id="payAmount" class="form-control" />
            <div class="form-text" id="payAmountHelp">Có thể nhập số lẻ (VD: 10.000,5)</div>
          </div>

          <div class="mb-2">
            <label class="form-label">Ghi chú</label>
            <input id="payNote" class="form-control" placeholder="VD: Trả tiền ăn tháng 1" />
          </div>

          <div id="payErr" class="small text-danger mt-2" style="min-height: 18px;"></div>
        </div>

        <div class="modal-footer">
          <button type="button" class="btn btn-outline-secondary" data-bs-dismiss="modal">Hủy</button>
          <button type="button" class="btn btn-primary" id="paySubmit">Xác nhận</button>
        </div>
      </div>
    </div>
  </div>
  `;
  document.body.appendChild(wrap.firstElementChild);
}

/**
 * options:
 * - lockAmount: true => khóa ô số tiền (Trả đủ)
 * - maxAmount: number => giới hạn không vượt (Trả một phần)
 * - defaultNote: string
 * - title: string
 */
export function openPaymentModal({
  fromName,
  toName,
  amount,
  onSubmit,
  parseVndInput,
  lockAmount = false,
  maxAmount = null,
  defaultNote = "",
  title = "Ghi nhận thanh toán",
}) {
  ensurePaymentModal();

  const modalEl = document.getElementById("payModal");
  const titleEl = modalEl.querySelector(".modal-title");

  const hint = document.getElementById("payModalHint");
  const fromEl = document.getElementById("payFrom");
  const toEl = document.getElementById("payTo");
  const amountEl = document.getElementById("payAmount");
  const amountHelp = document.getElementById("payAmountHelp");
  const noteEl = document.getElementById("payNote");
  const errEl = document.getElementById("payErr");
  const btn = document.getElementById("paySubmit");

  titleEl.textContent = title;

  // Hint
  if (lockAmount) {
    hint.textContent = `Trả đủ theo cấn trừ: ${formatVND(amount)} (không chỉnh sửa).`;
  } else if (typeof maxAmount === "number") {
    hint.textContent = `Tối đa theo cấn trừ: ${formatVND(maxAmount)}.`;
  } else {
    hint.textContent = `Gợi ý: Số tiền đang nợ theo cấn trừ là ${formatVND(amount)}.`;
  }

  fromEl.value = fromName;
  toEl.value = toName;

  amountEl.disabled = !!lockAmount;
  amountEl.value = String(amount);

  amountHelp.textContent = lockAmount
    ? "Số tiền đã bị khóa theo cấn trừ."
    : "Có thể nhập số lẻ (VD: 10.000,5)";

  noteEl.value = defaultNote || "";
  errEl.textContent = "";

  const modal = new window.bootstrap.Modal(modalEl);
  modal.show();

  // submit helper (Enter cũng submit)
  const trySubmit = async () => {
    errEl.textContent = "";
    btn.disabled = true;

    try {
      const amt = parseVndInput(amountEl.value);
      if (!amt || amt <= 0) throw new Error("Số tiền không hợp lệ.");

      if (lockAmount) {
        // Trả đủ: bắt buộc đúng số tiền settle (tolerance nhỏ cho số lẻ)
        if (Math.abs(amt - amount) > 0.0001) {
          throw new Error("Trả đủ phải đúng số tiền theo cấn trừ.");
        }
      } else if (typeof maxAmount === "number") {
        if (amt - maxAmount > 0.0001) {
          throw new Error("Không được vượt quá số tiền đang nợ theo cấn trừ.");
        }
      }

      const note = noteEl.value.trim();
      await onSubmit({ amount: amt, note });

      modal.hide();
    } catch (e) {
      errEl.textContent = e?.message || "Thao tác thất bại.";
    } finally {
      btn.disabled = false;
    }
  };

  btn.onclick = trySubmit;

  // Enter submit
  const onKeyDown = (ev) => {
    if (ev.key === "Enter") {
      ev.preventDefault();
      trySubmit();
    }
  };
  amountEl.onkeydown = onKeyDown;
  noteEl.onkeydown = onKeyDown;
}
