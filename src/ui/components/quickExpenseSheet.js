import { ROSTER, ROSTER_IDS, nameOf } from "../../config/roster";
import { formatVND } from "../../config/i18n";
import { parseVndInput } from "../../core/money";
import { mapFirestoreError } from "../../core/errors";
import { canAddExpense } from "../../core/roles";
import { resolveMemberIdFromEmail } from "../../config/members.map";
import { state, getSelectedPeriod } from "../../core/state";
import { addExpense } from "../../services/expense.service";
import { getLiveMonthSnapshot } from "../../services/live-data-hub";
import { getMonthRange } from "../../services/month-ops.service";
import { buildWholeEqualShares, toWholeVnd } from "../../domain/money/whole-vnd";
import { showToast } from "./toast";
import { openBottomSheet } from "./bottomSheet";
import {
  AMOUNT_PRESETS,
  bindQuickEntryControls,
  collectRecentNotes,
  rememberExpenseNote,
  renderAmountPresetButtons,
  renderNoteSuggestionChips,
} from "../utils/expense-quick-entry";

function todayYmd() {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function defaultExpenseDate(period) {
  const today = todayYmd();
  if (today.slice(0, 7) === period) return today;
  const [year, month] = String(period || "").split("-").map(Number);
  if (!year || !month) return today;
  const lastDay = new Date(year, month, 0).getDate();
  const day = String(Math.min(new Date().getDate(), lastDay)).padStart(2, "0");
  return `${year}-${String(month).padStart(2, "0")}-${day}`;
}

function getMyMemberId() {
  return (
    state.memberProfile?.memberId ||
    resolveMemberIdFromEmail(state.user?.email) ||
    ROSTER_IDS[0]
  );
}

function buildQuickExpensePayload({ amount, note, payerId, period }) {
  const participants = [...ROSTER_IDS];
  const debts = {};
  const equalShares = buildWholeEqualShares(amount, participants);

  for (const memberId of participants) {
    if (memberId === payerId) continue;
    const share = equalShares[memberId] || 0;
    if (share > 0) debts[memberId] = share;
  }

  return {
    date: defaultExpenseDate(period),
    amount,
    payerId,
    participants,
    debts,
    note,
    createdBy: state.user.uid,
  };
}

export function openQuickExpenseSheet({ onSaved } = {}) {
  if (!state.user || !state.groupId) {
    showToast({
      title: "Chưa đăng nhập",
      message: "Hãy đăng nhập để ghi chi.",
      variant: "warning",
    });
    return null;
  }

  if (!canAddExpense(state.memberProfile, state.user?.email || "")) {
    showToast({
      title: "Không có quyền",
      message: "Tài khoản chưa được gán thành viên trong nhóm.",
      variant: "danger",
    });
    return null;
  }

  const period = getSelectedPeriod();
  const { expenses } = getLiveMonthSnapshot();
  const recentNotes = collectRecentNotes(expenses);
  const payerId = getMyMemberId();

  const content = `
    <form class="quick-expense" id="quickExpenseForm">
      <p class="quick-expense__hint">
        Chia đều cho ${ROSTER.length} người • ${period}
      </p>

      <label class="form-label" for="quickExAmount">Số tiền</label>
      <input
        id="quickExAmount"
        class="form-control form-control-lg expense-amount-input"
        inputmode="numeric"
        placeholder="VD: 100000"
        autocomplete="off"
      />
      <div class="quick-chip-row mt-2" id="quickAmountPresets">
        ${renderAmountPresetButtons(AMOUNT_PRESETS)}
      </div>

      <label class="form-label mt-3" for="quickExNote">Ghi chú</label>
      <input
        id="quickExNote"
        class="form-control"
        placeholder="VD: Đi chợ, Ăn trưa..."
        autocomplete="off"
      />
      ${
        recentNotes.length
          ? `<div class="quick-chip-row mt-2" id="quickNoteSuggestions">${renderNoteSuggestionChips(recentNotes)}</div>`
          : ""
      }

      <label class="form-label mt-3" for="quickExPayer">Người trả</label>
      <select id="quickExPayer" class="form-select">
        ${ROSTER.map(
          (member) =>
            `<option value="${member.id}" ${member.id === payerId ? "selected" : ""}>${member.name}</option>`,
        ).join("")}
      </select>

      <div class="quick-expense__footer">
        <a class="btn btn-outline-secondary" href="#/expenses?quick=1" data-sheet-action="true">Form đầy đủ</a>
        <button type="submit" class="btn btn-primary" id="quickExSave">
          Lưu nhanh
        </button>
      </div>
      <div id="quickExMsg" class="small text-danger mt-2"></div>
    </form>
  `;

  const sheet = openBottomSheet({
    title: "Ghi chi nhanh",
    variant: "quick-expense",
    content,
  });

  const form = sheet.root.querySelector("#quickExpenseForm");
  const amountInput = sheet.root.querySelector("#quickExAmount");
  const noteInput = sheet.root.querySelector("#quickExNote");
  const payerSelect = sheet.root.querySelector("#quickExPayer");
  const saveButton = sheet.root.querySelector("#quickExSave");
  const messageEl = sheet.root.querySelector("#quickExMsg");

  bindQuickEntryControls(sheet.root, {
    onAmountPreset: (amount) => {
      amountInput.value = String(amount);
      amountInput.focus();
    },
    onNoteSuggestion: (note) => {
      noteInput.value = note;
      noteInput.focus();
    },
  });

  form?.addEventListener("submit", async (event) => {
    event.preventDefault();
    messageEl.textContent = "";

    const amount = toWholeVnd(parseVndInput(amountInput.value));
    const note = noteInput.value.trim();
    const selectedPayer = payerSelect.value;

    if (!amount || amount <= 0) {
      messageEl.textContent = "Số tiền phải lớn hơn 0.";
      return;
    }

    const date = defaultExpenseDate(period);
    const { start, end } = getMonthRange(period);
    if (date < start || date >= end) {
      messageEl.textContent = `Ngày ghi chi phải thuộc tháng ${period}.`;
      return;
    }

    saveButton.disabled = true;
    saveButton.textContent = "Đang lưu...";

    try {
      const payload = buildQuickExpensePayload({
        amount,
        note,
        payerId: selectedPayer,
        period,
      });

      await addExpense(state.groupId, payload);
      rememberExpenseNote(note);

      showToast({
        title: "Đã lưu",
        message: `${formatVND(amount)} • ${note || "Không ghi chú"}`,
        variant: "success",
      });

      onSaved?.(payload);
      sheet.close();
    } catch (error) {
      messageEl.textContent = mapFirestoreError(error, "Lưu thất bại.");
      showToast({
        title: "Thất bại",
        message: messageEl.textContent,
        variant: "danger",
      });
    } finally {
      saveButton.disabled = false;
      saveButton.textContent = "Lưu nhanh";
    }
  });

  requestAnimationFrame(() => amountInput?.focus());

  return sheet;
}
