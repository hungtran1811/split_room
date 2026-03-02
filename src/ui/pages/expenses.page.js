import { logout } from "../../services/auth.service";
import { state } from "../../core/state";
import { ROSTER, ROSTER_IDS, nameOf } from "../../config/roster";
import { getCurrentUserLabel, getUserLabel } from "../../core/display-name";
import { formatVND } from "../../config/i18n";
import { parseVndInput } from "../../core/money";
import { mapFirestoreError } from "../../core/errors";
import { showToast } from "../components/toast";
import { openConfirmModal } from "../components/confirmModal";
import { openExpenseEditModal } from "../components/expenseEditModal";
import { mountPrimaryNav } from "../layout/navbar";
import {
  addExpense,
  removeExpense,
  updateExpense,
} from "../../services/expense.service";
import { watchMonthExpenses } from "../../services/month-ops.service";

function byId(id) {
  return document.getElementById(id);
}

function currentPeriod() {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}

function periodToYmd(period) {
  return `${period}-01`;
}

function todayYmd() {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function creatorLabel(uid) {
  if (!uid) return "-";

  const member = (state.members || []).find(
    (item) => item.uid === uid || item.id === uid,
  );
  if (member) return getUserLabel(member);
  if (state.user?.uid === uid) return getCurrentUserLabel(state);

  return uid;
}

export async function renderExpensesPage() {
  if (!state.user || !state.groupId) return;

  const app = document.querySelector("#app");
  const groupId = state.groupId;
  const canManageEntries = state.canOperateMonth;
  let selectedPeriod = currentPeriod();
  let expensesCollapsed = false;
  let unsubscribeExpenses = null;
  let liveExpenses = [];

  app.innerHTML = `
    <div class="app-shell" data-page="expenses">
      <div class="app-shell__container">
        <div class="app-shell__header">
          <div class="app-shell__title-block">
            <h1 class="app-shell__title">Chi tiêu</h1>
            <div class="app-shell__meta">Nhóm: <b>${groupId}</b></div>
          </div>
          <div id="primaryNavHost" class="app-shell__nav-host"></div>
        </div>

      <div class="row g-2 align-items-end">
        <div class="col-6 col-md-4">
          <label class="form-label small mb-1">Chọn tháng</label>
          <input id="periodPicker" type="month" class="form-control" value="${selectedPeriod}" />
        </div>
        <div class="col-12">
          <div class="small text-secondary mt-2">
            Trang này chỉ còn quản lý chi tiêu theo tháng. Thanh toán theo cấn trừ nằm trong trang Thanh toán.
          </div>
        </div>
      </div>

      <hr class="my-3"/>

      <div class="card mb-3">
        <div class="card-header">Thêm khoản chi</div>
        <div class="card-body">
          <div class="row g-3">
            <div class="col-md-4">
              <label class="form-label">Ngày</label>
              <input id="exDate" type="date" class="form-control" value="${todayYmd()}"/>
            </div>

            <div class="col-md-4">
              <label class="form-label">Số tiền (VNĐ)</label>
              <input id="exAmount" class="form-control" placeholder="VD: 10000 hoặc 10.000,5"/>
              <div class="form-text">Giữ số lẻ nếu có. Nhập 10.000 hoặc 10000 đều được.</div>
            </div>

            <div class="col-md-4">
              <label class="form-label">Người trả</label>
              <select id="exPayer" class="form-select">
                ${ROSTER.map((member) => `<option value="${member.id}">${member.name}</option>`).join("")}
              </select>
            </div>

            <div class="col-12">
              <label class="form-label mb-2">Người tham gia (tick)</label>
              <div class="row g-2">
                ${ROSTER.map(
                  (member) => `
                    <div class="col-6 col-md-3">
                      <div class="form-check">
                        <input class="form-check-input exPart" type="checkbox" id="p_${member.id}" data-id="${member.id}" checked>
                        <label class="form-check-label" for="p_${member.id}">${member.name}</label>
                      </div>
                    </div>
                  `,
                ).join("")}
              </div>
              <div class="form-text">
                Nếu người trả cũng tham gia, cứ tick bình thường. Engine sẽ tự tính phần của người trả.
              </div>
            </div>

            <div class="col-12">
              <div class="d-flex align-items-center gap-3">
                <div class="form-check">
                  <input class="form-check-input" type="checkbox" id="exEqual" checked>
                  <label class="form-check-label" for="exEqual">Chia đều</label>
                </div>
                <div class="small text-secondary">
                  Bỏ tick để tùy chỉnh số tiền nợ cho từng người.
                </div>
              </div>
            </div>

            <div class="col-12">
              <div class="card">
                <div class="card-header">Phân bổ nợ (ai nợ người trả bao nhiêu)</div>
                <div class="card-body">
                  <div id="debtsBox" class="row g-3"></div>
                  <div class="mt-2 small">
                    <div>Tổng nợ của người khác: <b id="sumDebts">0 đ</b></div>
                    <div>Phần của người trả (tự tính): <b id="payerShare">0 đ</b></div>
                  </div>
                </div>
              </div>
            </div>

            <div class="col-12">
              <label class="form-label">Ghi chú (tùy chọn)</label>
              <input id="exNote" class="form-control" placeholder="VD: Ăn uống, Đi chợ, ..."/>
            </div>

            <div class="col-12 d-flex gap-2">
              <button id="btnSaveExpense" class="btn btn-primary">Lưu chi tiêu</button>
              <button id="btnResetExpense" class="btn btn-outline-secondary">Nhập lại</button>
              <div id="msg" class="small text-danger align-self-center"></div>
            </div>
          </div>
        </div>
      </div>

      <div class="card mb-3">
        <div class="card-header d-flex justify-content-between align-items-center">
          <div>Danh sách chi tiêu</div>
          <button id="btnToggleExpenses" class="btn btn-outline-secondary btn-sm" type="button">Ẩn</button>
        </div>
        <div class="card-body" id="expensesListWrap" style="max-height: 400px; overflow-y: auto; overflow-x: hidden;">
          <div id="expensesList" class="small text-secondary">Đang tải...</div>
        </div>
      </div>
    </div>
  `;

  mountPrimaryNav({
    active: "expenses",
    isOwner: state.isOwner,
    includeLogout: true,
    onLogout: async () => {
      await logout();
    },
  });

  function setMessage(text = "") {
    byId("msg").textContent = text;
  }

  function getParticipantIds() {
    return [...document.querySelectorAll(".exPart")]
      .filter((checkbox) => checkbox.checked)
      .map((checkbox) => checkbox.dataset.id);
  }

  function getDebtsFromInputs(payerId) {
    const debts = {};

    document.querySelectorAll(".debtInput").forEach((input) => {
      const memberId = input.dataset.id;
      if (memberId === payerId || input.disabled) return;

      const value = parseVndInput(input.value);
      if (value > 0) {
        debts[memberId] = value;
      }
    });

    return debts;
  }

  function recalcTotals() {
    const amount = parseVndInput(byId("exAmount").value);
    const payerId = byId("exPayer").value;
    const debts = getDebtsFromInputs(payerId);
    const sumDebts = Object.values(debts).reduce((sum, value) => sum + value, 0);
    const payerShare = amount - sumDebts;

    byId("sumDebts").textContent = formatVND(sumDebts);
    byId("payerShare").textContent = formatVND(payerShare);
  }

  function renderDebtsInputs() {
    const payerId = byId("exPayer").value;
    const amount = parseVndInput(byId("exAmount").value);
    const equalSplit = byId("exEqual").checked;
    const participants = getParticipantIds();
    const participantCount = participants.length;
    const debtors = participants.filter((memberId) => memberId !== payerId);
    const eachShare = participantCount > 0 ? amount / participantCount : 0;
    const box = byId("debtsBox");

    box.innerHTML = ROSTER_IDS.filter((memberId) => memberId !== payerId)
      .map((memberId) => {
        const active = debtors.includes(memberId);
        const value = equalSplit && active ? eachShare : 0;

        return `
          <div class="col-12 col-md-6">
            <label class="form-label">${nameOf(memberId)} nợ ${nameOf(payerId)}</label>
            <input
              class="form-control debtInput"
              data-id="${memberId}"
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

  function resetForm() {
    byId("exDate").value = periodToYmd(selectedPeriod);
    byId("exAmount").value = "";
    byId("exNote").value = "";
    document.querySelectorAll(".exPart").forEach((checkbox) => {
      checkbox.checked = true;
    });
    byId("exEqual").checked = true;
    setMessage("");
    renderDebtsInputs();
  }

  async function saveExpense() {
    const date = byId("exDate").value || periodToYmd(selectedPeriod);
    const amount = parseVndInput(byId("exAmount").value);
    const payerId = byId("exPayer").value;
    const note = byId("exNote").value.trim();
    const participants = getParticipantIds();

    if (!amount || amount <= 0) {
      setMessage("Số tiền phải lớn hơn 0.");
      return;
    }
    if (!payerId) {
      setMessage("Hãy chọn người trả.");
      return;
    }
    if (!participants.length) {
      setMessage("Phải chọn ít nhất một người tham gia.");
      return;
    }

    const debts = getDebtsFromInputs(payerId);
    const sumDebts = Object.values(debts).reduce((sum, value) => sum + value, 0);
    if (sumDebts - amount > 0.000001) {
      setMessage("Tổng nợ của người khác không được lớn hơn tổng tiền.");
      return;
    }

    const button = byId("btnSaveExpense");
    button.disabled = true;
    button.textContent = "Đang lưu...";
    setMessage("");

    try {
      await addExpense(groupId, {
        date,
        amount,
        payerId,
        participants,
        debts,
        note,
        createdBy: state.user.uid,
      });

      showToast({
        title: "Thành công",
        message: "Đã lưu khoản chi.",
        variant: "success",
      });
      resetForm();
    } catch (error) {
      const message = mapFirestoreError(error, "Lưu thất bại.");
      setMessage(message);
      showToast({
        title: "Thất bại",
        message,
        variant: "danger",
      });
    } finally {
      button.disabled = false;
      button.textContent = "Lưu chi tiêu";
    }
  }

  function renderExpensesList(expenses) {
    const wrap = byId("expensesList");
    if (!wrap) return;

    if (!expenses.length) {
      wrap.innerHTML = `<div class="text-secondary">Chưa có chi tiêu.</div>`;
      return;
    }

    wrap.innerHTML = `
      <div class="list-group">
        ${expenses
          .map(
            (expense) => `
              <div class="list-group-item">
                <div class="d-flex justify-content-between align-items-start gap-3">
                  <div>
                    <div class="fw-semibold">${expense.date} • ${formatVND(expense.amount)}</div>
                    <div class="text-secondary">Người trả: <b>${nameOf(expense.payerId)}</b>${expense.note ? ` • ${expense.note}` : ""}</div>
                    <div class="text-secondary small">Người tạo: <b>${creatorLabel(expense.createdBy)}</b></div>
                    <div class="small text-secondary mt-1">
                      Nợ:
                      ${
                        Object.entries(expense.debts || {}).length
                          ? Object.entries(expense.debts || {})
                              .map(([memberId, value]) => `${nameOf(memberId)} ${formatVND(value)}`)
                              .join(" • ")
                          : "Không có"
                      }
                    </div>
                  </div>
                  ${
                    canManageEntries
                      ? `
                        <div class="d-flex gap-2">
                          <button class="btn btn-outline-secondary btn-sm" data-edit-expense="${expense.id}">Sửa</button>
                          <button class="btn btn-outline-danger btn-sm" data-delete-expense="${expense.id}">Xóa</button>
                        </div>
                      `
                      : ""
                  }
                </div>
              </div>
            `,
          )
          .join("")}
      </div>
    `;

    if (!canManageEntries) return;

    wrap.querySelectorAll("[data-delete-expense]").forEach((button) => {
      button.addEventListener("click", () => {
        const expense = liveExpenses.find(
          (item) => item.id === button.getAttribute("data-delete-expense"),
        );
        if (!expense) return;

        openConfirmModal({
          title: "Xóa khoản chi",
          message: "Bạn chắc chắn muốn xóa khoản chi này?",
          meta: `${expense.date} • ${formatVND(expense.amount)} • Người trả: ${nameOf(expense.payerId)}`,
          okText: "Xóa",
          danger: true,
          onConfirm: async () => {
            try {
              await removeExpense(groupId, expense.id);
              showToast({
                title: "Thành công",
                message: "Đã xóa khoản chi.",
                variant: "success",
              });
            } catch (error) {
              showToast({
                title: "Thất bại",
                message: mapFirestoreError(
                  error,
                  "Không thể xóa khoản chi.",
                ),
                variant: "danger",
              });
              throw error;
            }
          },
        });
      });
    });

    wrap.querySelectorAll("[data-edit-expense]").forEach((button) => {
      button.addEventListener("click", () => {
        const expense = liveExpenses.find(
          (item) => item.id === button.getAttribute("data-edit-expense"),
        );
        if (!expense) return;

        openExpenseEditModal({
          title: "Sửa chi tiêu (ngày/ghi chú)",
          date: expense.date,
          note: expense.note || "",
          onSubmit: async ({ date, note }) => {
            await updateExpense(groupId, expense.id, { date, note });
            showToast({
              title: "Thành công",
              message: "Đã cập nhật chi tiêu.",
              variant: "success",
            });
          },
        });
      });
    });
  }

  function startWatch() {
    unsubscribeExpenses?.();
    unsubscribeExpenses = watchMonthExpenses(groupId, selectedPeriod, (items) => {
      liveExpenses = items;
      renderExpensesList(items);
    });
  }

  byId("periodPicker").addEventListener("change", (event) => {
    selectedPeriod = event.target.value || currentPeriod();
    byId("exDate").value = periodToYmd(selectedPeriod);
    startWatch();
  });

  byId("btnToggleExpenses").addEventListener("click", () => {
    expensesCollapsed = !expensesCollapsed;
    byId("expensesListWrap").style.display = expensesCollapsed ? "none" : "block";
    byId("btnToggleExpenses").textContent = expensesCollapsed ? "Hiện" : "Ẩn";
  });

  byId("exPayer").addEventListener("change", renderDebtsInputs);
  byId("exAmount").addEventListener("input", () => {
    if (byId("exEqual").checked) {
      renderDebtsInputs();
      return;
    }

    recalcTotals();
  });
  byId("exEqual").addEventListener("change", renderDebtsInputs);
  document.querySelectorAll(".exPart").forEach((checkbox) => {
    checkbox.addEventListener("change", renderDebtsInputs);
  });
  byId("debtsBox").addEventListener("input", (event) => {
    if (event.target?.classList?.contains("debtInput")) {
      recalcTotals();
    }
  });
  byId("btnResetExpense").addEventListener("click", resetForm);
  byId("btnSaveExpense").addEventListener("click", async () => {
    await saveExpense();
  });

  renderDebtsInputs();
  byId("exDate").value = periodToYmd(selectedPeriod);
  renderExpensesList([]);
  startWatch();

  const onHashChange = () => {
    if (!location.hash.startsWith("#/expenses")) {
      unsubscribeExpenses?.();
      window.removeEventListener("hashchange", onHashChange);
    }
  };

  window.addEventListener("hashchange", onHashChange);
}
