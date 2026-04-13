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
            <div class="form-text" id="payAmountHelp">Chỉ nhập số nguyên, ví dụ: 10.000</div>
          </div>

          <div class="mb-3">
            <label class="form-label">Ngày ghi nhận</label>
            <input id="payDate" type="date" class="form-control" />
            <div class="form-text" id="payDateHelp">Bạn có thể sửa ngày ghi nhận nếu cần.</div>
          </div>

          <div class="mb-2">
            <label class="form-label">Ghi chú</label>
            <input id="payNote" class="form-control" placeholder="Ví dụ: Trả tiền ăn tháng 1" />
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
 * - defaultDate: string (YYYY-MM-DD)
 * - dateHelp: string
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
  defaultDate = "",
  dateHelp = "",
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
  const dateEl = document.getElementById("payDate");
  const dateHelpEl = document.getElementById("payDateHelp");
  const noteEl = document.getElementById("payNote");
  const errEl = document.getElementById("payErr");
  const btn = document.getElementById("paySubmit");

  titleEl.textContent = title;

  if (lockAmount) {
    hint.textContent = `Trả đủ theo cấn trừ: ${formatVND(amount)}.`;
  } else if (typeof maxAmount === "number") {
    hint.textContent = `Tối đa theo cấn trừ: ${formatVND(maxAmount)}.`;
  } else {
    hint.textContent = `Gợi ý: số tiền đang nợ theo cấn trừ là ${formatVND(amount)}.`;
  }

  fromEl.value = fromName;
  toEl.value = toName;

  amountEl.disabled = !!lockAmount;
  amountEl.value = String(amount);
  amountHelp.textContent = lockAmount
    ? "Số tiền đã bị khóa theo cấn trừ."
    : "Chỉ nhập số nguyên, ví dụ: 10.000";

  dateEl.value = defaultDate || "";
  dateHelpEl.textContent =
    dateHelp || "Bạn có thể sửa ngày ghi nhận nếu cần.";

  noteEl.value = defaultNote || "";
  errEl.textContent = "";

  const modal = new window.bootstrap.Modal(modalEl);
  modal.show();

  const trySubmit = async () => {
    errEl.textContent = "";
    btn.disabled = true;

    try {
      const amt = Math.round(parseVndInput(amountEl.value));
      if (!amt || amt <= 0) throw new Error("Số tiền không hợp lệ.");

      const date = String(dateEl.value || defaultDate || "").trim();
      if (!date) throw new Error("Ngày ghi nhận không hợp lệ.");

      if (lockAmount) {
        if (amt !== amount) {
          throw new Error("Trả đủ phải đúng số tiền theo cấn trừ.");
        }
      } else if (typeof maxAmount === "number") {
        if (amt > maxAmount) {
          throw new Error("Không được vượt quá số tiền đang nợ theo cấn trừ.");
        }
      }

      const note = noteEl.value.trim();
      await onSubmit({ amount: amt, note, date });

      modal.hide();
    } catch (error) {
      errEl.textContent = error?.message || "Thao tác thất bại.";
    } finally {
      btn.disabled = false;
    }
  };

  btn.onclick = trySubmit;

  const onKeyDown = (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      trySubmit();
    }
  };

  amountEl.onkeydown = onKeyDown;
  dateEl.onkeydown = onKeyDown;
  noteEl.onkeydown = onKeyDown;
}
