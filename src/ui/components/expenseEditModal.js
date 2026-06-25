// src/ui/components/expenseEditModal.js
import { ROSTER, ROSTER_IDS, nameOf } from "../../config/roster";
import { formatVND } from "../../config/i18n";
import { parseVndInput } from "../../core/money";
import { buildWholeEqualShares, toWholeVnd } from "../../domain/money/whole-vnd";

export function ensureExpenseEditModal() {
  if (document.getElementById("exEditModal")) return;

  const wrap = document.createElement("div");
  wrap.innerHTML = `
  <div class="modal fade" id="exEditModal" tabindex="-1" aria-hidden="true">
    <div class="modal-dialog modal-dialog-centered modal-dialog-scrollable">
      <div class="modal-content">
        <div class="modal-header">
          <h5 class="modal-title">Sửa chi tiêu</h5>
          <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
        </div>

        <div class="modal-body">
          <div class="row g-3">
            <div class="col-6">
              <label class="form-label" for="exEditDate">Ngày</label>
              <input id="exEditDate" type="date" class="form-control" />
            </div>
            <div class="col-6">
              <label class="form-label" for="exEditAmount">Số tiền (VNĐ)</label>
              <input
                id="exEditAmount"
                class="form-control expense-amount-input"
                inputmode="numeric"
                placeholder="VD: 100000"
                autocomplete="off"
              />
            </div>

            <div class="col-12">
              <label class="form-label" for="exEditPayer">Người trả</label>
              <select id="exEditPayer" class="form-select">
                ${ROSTER.map((member) => `<option value="${member.id}">${member.name}</option>`).join("")}
              </select>
            </div>

            <div class="col-12">
              <div class="expense-composer__split-head">
                <label class="form-label mb-0">Người tham gia</label>
                <div class="form-check form-switch mb-0">
                  <input class="form-check-input" type="checkbox" id="exEditEqual">
                  <label class="form-check-label" for="exEditEqual">Chia đều</label>
                </div>
              </div>
              <div class="d-flex flex-wrap gap-2 mt-2" id="exEditPartBox">
                ${ROSTER.map(
                  (member) => `
                    <label class="chip-toggle" for="exEditPart_${member.id}">
                      <input class="exEditPart" type="checkbox" id="exEditPart_${member.id}" data-id="${member.id}">
                      <span>${member.name}</span>
                    </label>
                  `,
                ).join("")}
              </div>
            </div>

            <div class="col-12">
              <label class="form-label mb-2">Phân bổ nợ</label>
              <div id="exEditDebtsBox" class="row g-3"></div>
              <div class="expense-edit__totals">
                <span>Tổng nợ người khác: <strong id="exEditSumDebts">0 đ</strong></span>
                <span>Phần của người trả: <strong id="exEditPayerShare">0 đ</strong></span>
              </div>
            </div>

            <div class="col-12">
              <label class="form-label" for="exEditNote">Ghi chú</label>
              <input id="exEditNote" class="form-control" placeholder="VD: Ăn uống, Đi chợ..." />
            </div>
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
  amount = 0,
  payerId = "",
  participants = [],
  debts = {},
  onSubmit,
}) {
  ensureExpenseEditModal();

  const modalEl = document.getElementById("exEditModal");
  modalEl.querySelector(".modal-title").textContent = title;

  const dateEl = document.getElementById("exEditDate");
  const amountEl = document.getElementById("exEditAmount");
  const payerEl = document.getElementById("exEditPayer");
  const equalEl = document.getElementById("exEditEqual");
  const partBox = document.getElementById("exEditPartBox");
  const debtsBox = document.getElementById("exEditDebtsBox");
  const sumDebtsEl = document.getElementById("exEditSumDebts");
  const payerShareEl = document.getElementById("exEditPayerShare");
  const noteEl = document.getElementById("exEditNote");
  const errEl = document.getElementById("exEditErr");
  const btn = document.getElementById("exEditSubmit");

  const initialParticipants =
    Array.isArray(participants) && participants.length
      ? participants
      : Array.from(new Set([payerId, ...Object.keys(debts || {})].filter(Boolean)));

  dateEl.value = date || "";
  amountEl.value = amount ? String(amount) : "";
  payerEl.value = payerId || ROSTER_IDS[0];
  noteEl.value = note || "";
  equalEl.checked = true;
  errEl.textContent = "";

  modalEl.querySelectorAll(".exEditPart").forEach((checkbox) => {
    checkbox.checked = initialParticipants.includes(checkbox.dataset.id);
  });

  const initialDebts = { ...(debts || {}) };

  function getParticipantIds() {
    return [...modalEl.querySelectorAll(".exEditPart")]
      .filter((checkbox) => checkbox.checked)
      .map((checkbox) => checkbox.dataset.id);
  }

  function syncParticipantChips() {
    modalEl.querySelectorAll(".chip-toggle").forEach((label) => {
      const checkbox = label.querySelector(".exEditPart");
      label.classList.toggle("is-active", !!checkbox?.checked);
    });
  }

  function getDebtsFromInputs(currentPayerId) {
    const result = {};
    modalEl.querySelectorAll(".exEditDebt").forEach((input) => {
      const memberId = input.dataset.id;
      if (memberId === currentPayerId || input.disabled) return;
      const value = toWholeVnd(parseVndInput(input.value));
      if (value > 0) result[memberId] = value;
    });
    return result;
  }

  function recalcTotals() {
    const amt = toWholeVnd(parseVndInput(amountEl.value));
    const currentPayerId = payerEl.value;
    const currentDebts = getDebtsFromInputs(currentPayerId);
    const sumDebts = Object.values(currentDebts).reduce(
      (sum, value) => sum + value,
      0,
    );
    sumDebtsEl.textContent = formatVND(sumDebts);
    payerShareEl.textContent = formatVND(amt - sumDebts);
  }

  function renderDebtInputs({ preserveManual = false } = {}) {
    const currentPayerId = payerEl.value;
    const amt = toWholeVnd(parseVndInput(amountEl.value));
    const equalSplit = equalEl.checked;
    const participantIds = getParticipantIds();
    const debtors = participantIds.filter((id) => id !== currentPayerId);
    const equalShares = buildWholeEqualShares(amt, participantIds);
    const manualValues = preserveManual ? getDebtsFromInputs(currentPayerId) : null;

    debtsBox.innerHTML = ROSTER_IDS.filter((id) => id !== currentPayerId)
      .map((memberId) => {
        const active = debtors.includes(memberId);
        let value = 0;
        if (active) {
          if (equalSplit) {
            value = equalShares[memberId] || 0;
          } else if (manualValues && manualValues[memberId] != null) {
            value = manualValues[memberId];
          } else if (initialDebts[memberId] != null) {
            value = initialDebts[memberId];
          }
        }

        return `
          <div class="col-12 col-md-6">
            <label class="form-label">${nameOf(memberId)} nợ ${nameOf(currentPayerId)}</label>
            <input
              class="form-control exEditDebt"
              data-id="${memberId}"
              inputmode="numeric"
              ${active ? "" : "disabled"}
              value="${active ? String(value) : "0"}"
              placeholder="0"
            />
            <div class="form-text">${active ? "Đang tham gia" : "Không tham gia"}</div>
          </div>
        `;
      })
      .join("");

    recalcTotals();
  }

  syncParticipantChips();
  renderDebtInputs();

  payerEl.onchange = () => renderDebtInputs({ preserveManual: true });
  amountEl.oninput = () => {
    if (equalEl.checked) renderDebtInputs();
    else recalcTotals();
  };
  equalEl.onchange = () => renderDebtInputs();

  modalEl.querySelectorAll(".exEditPart").forEach((checkbox) => {
    checkbox.onchange = () => {
      syncParticipantChips();
      renderDebtInputs({ preserveManual: true });
    };
  });

  debtsBox.oninput = (event) => {
    if (event.target?.classList?.contains("exEditDebt")) {
      recalcTotals();
    }
  };

  const modal = new window.bootstrap.Modal(modalEl);
  modal.show();

  const trySubmit = async () => {
    errEl.textContent = "";
    btn.disabled = true;

    try {
      const newDate = (dateEl.value || "").trim();
      if (!newDate) throw new Error("Ngày không hợp lệ.");

      const newAmount = toWholeVnd(parseVndInput(amountEl.value));
      if (!newAmount || newAmount <= 0) throw new Error("Số tiền phải lớn hơn 0.");

      const newPayerId = payerEl.value;
      if (!newPayerId) throw new Error("Hãy chọn người trả.");

      const participantIds = getParticipantIds();
      if (!participantIds.length) {
        throw new Error("Phải chọn ít nhất một người tham gia.");
      }

      let newDebts;
      if (equalEl.checked) {
        const equalShares = buildWholeEqualShares(newAmount, participantIds);
        newDebts = {};
        for (const memberId of participantIds) {
          if (memberId === newPayerId) continue;
          const share = equalShares[memberId] || 0;
          if (share > 0) newDebts[memberId] = share;
        }
      } else {
        newDebts = getDebtsFromInputs(newPayerId);
      }

      const sumDebts = Object.values(newDebts).reduce(
        (sum, value) => sum + value,
        0,
      );
      if (sumDebts - newAmount > 0.000001) {
        throw new Error("Tổng nợ của người khác không được lớn hơn tổng tiền.");
      }

      const newNote = (noteEl.value || "").trim();

      await onSubmit({
        date: newDate,
        note: newNote,
        amount: newAmount,
        payerId: newPayerId,
        participants: participantIds,
        debts: newDebts,
      });

      modal.hide();
    } catch (e) {
      errEl.textContent = e?.message || "Thao tác thất bại.";
    } finally {
      btn.disabled = false;
    }
  };

  btn.onclick = trySubmit;
}
