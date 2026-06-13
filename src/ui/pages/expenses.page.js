import { logout } from "../../services/auth.service";
import {
  getSelectedPeriod,
  state,
} from "../../core/state";
import { ROSTER, ROSTER_IDS, nameOf } from "../../config/roster";
import { getCurrentUserLabel, getUserLabel } from "../../core/display-name";
import { formatVND } from "../../config/i18n";
import { parseVndInput } from "../../core/money";
import { mapFirestoreError } from "../../core/errors";
import { showToast } from "../components/toast";
import { openConfirmModal } from "../components/confirmModal";
import { openExpenseEditModal } from "../components/expenseEditModal";
import { resolveMemberIdFromEmail } from "../../config/members.map";
import { canAddExpense } from "../../core/roles";
import { getMemberPhotoUrl, renderMemberChip } from "../components/memberChip";
import { getRouteQuery } from "../../core/routing";
import { mountAuthenticatedPage } from "../layout/page-mount";
import { getAppRoot } from "../layout/shell-controller";
import {
  addExpense,
  removeExpense,
  updateExpense,
} from "../../services/expense.service";
import { getMonthRange } from "../../services/month-ops.service";
import { subscribeLiveMonthData } from "../../services/live-data-hub";
import { watchMyMemberProfile } from "../../services/member.service";
import { renderIconButton, renderListRow } from "../components/listRow";
import { renderMoneyStatCard } from "../components/metricTile";
import {
  filterExpensesByDate,
  groupExpensesByDate,
  renderExpenseSummary,
} from "../views/expenses.view";
import { openBottomSheet } from "../components/bottomSheet";
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

function defaultExpenseDate(period) {
  const today = todayYmd();
  if (today.slice(0, 7) === period) return today;
  return expenseDateForPeriod(period);
}

export async function renderExpensesPage() {
  if (!state.user || !state.groupId) return;

  const app = getAppRoot();

  function getMyMemberId() {
    return (
      state.memberProfile?.memberId ||
      resolveMemberIdFromEmail(state.user?.email) ||
      ROSTER_IDS[0]
    );
  }
  const groupId = state.groupId;
  const canManageEntries = state.canOperateMonth;
  const composerOpenByDefault = true;
  const currentUserLabel = getCurrentUserLabel(state);

  function canAddExpenseNow() {
    return canAddExpense(state.memberProfile, state.user?.email || "");
  }

  function syncExpensePermissions() {
    const canAdd = canAddExpenseNow();
    const saveButton = byId("btnSaveExpense");
    if (saveButton) {
      saveButton.disabled = !canAdd;
    }

    const banner = byId("expensePermissionBanner");
    if (banner) {
      if (!canAdd) {
        banner.hidden = false;
        banner.textContent =
          "Tài khoản chưa được gán thành viên — không thể thêm chi tiêu.";
        banner.className = "readonly-banner";
      } else if (!canManageEntries) {
        banner.hidden = false;
        banner.textContent =
          "Mọi thành viên có thể thêm chi. Chỉ admin sửa/xóa khoản chi.";
        banner.className = "readonly-banner readonly-banner--info";
      } else {
        banner.hidden = true;
      }
    }
  }
  let selectedPeriod = getSelectedPeriod();
  let selectedExpenseDate = getRouteQuery().get("date") || "";
  let expenseListOpen = false;
  let unsubscribeExpenses = null;
  let unsubProfile = null;
  let liveExpenses = [];

  function setMessage(text = "") {
    byId("msg").textContent = text;
  }

  function visibleExpenses() {
    return filterExpensesByDate(liveExpenses, selectedExpenseDate);
  }

  function syncExpenseView() {
    const filtered = visibleExpenses();
    renderExpensesList(filtered);

    const summaryEl = byId("expensesSummary");
    if (summaryEl) {
      summaryEl.innerHTML = renderExpenseSummary(
        liveExpenses,
        filtered,
        selectedExpenseDate,
      );
    }

    const countEl = byId("expensesCount");
    if (countEl) {
      countEl.textContent = selectedExpenseDate
        ? `${filtered.length} khoản`
        : "Chưa chọn";
    }

    const filterInputEl = byId("expenseDateFilter");
    if (filterInputEl && filterInputEl.value !== selectedExpenseDate) {
      filterInputEl.value = selectedExpenseDate;
    }

    const historyPanel = byId("expensesHistory");
    if (historyPanel && selectedExpenseDate) {
      historyPanel.open = true;
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
    byId("exDate").value = defaultExpenseDate(selectedPeriod);
    byId("exAmount").value = "";
    byId("exNote").value = "";
    byId("exPayer").value = getMyMemberId();
    document.querySelectorAll(".exPart").forEach((checkbox) => {
      checkbox.checked = true;
    });
    byId("exEqual").checked = true;
    setMessage("");
    syncParticipantChips();
    renderDebtsInputs();
  }

  function isDateInSelectedPeriod(date) {
    const { start, end } = getMonthRange(selectedPeriod);
    return date >= start && date < end;
  }

  function buildExpenseDebts(amount, payerId, participants, equalSplit) {
    if (equalSplit) {
      const equalShares = buildWholeEqualShares(amount, participants);
      const debts = {};
      for (const memberId of participants) {
        if (memberId === payerId) continue;
        const share = equalShares[memberId] || 0;
        if (share > 0) debts[memberId] = share;
      }
      return debts;
    }

    return getDebtsFromInputs(payerId);
  }

  async function saveExpense() {
    if (!canAddExpenseNow()) {
      setMessage("Tài khoản chưa được gán thành viên trong nhóm.");
      return;
    }

    const date = byId("exDate").value || defaultExpenseDate(selectedPeriod);
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

    if (!isDateInSelectedPeriod(date)) {
      setMessage(`Ngày ghi chi phải thuộc tháng ${selectedPeriod}.`);
      return;
    }

    const equalSplit = byId("exEqual").checked;
    const debts = buildExpenseDebts(amount, payerId, participants, equalSplit);
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
      selectedExpenseDate = date;
      expenseListOpen = true;
      syncExpenseView();
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
      button.disabled = !canAddExpenseNow();
      button.textContent = "Lưu chi tiêu";
    }
  }

  function renderExpensesList(expenses) {
    const wrap = byId("expensesList");
    if (!wrap) return;

    if (!selectedExpenseDate) {
      wrap.innerHTML = `
        <div class="empty-state">
          <div class="empty-state__title">Chọn ngày để xem khoản chi</div>
          <div class="empty-state__text">
            Dùng bộ lọc phía trên để tìm chi tiêu theo ngày trong tháng ${selectedPeriod}.
          </div>
        </div>
      `;
      return;
    }

    if (!expenses.length) {
      wrap.innerHTML = `
        <div class="empty-state">
          <div class="empty-state__title">Không có khoản chi trong ngày này</div>
          <div class="empty-state__text">
            Không có khoản chi nào vào ${selectedExpenseDate}.
          </div>
          ${
            canAddExpenseNow()
              ? '<button type="button" class="btn btn-primary mt-3" id="btnEmptyAddExpense">Thêm chi cho ngày này</button>'
              : ""
          }
        </div>
      `;
      return;
    }

    const today = todayYmd();
    wrap.innerHTML = groupExpensesByDate(expenses)
      .map(
        ({ date, items }) => `
          <section class="expense-day-group">
            <div class="date-group__header">${date} • ${items.length} khoản</div>
            <div class="stack-list expense-day-group__list">
              ${items
                .map((expense) => {
                  const actions = canManageEntries
                    ? `
                      ${renderIconButton({
                        icon: "edit",
                        label: "Sửa",
                        variant: "outline-secondary",
                        dataAttrs: { "edit-expense": expense.id },
                      })}
                      ${renderIconButton({
                        icon: "trash",
                        label: "Xóa",
                        variant: "outline-danger",
                        dataAttrs: { "delete-expense": expense.id },
                      })}
                    `
                    : "";

                  return renderListRow({
                    leading: renderMemberChip({
                      memberId: expense.payerId,
                      label: nameOf(expense.payerId),
                      photoURL: getMemberPhotoUrl(expense.payerId, state.members),
                      size: "sm",
                    }),
                    title: nameOf(expense.payerId),
                    subtitle: expense.note || "Không có ghi chú",
                    amount: formatVND(expense.amount),
                    actions,
                    dataAttrs: { "expense-id": expense.id },
                  });
                })
                .join("")}
            </div>
          </section>
        `,
      )
      .join("");

    wrap.querySelector("#btnEmptyAddExpense")?.addEventListener("click", () => {
      const composer = byId("expenseComposer");
      if (composer) {
        composer.open = true;
        composer.scrollIntoView({ behavior: "smooth", block: "start" });
      }
      if (selectedExpenseDate && byId("exDate")) {
        byId("exDate").value = selectedExpenseDate;
      }
    });

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
    mountAuthenticatedPage({
      pageId: "expenses",
      title: "",
      meta: [],
      period: selectedPeriod,
      content: `
        <div id="expensesSummary">
          ${renderExpenseSummary(liveExpenses, [], "")}
        </div>

        <div id="expensePermissionBanner" class="readonly-banner" hidden></div>

        <section class="card section-card expense-filter">
          <div class="card-body section-card__body">
            <div class="expense-filter__row">
              <div class="expense-filter__field">
                <label class="form-label" for="expenseDateFilter">Tìm theo ngày</label>
                <input
                  id="expenseDateFilter"
                  type="date"
                  class="form-control"
                  value="${selectedExpenseDate}"
                  min="${getMonthRange(selectedPeriod).start}"
                  max="${lastDayOfPeriod(selectedPeriod)}"
                />
              </div>
              <div class="expense-filter__actions">
                <button type="button" class="btn btn-primary" id="btnApplyExpenseDate">
                  Xem
                </button>
                <button type="button" class="btn btn-outline-secondary" id="btnResetExpenseDate" disabled>
                  Bỏ lọc
                </button>
              </div>
            </div>
          </div>
        </section>

        <details class="card section-card" id="expenseComposer" ${composerOpenByDefault ? "open" : ""}>
          <summary class="card-header">Thêm khoản chi</summary>
          <div class="card-body section-card__body">
            <div class="row g-3">
              <div class="col-md-4">
                <label class="form-label">Ngày ghi chi</label>
                <input
                  id="exDate"
                  type="date"
                  class="form-control"
                  value="${defaultExpenseDate(selectedPeriod)}"
                  min="${getMonthRange(selectedPeriod).start}"
                  max="${lastDayOfPeriod(selectedPeriod)}"
                />
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

        <details class="card section-card section-toggle card--compact" id="expensesHistory" ${expenseListOpen ? "open" : ""}>
          <summary class="card-header section-toggle__summary">
            <span>Khoản chi theo ngày</span>
            <span class="filter-pill filter-pill--neutral" id="expensesCount">Chưa chọn</span>
          </summary>
          <div class="card-body section-card__body">
            <div id="expensesList"></div>
          </div>
        </details>

      `,
      nav: {
        active: "expenses",
        isOwner: state.isOwner,
        includeLogout: true,
        onLogout: async () => logout(),
        userLabel: currentUserLabel,
      },
      onPeriodChange: (nextPeriod) => {
        if (nextPeriod === selectedPeriod) return;
        selectedPeriod = nextPeriod;
        selectedExpenseDate = "";
        liveExpenses = [];
        renderPage();
        bindEvents();
        resetForm();
        syncExpenseView();
        startWatch();
      },
    });
  }

  function syncParticipantChips() {
    document.querySelectorAll(".chip-toggle").forEach((label) => {
      const checkbox = label.querySelector(".exPart");
      label.classList.toggle("is-active", !!checkbox?.checked);
    });
  }

  function bindEvents() {
    byId("btnApplyExpenseDate")?.addEventListener("click", () => {
      selectedExpenseDate = byId("expenseDateFilter")?.value || "";
      syncExpenseView();
      byId("btnResetExpenseDate").disabled = !selectedExpenseDate;
    });

    byId("expenseDateFilter")?.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        selectedExpenseDate = event.target.value || "";
        syncExpenseView();
        byId("btnResetExpenseDate").disabled = !selectedExpenseDate;
      }
    });

    byId("btnResetExpenseDate")?.addEventListener("click", () => {
      selectedExpenseDate = "";
      if (byId("expenseDateFilter")) byId("expenseDateFilter").value = "";
      byId("btnResetExpenseDate").disabled = true;
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
    unsubscribeExpenses = subscribeLiveMonthData({
      consumerId: "expenses",
      groupId,
      period: selectedPeriod,
      onUpdate: ({ expenses }) => {
        liveExpenses = expenses;
        syncExpenseView();
      },
    });
  }

  renderPage();
  bindEvents();
  resetForm();
  syncExpenseView();
  syncExpensePermissions();
  startWatch();

  const unsubProfile = watchMyMemberProfile(groupId, state.user.uid, () => {
    syncExpensePermissions();
  });

  const onHashChange = () => {
    if (!location.hash.startsWith("#/expenses")) {
      unsubscribeExpenses?.();
      unsubProfile?.();
      window.removeEventListener("hashchange", onHashChange);
    }
  };

  window.addEventListener("hashchange", onHashChange);
}
