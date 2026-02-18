// src/ui/components/expenseEditModal.js
export function ensureExpenseEditModal() {
  if (document.getElementById("exEditModal")) return;

  const wrap = document.createElement("div");
  wrap.innerHTML = `
  <div class="modal fade" id="exEditModal" tabindex="-1" aria-hidden="true">
    <div class="modal-dialog modal-dialog-centered">
      <div class="modal-content">
        <div class="modal-header">
          <h5 class="modal-title">Sửa chi tiêu</h5>
          <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
        </div>

        <div class="modal-body">
          <div class="mb-3">
            <label class="form-label">Ngày</label>
            <input id="exEditDate" type="date" class="form-control" />
          </div>

          <div class="mb-2">
            <label class="form-label">Ghi chú</label>
            <input id="exEditNote" class="form-control" placeholder="VD: Ăn uống, Đi chợ..." />
          </div>

          <div id="exEditErr" class="small text-danger mt-2" style="min-height:18px;"></div>
        </div>

        <div class="modal-footer">
          <button type="button" class="btn btn-outline-secondary" data-bs-dismiss="modal">Hủy</button>
          <button type="button" class="btn btn-primary" id="exEditSubmit">Lưu</button>
        </div>
      </div>
    </div>
  </div>
  `;
  document.body.appendChild(wrap.firstElementChild);
}

export function openExpenseEditModal({
  title = "Sửa chi tiêu",
  date,
  note,
  onSubmit,
}) {
  ensureExpenseEditModal();

  const modalEl = document.getElementById("exEditModal");
  modalEl.querySelector(".modal-title").textContent = title;

  const dateEl = document.getElementById("exEditDate");
  const noteEl = document.getElementById("exEditNote");
  const errEl = document.getElementById("exEditErr");
  const btn = document.getElementById("exEditSubmit");

  dateEl.value = date || "";
  noteEl.value = note || "";
  errEl.textContent = "";

  const modal = new window.bootstrap.Modal(modalEl);
  modal.show();

  const trySubmit = async () => {
    errEl.textContent = "";
    btn.disabled = true;

    try {
      const newDate = (dateEl.value || "").trim();
      if (!newDate) throw new Error("Ngày không hợp lệ.");

      const newNote = (noteEl.value || "").trim();
      await onSubmit({ date: newDate, note: newNote });

      modal.hide();
    } catch (e) {
      errEl.textContent = e?.message || "Thao tác thất bại.";
    } finally {
      btn.disabled = false;
    }
  };

  btn.onclick = trySubmit;

  const onKeyDown = (ev) => {
    if (ev.key === "Enter") {
      ev.preventDefault();
      trySubmit();
    }
  };
  dateEl.onkeydown = onKeyDown;
  noteEl.onkeydown = onKeyDown;
}
