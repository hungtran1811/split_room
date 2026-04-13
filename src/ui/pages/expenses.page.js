import { logout } from "../../services/auth.service";
import {
  getSelectedPeriod,
  setSelectedPeriod,
  state,
  subscribeSelectedPeriod,
} from "../../core/state";
import { ROSTER, ROSTER_IDS, nameOf } from "../../config/roster";
import { getCurrentUserLabel, getUserLabel } from "../../core/display-name";
import { formatVND } from "../../config/i18n";
import { parseVndInput } from "../../core/money";
import { mapFirestoreError } from "../../core/errors";
import { showToast } from "../components/toast";
import { openConfirmModal } from "../components/confirmModal";
import { openExpenseEditModal } from "../components/expenseEditModal";
import { renderAppShell } from "../layout/app-shell";
import { mountPrimaryNav } from "../layout/navbar";
import {
  addExpense,
  removeExpense,
  updateExpense,
} from "../../services/expense.service";
import {
  getMonthRange,
  watchMonthExpenses,
} from "../../services/month-ops.service";
import { renderMoneyStatCard } from "../components/moneyStatCard";
import { renderSectionHeader } from "../components/sectionHeader";
import {
  buildWholeEqualShares,
  toWholeVnd,
} from "../../domain/money/whole-vnd";

function byId(id) {
  return document.getElementById(id);
}

function todayYmd() {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function expenseDateForPeriod(period) {
  const today = new Date();
  const [year, month] = String(period || "").split("-").map(Number);
  if (!year || !month) return todayYmd();

  const currentDay = today.getDate();
  const lastDay = new Date(year, month, 0).getDate();
  const day = String(Math.min(currentDay, lastDay)).padStart(2, "0");
  return `${year}-${String(month).padStart(2, "0")}-${day}`;
}

function lastDayOfPeriod(period) {
  const [year, month] = String(period || "").split("-").map(Number);
  if (!year || !month) return todayYmd();
  const day = String(new Date(year, month, 0).getDate()).padStart(2, "0");
  return `${year}-${String(month).padStart(2, "0")}-${day}`;
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

function groupExpensesByDate(expenses) {
  const groups = new Map();
  for (const expense of expenses) {
    const key = expense.date || "Không rõ ngày";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(expense);
  }

  return [...groups.entries()].map(([date, items]) => ({
    date,
    items,
  }));
}

function filterExpensesByDate(expenses, selectedExpenseDate) {
  if (!selectedExpenseDate) return expenses;
  return (expenses || []).filter((expense) => expense.date === selectedExpenseDate);
}

function renderExpenseSummary(expenses, selectedExpenseDate) {
  const total = expenses.reduce((sum, item) => sum + Number(item.amount || 0), 0);
  const label = selectedExpenseDate ? "Tổng chi ngày đang lọc" : "Tổng chi trong tháng";
  const hint = selectedExpenseDate
    ? `${expenses.length} khoản chi trong ngày ${selectedExpenseDate}`
    : `${expenses.length} khoản chi`;

  return `
    <section class="money-grid">
      ${renderMoneyStatCard({
        label,
        value: formatVND(total),
        hint,
        tone: total > 0 ? "warning" : "neutral",
      })}
    </section>
  `;
}

export async function renderExpensesPage() {
  if (!state.user || !state.groupId) return;

  const app = document.querySelector("#app");
  const groupId = state.groupId;
  const canManageEntries = state.canOperateMonth;
  const composerOpenByDefault = window.matchMedia("(min-width: 992px)").matches;
  const currentUserLabel = getCurrentUserLabel(state);
  let selectedPeriod = getSelectedPeriod();
  let selectedExpenseDate = "";
  let expenseListOpen = false;
  let unsubscribeExpenses = null;
  let liveExpenses = [];

  function setMessage(text = "") {
    byId("msg").textContent = text;
  }

  function visibleExpenses() {
    return filterExpensesByDate(liveExpenses, selectedExpenseDate);
  }

  function syncExpenseView() {
    const expenses = visibleExpenses();
    renderExpensesList(expenses);

    const summaryEl = byId("expensesSummary");
    if (summaryEl) {
      summaryEl.innerHTML = renderExpenseSummary(expenses, selectedExpenseDate);
    }

    const countEl = byId("expensesCount");
    if (countEl) {
      countEl.textContent = `${expenses.length} khoản`;
    }

    const filterMetaEl = byId("expenseDateFilterMeta");
    if (filterMetaEl) {
      filterMetaEl.textContent = selectedExpenseDate
        ? `Đang chỉ xem chi tiêu ngày ${selectedExpenseDate}.`
        : `Mặc định đang xem toàn bộ chi tiêu trong ${selectedPeriod}.`;
    }

    const filterInputEl = byId("expenseDateFilter");
    if (filterInputEl) {
      filterInputEl.value = selectedExpenseDate;
    }

    const resetButtonEl = byId("btnResetExpenseDateFilter");
    if (resetButtonEl) {
      resetButtonEl.disabled = !selectedExpenseDate;
    }
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

      const value = toWholeVnd(parseVndInput(input.value));
      if (value > 0) {
        debts[memberId] = value;
      }
    });

    return debts;
  }

  function recalcTotals() {
    const amount = toWholeVnd(parseVndInput(byId("exAmount").value));
    const payerId = byId("exPayer").value;
    const debts = getDebtsFromInputs(payerId);
    const sumDebts = Object.values(debts).reduce((sum, value) => sum + value, 0);
    const payerShare = amount - sumDebts;

    byId("sumDebts").textContent = formatVND(sumDebts);
    byId("payerShare").textContent = formatVND(payerShare);
  }

  function renderDebtsInputs() {
    const payerId = byId("exPayer").value;
    const amount = toWholeVnd(parseVndInput(byId("exAmount").value));
    const equalSplit = byId("exEqual").checked;
    const participants = getParticipantIds();
    const debtors = participants.filter((memberId) => memberId !== payerId);
    const equalShares = buildWholeEqualShares(amount, participants);
    const box = byId("debtsBox");

    box.innerHTML = ROSTER_IDS.filter((memberId) => memberId !== payerId)
      .map((memberId) => {
        const active = debtors.includes(memberId);
        const value = equalSplit && active ? equalShares[memberId] || 0 : 0;

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
    byId("exDate").value = expenseDateForPeriod(selectedPeriod);
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
    const date = byId("exDate").value || expenseDateForPeriod(selectedPeriod);
    const amount = toWholeVnd(parseVndInput(byId("exAmount").value));
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
      if (!composerOpenByDefault) {
        byId("expenseComposer").open = false;
      }
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
      wrap.innerHTML = `
        <div class="empty-state">
          <div class="empty-state__title">${
            selectedExpenseDate
              ? "Chưa có khoản chi nào trong ngày đã chọn"
              : "Chưa có khoản chi nào"
          }</div>
          <div class="empty-state__text">
            ${
              selectedExpenseDate
                ? `Không có khoản chi nào vào ${selectedExpenseDate}. Bạn có thể đổi ngày lọc hoặc quay lại xem toàn tháng.`
                : `Hãy thêm khoản chi đầu tiên cho tháng ${selectedPeriod}.`
            }
          </div>
        </div>
      `;
      return;
    }

    wrap.innerHTML = groupExpensesByDate(expenses)
      .map(
        ({ date, items }) => `
          <section class="expense-day-group">
            ${renderSectionHeader({
              title: date,
              subtitle: `${items.length} khoản chi trong ngày`,
              className: "expense-day-group__header",
            })}
            <div class="expense-day-group__list">
              ${items
                .map(
                  (expense) => `
                    <article class="action-list__item">
                      <div class="action-list__head">
                        <div>
                          <div class="money-card__value" style="font-size: var(--money-md);">${formatVND(expense.amount)}</div>
                          <div class="action-list__meta">Người trả: ${nameOf(expense.payerId)}</div>
                          <div class="action-list__meta">${expense.note || "Không có ghi chú"}</div>
                          <div class="action-list__meta">
                            Người tham gia: ${(expense.participants || []).map((memberId) => nameOf(memberId)).join(", ") || "Không có"}
                          </div>
                          <div class="action-list__meta">Người tạo: ${creatorLabel(expense.createdBy)}</div>
                        </div>
                        ${
                          canManageEntries
                            ? `
                              <div class="d-flex flex-wrap gap-2">
                                <button class="btn ui-action-pill ui-action-pill--secondary section-cta" data-edit-expense="${expense.id}">Sửa</button>
                                <button class="btn ui-action-pill ui-action-pill--danger section-cta" data-delete-expense="${expense.id}">Xóa</button>
                              </div>
                            `
                            : ""
                        }
                      </div>
                    </article>
                  `,
                )
                .join("")}
            </div>
          </section>
        `,
      )
      .join("");

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

  function renderPage() {
    app.innerHTML = renderAppShell({
      pageId: "expenses",
      title: "Chi tiêu",
      subtitle: "Theo dõi khoản chi theo tháng",
      meta: [`Đăng nhập: ${currentUserLabel}`, `Nhóm: ${groupId}`],
      showPeriodFilter: true,
      period: selectedPeriod,
      periodActions:
        '<button id="btnOpenComposer" class="btn ui-action-pill ui-action-pill--primary" type="button">Thêm khoản chi</button>',
      content: `
        <div id="expensesSummary">
          ${renderExpenseSummary(visibleExpenses(), selectedExpenseDate)}
        </div>

        <section class="card section-card">
          <div class="card-body section-card__body">
            ${renderSectionHeader({
              title: "Lọc theo ngày",
              subtitle: "Mặc định xem toàn bộ chi tiêu trong tháng, chỉ lọc khi bạn cần soi một ngày cụ thể.",
            })}
            <div class="row g-3 align-items-end">
              <div class="col-md-4">
                <label class="form-label">Chỉ xem 1 ngày</label>
                <input
                  id="expenseDateFilter"
                  type="date"
                  class="form-control"
                  value="${selectedExpenseDate}"
                  min="${getMonthRange(selectedPeriod).start}"
                  max="${lastDayOfPeriod(selectedPeriod)}"
                />
              </div>
              <div class="col-md-auto">
                <button
                  id="btnResetExpenseDateFilter"
                  class="btn ui-action-pill ui-action-pill--secondary"
                  type="button"
                  ${selectedExpenseDate ? "" : "disabled"}
                >
                  Xem toàn tháng
                </button>
              </div>
            </div>
            <div id="expenseDateFilterMeta" class="form-text mt-3">
              ${
                selectedExpenseDate
                  ? `Đang chỉ xem chi tiêu ngày ${selectedExpenseDate}.`
                  : `Mặc định đang xem toàn bộ chi tiêu trong ${selectedPeriod}.`
              }
            </div>
          </div>
        </section>

        <details class="card section-card" id="expenseComposer" ${composerOpenByDefault ? "open" : ""}>
          <summary class="card-header">Thêm khoản chi</summary>
          <div class="card-body section-card__body">
            <div class="row g-3">
              <div class="col-md-4">
                <label class="form-label">Ngày</label>
                <input id="exDate" type="date" class="form-control" value="${expenseDateForPeriod(selectedPeriod)}"/>
              </div>

              <div class="col-md-4">
                <label class="form-label">Số tiền (VNĐ)</label>
                <input id="exAmount" class="form-control" placeholder="VD: 10000 hoặc 10.000"/>
                <div class="form-text">Chỉ nhập số nguyên VND.</div>
              </div>

              <div class="col-md-4">
                <label class="form-label">Người trả</label>
                <select id="exPayer" class="form-select">
                  ${ROSTER.map((member) => `<option value="${member.id}">${member.name}</option>`).join("")}
                </select>
              </div>

              <div class="col-12">
                <label class="form-label mb-2">Người tham gia</label>
                <div class="d-flex flex-wrap gap-2">
                  ${ROSTER.map(
                    (member) => `
                      <label class="chip-toggle is-active" for="p_${member.id}">
                        <input class="exPart" type="checkbox" id="p_${member.id}" data-id="${member.id}" checked>
                        <span>${member.name}</span>
                      </label>
                    `,
                  ).join("")}
                </div>
                <div class="form-text">
                  Nếu người trả cũng tham gia, cứ tick bình thường. Engine sẽ tự tính phần của người trả.
                </div>
              </div>

              <div class="col-12">
                <div class="d-flex align-items-center gap-3 flex-wrap">
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
                  <div class="card-body section-card__body">
                    ${renderSectionHeader({
                      title: "Phân bổ nợ",
                      subtitle: "Phần chia chi tiết cho từng người trong khoản chi này.",
                    })}
                    <div id="debtsBox" class="row g-3"></div>
                    <div class="money-grid money-grid--3">
                      ${renderMoneyStatCard({
                        label: "Tổng nợ người khác",
                        value: '<span id="sumDebts">0 đ</span>',
                        tone: "warning",
                      })}
                      ${renderMoneyStatCard({
                        label: "Phần của người trả",
                        value: '<span id="payerShare">0 đ</span>',
                        tone: "neutral",
                      })}
                      ${renderMoneyStatCard({
                        label: "Tháng đang nhập",
                        value: selectedPeriod,
                        tone: "positive",
                      })}
                    </div>
                  </div>
                </div>
              </div>

              <div class="col-12">
                <label class="form-label">Ghi chú</label>
                <input id="exNote" class="form-control" placeholder="VD: Ăn uống, Đi chợ, ..." />
              </div>

              <div class="col-12 d-flex flex-wrap gap-2 align-items-center">
                <button id="btnSaveExpense" class="btn btn-primary">Lưu chi tiêu</button>
                <button id="btnResetExpense" class="btn btn-outline-secondary">Nhập lại</button>
                <div id="msg" class="small text-danger"></div>
              </div>
            </div>
          </div>
        </details>

        <details class="card section-card section-toggle" id="expensesHistory" ${expenseListOpen ? "open" : ""}>
          <summary class="card-header section-toggle__summary">
            <div>
              <div class="section-toggle__title">Danh sách chi tiêu</div>
              <div class="section-toggle__subtitle">Ẩn mặc định, mở ra khi cần xem lịch sử của tháng đang chọn.</div>
            </div>
            <span class="filter-pill filter-pill--neutral" id="expensesCount">${liveExpenses.length} khoản</span>
          </summary>
          <div class="card-body section-card__body">
            <div id="expensesList"></div>
          </div>
        </details>
      `,
    });

    mountPrimaryNav({
      active: "expenses",
      isOwner: state.isOwner,
      includeLogout: true,
      onLogout: async () => {
        await logout();
      },
      userLabel: currentUserLabel,
    });
  }

  function syncParticipantChips() {
    document.querySelectorAll(".chip-toggle").forEach((label) => {
      const checkbox = label.querySelector(".exPart");
      label.classList.toggle("is-active", !!checkbox?.checked);
    });
  }

  function bindEvents() {
    byId("globalPeriodPicker").addEventListener("change", (event) => {
      setSelectedPeriod(event.target.value);
    });

    byId("btnOpenComposer").addEventListener("click", () => {
      const composer = byId("expenseComposer");
      composer.open = true;
      composer.scrollIntoView({ behavior: "smooth", block: "start" });
    });

    byId("expenseDateFilter")?.addEventListener("change", (event) => {
      selectedExpenseDate = event.target.value || "";
      syncExpenseView();
    });

    byId("btnResetExpenseDateFilter")?.addEventListener("click", () => {
      selectedExpenseDate = "";
      syncExpenseView();
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
      checkbox.addEventListener("change", () => {
        syncParticipantChips();
        renderDebtsInputs();
      });
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

    byId("expensesHistory")?.addEventListener("toggle", (event) => {
      expenseListOpen = event.currentTarget.open;
    });
  }

  function startWatch() {
    unsubscribeExpenses?.();
    unsubscribeExpenses = watchMonthExpenses(groupId, selectedPeriod, (items) => {
      liveExpenses = items;
      syncExpenseView();
    });
  }

  renderPage();
  bindEvents();
  syncParticipantChips();
  renderDebtsInputs();
  byId("exDate").value = expenseDateForPeriod(selectedPeriod);
  syncExpenseView();
  startWatch();

  const unsubscribeSelectedPeriod = subscribeSelectedPeriod((nextPeriod) => {
    if (nextPeriod === selectedPeriod) return;
    selectedPeriod = nextPeriod;
    selectedExpenseDate = "";
    liveExpenses = [];
    renderPage();
    bindEvents();
    syncParticipantChips();
    renderDebtsInputs();
    byId("exDate").value = expenseDateForPeriod(selectedPeriod);
    syncExpenseView();
    startWatch();
  });

  const onHashChange = () => {
    if (!location.hash.startsWith("#/expenses")) {
      unsubscribeExpenses?.();
      unsubscribeSelectedPeriod();
      window.removeEventListener("hashchange", onHashChange);
    }
  };

  window.addEventListener("hashchange", onHashChange);
}
