export function ensurePaymentEditModal() {
  if (document.getElementById("paymentEditModal")) return;

  const wrap = document.createElement("div");
  wrap.innerHTML = `
    <div class="modal fade" id="paymentEditModal" tabindex="-1" aria-hidden="true">
      <div class="modal-dialog modal-dialog-centered">
        <div class="modal-content">
          <div class="modal-header">
            <h5 class="modal-title">Sửa thanh toán</h5>
            <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
          </div>
          <div class="modal-body">
            <div class="mb-3">
              <label class="form-label">Ngày</label>
              <input id="paymentEditDate" type="date" class="form-control" />
            </div>
            <div class="mb-3">
              <label class="form-label">Ghi chú</label>
              <input
                id="paymentEditNote"
                class="form-control"
                placeholder="VD: Trả một phần theo cấn trừ"
              />
            </div>
            <div class="small text-secondary">
              Bản ghi này chỉ cho sửa ngày và ghi chú. Nếu sai số tiền, hãy xóa rồi ghi nhận lại từ dòng cấn trừ tương ứng.
            </div>
            <div id="paymentEditErr" class="small text-danger mt-2" style="min-height: 18px;"></div>
          </div>
          <div class="modal-footer">
            <button type="button" class="btn btn-outline-secondary" data-bs-dismiss="modal">Hủy</button>
            <button type="button" class="btn btn-primary" id="paymentEditSubmit">Cập nhật</button>
          </div>
        </div>
      </div>
    </div>
  `;

  document.body.appendChild(wrap.firstElementChild);
}

export function openPaymentEditModal({
  date = "",
  note = "",
  onSubmit,
} = {}) {
  ensurePaymentEditModal();

  const modalEl = document.getElementById("paymentEditModal");
  const dateEl = document.getElementById("paymentEditDate");
  const noteEl = document.getElementById("paymentEditNote");
  const errEl = document.getElementById("paymentEditErr");
  const submitBtn = document.getElementById("paymentEditSubmit");

  dateEl.value = date;
  noteEl.value = note;
  errEl.textContent = "";

  const modal = new window.bootstrap.Modal(modalEl);
  modal.show();

  const trySubmit = async () => {
    errEl.textContent = "";
    submitBtn.disabled = true;

    try {
      const nextDate = String(dateEl.value || "").trim();
      if (!nextDate) {
        throw new Error("Ngày thanh toán không được để trống.");
      }

      const nextNote = String(noteEl.value || "").trim();
      await onSubmit?.({
        date: nextDate,
        note: nextNote,
      });
      modal.hide();
    } catch (error) {
      errEl.textContent = error?.message || "Không thể cập nhật thanh toán.";
    } finally {
      submitBtn.disabled = false;
    }
  };

  submitBtn.onclick = trySubmit;
  dateEl.onkeydown = (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      trySubmit();
    }
  };
  noteEl.onkeydown = (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      trySubmit();
    }
  };
}
