import { logout } from "../../services/auth.service";
import {
  getSelectedPeriod,
  setSelectedPeriod,
  state,
  subscribeSelectedPeriod,
} from "../../core/state";
import { ROSTER, nameOf } from "../../config/roster";
import { getCurrentUserLabel, getUserLabel } from "../../core/display-name";
import { formatVND } from "../../config/i18n";
import { parseVndInput } from "../../core/money";
import { mapFirestoreError } from "../../core/errors";
import { buildMonthlySettlementView } from "../../domain/matrix/compute";
import { watchExpenses } from "../../services/expense.service";
import {
  watchPayments,
  addPayment,
  removePayment,
  updatePayment,
} from "../../services/payment.service";
import { getMonthRange } from "../../services/month-ops.service";
import { openConfirmModal } from "../components/confirmModal";
import { openPaymentEditModal } from "../components/paymentEditModal";
import { renderMatrixTable } from "../components/matrixTable";
import { openPaymentModal } from "../components/paymentModal";
import { showToast } from "../components/toast";
import { renderAppShell } from "../layout/app-shell";
import { mountPrimaryNav } from "../layout/navbar";
import { renderMoneyStatCard } from "../components/moneyStatCard";
import { renderSectionHeader } from "../components/sectionHeader";

const PERIOD_KEY_REGEX = /^\d{4}-\d{2}$/;

function roundWhole(amount) {
  const value = Number(amount || 0);
  if (!Number.isFinite(value)) return 0;
  return Math.round(value);
}

function formatPaymentVND(amount) {
  return formatVND(roundWhole(amount));
}

function payableSettlementAmount(amount) {
  return Math.max(0, roundWhole(amount));
}

function settlementActionValue(item) {
  return `${item.fromId}|${item.toId}|${payableSettlementAmount(item.amount)}`;
}

function sumAmount(items = []) {
  return items.reduce((sum, item) => sum + Number(item?.amount || 0), 0);
}

function todayYmd() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function defaultPaymentDateForPeriod(period) {
  const today = todayYmd();
  if (today.startsWith(`${period}-`)) return today;
  return `${period}-01`;
}

function formatPeriodLabel(period) {
  const [year, month] = String(period || "").split("-");
  if (!year || !month) return period || "-";
  return `Tháng ${Number(month)} năm ${year}`;
}

function sortPayments(payments) {
  return [...payments].sort((left, right) => {
    const dateDiff = String(right.date || "").localeCompare(
      String(left.date || ""),
    );
    if (dateDiff !== 0) return dateDiff;
    return String(right.id || "").localeCompare(String(left.id || ""));
  });
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

function inDateRange(date, start, end) {
  const value = String(date || "");
  return value >= start && value < end;
}

function beforeDate(date, start) {
  return String(date || "") < start;
}

function filterMonth(items, period) {
  const { start, end } = getMonthRange(period);
  return (items || []).filter((item) => inDateRange(item.date, start, end));
}

function filterBeforeMonth(items, period) {
  const { start } = getMonthRange(period);
  return (items || []).filter((item) => beforeDate(item.date, start));
}

function toPeriodKey(date) {
  const key = String(date || "").slice(0, 7);
  return PERIOD_KEY_REGEX.test(key) ? key : null;
}

function collectPreviousPeriodKeys(allExpenses, allPayments, period) {
  const { start } = getMonthRange(period);
  const keys = new Set();

  for (const item of allExpenses || []) {
    const date = String(item?.date || "");
    if (date >= start) continue;
    const key = toPeriodKey(date);
    if (key) keys.add(key);
  }

  for (const item of allPayments || []) {
    const date = String(item?.date || "");
    if (date >= start) continue;
    const key = toPeriodKey(date);
    if (key) keys.add(key);
  }

  return [...keys].sort();
}

function settlementPairKey(item) {
  return `${item?.fromId || ""}|${item?.toId || ""}`;
}

function buildPreviousDebtByMonth(allExpenses, allPayments, period) {
  const keys = collectPreviousPeriodKeys(allExpenses, allPayments, period);
  const timeline = [];

  let cumulativeExpenses = [];
  let cumulativePayments = [];

  for (const key of keys) {
    const expenses = filterMonth(allExpenses, key);
    const payments = filterMonth(allPayments, key);

    cumulativeExpenses = cumulativeExpenses.concat(expenses);
    cumulativePayments = cumulativePayments.concat(payments);

    const endOfMonthSettlement = buildMonthlySettlementView({
      roster: ROSTER,
      expenses: cumulativeExpenses,
      payments: cumulativePayments,
    });

    if (endOfMonthSettlement.settlementPlan.length > 0) {
      timeline.push({
        period: key,
        monthExpenseTotal: sumAmount(expenses),
        monthPaymentTotal: sumAmount(payments),
        carryTotal: sumAmount(endOfMonthSettlement.settlementPlan),
        carryCount: endOfMonthSettlement.settlementPlan.length,
        carryPlan: endOfMonthSettlement.settlementPlan.map((item) => ({
          ...item,
          amount: payableSettlementAmount(item.amount),
        })),
      });
    }
  }

  const previousExpenses = filterBeforeMonth(allExpenses, period);
  const previousPayments = filterBeforeMonth(allPayments, period);
  const remainingPreviousPlan = buildMonthlySettlementView({
    roster: ROSTER,
    expenses: previousExpenses,
    payments: previousPayments,
  }).settlementPlan;
  const remainingByPair = new Map(
    remainingPreviousPlan.map((item) => [
      settlementPairKey(item),
      payableSettlementAmount(item.amount),
    ]),
  );

  return timeline
    .map((entry) => {
      const carryPlan = [];

      for (const item of entry.carryPlan) {
        const pairKey = settlementPairKey(item);
        const available = remainingByPair.get(pairKey) || 0;
        const amount = Math.min(available, payableSettlementAmount(item.amount));

        if (amount > 0) {
          carryPlan.push({
            ...item,
            amount,
          });
          remainingByPair.set(pairKey, available - amount);
        }
      }

      if (!carryPlan.length) return null;

      return {
        ...entry,
        carryPlan,
        carryTotal: sumAmount(carryPlan),
        carryCount: carryPlan.length,
      };
    })
    .filter(Boolean);
}

function paymentSummary(expenses, payments, settlementPlan, previousPlan) {
  return {
    expenseCount: expenses.length,
    paymentCount: payments.length,
    settlementCount: settlementPlan.length,
    paymentTotal: sumAmount(payments),
    previousDebtCount: previousPlan.length,
    previousDebtTotal: sumAmount(previousPlan),
  };
}

function renderSummaryCards(summary) {
  return `
    <section class="money-grid money-grid--4">
      ${renderMoneyStatCard({
        label: "Chi tiêu tháng",
        value: `${summary.expenseCount} khoản`,
        hint: `Đang xem ${summary.expenseCount} khoản chi trong tháng`,
        tone: summary.expenseCount ? "neutral" : "warning",
        size: "lg",
      })}
      ${renderMoneyStatCard({
        label: "Thanh toán tháng",
        value: formatPaymentVND(summary.paymentTotal),
        hint: `${summary.paymentCount} giao dịch đã ghi nhận`,
        tone: summary.paymentTotal > 0 ? "positive" : "neutral",
        size: "lg",
      })}
      ${renderMoneyStatCard({
        label: "Cấn trừ tháng",
        value: summary.settlementCount
          ? `${summary.settlementCount} dòng`
          : "0 dòng",
        hint: summary.settlementCount
          ? "Còn khoản cần xử lý trong tháng"
          : "Đã cân bằng trong tháng",
        tone: summary.settlementCount ? "danger" : "positive",
        size: "lg",
      })}
      ${renderMoneyStatCard({
        label: "Nợ cũ còn treo",
        value: formatPaymentVND(summary.previousDebtTotal),
        hint: summary.previousDebtCount
          ? `${summary.previousDebtCount} khoản từ các tháng trước`
          : "Không còn khoản nợ cũ",
        tone: summary.previousDebtCount ? "warning" : "positive",
        size: "lg",
      })}
    </section>
  `;
}

function renderSettlementList(items, canOperateMonth, options = {}) {
  const {
    label = "Cần thanh toán trong tháng",
    emptyText = "Nếu chỉ tính trong tháng đang xem, các khoản nợ đã được cân bằng.",
  } = options;

  if (!items.length) {
    return `
      <div class="empty-state">
        <div class="empty-state__title">Không còn khoản nào cần thanh toán</div>
        ${emptyText ? `<div class="empty-state__text">${emptyText}</div>` : ""}
      </div>
    `;
  }

  return `
    <div class="stack-list">
      ${items
        .map(
          (item) => `
            <article class="money-card money-card--danger money-card--lg">
              <div class="action-list__head">
                <div>
                  <div class="money-card__label">${label}</div>
                  <div class="action-list__title">${nameOf(item.fromId)} -> ${nameOf(item.toId)}</div>
                </div>
                <div class="money-card__value">${formatPaymentVND(item.amount)}</div>
              </div>
              ${
                canOperateMonth
                  ? `
                    <div class="d-flex flex-wrap gap-2 mt-3">
                      <button class="btn ui-action-pill ui-action-pill--primary section-cta" data-pay-full="${settlementActionValue(item)}">
                        Trả đủ
                      </button>
                      <button class="btn ui-action-pill ui-action-pill--secondary section-cta" data-pay-part="${settlementActionValue(item)}">
                        Trả một phần
                      </button>
                    </div>
                  `
                  : `
                    <div class="money-card__hint mt-2">
                      Chỉ người vận hành tháng mới ghi nhận được thanh toán từ dòng cấn trừ.
                    </div>
                  `
              }
            </article>
          `,
        )
        .join("")}
    </div>
  `;
}

function renderPreviousDebtByMonth(timeline, canOperateMonth) {
  if (!timeline.length) return "";

  return `
    <details class="card section-card section-toggle">
      <summary class="card-header section-toggle__summary">
        <div>
          <div class="section-toggle__title">Chi tiết nợ từng tháng trước</div>
          <div class="section-toggle__subtitle">
            Liệt kê rõ từng tháng trước: chi tiêu, thanh toán và nợ còn treo cuối tháng.
          </div>
        </div>
        <span class="filter-pill filter-pill--neutral">${timeline.length} tháng</span>
      </summary>
      <div class="card-body section-card__body">
        <div class="stack-list">
          ${timeline
            .slice()
            .reverse()
            .map(
              (entry) => `
                <details class="settlement-explain__month">
                  <summary class="settlement-explain__month-summary">
                    <div>
                      <div class="action-list__title">${formatPeriodLabel(entry.period)}</div>
                      <div class="action-list__meta">
                        Chi tiêu: ${formatPaymentVND(entry.monthExpenseTotal)} • Thanh toán: ${formatPaymentVND(entry.monthPaymentTotal)}
                      </div>
                    </div>
                    <div class="text-end">
                      <div class="fw-semibold">${formatPaymentVND(entry.carryTotal)}</div>
                      <div class="action-list__meta">${entry.carryCount} dòng còn treo</div>
                    </div>
                  </summary>
                  <div class="settlement-explain__month-body">
                    ${
                      entry.carryPlan.length
                        ? `
                          <div class="action-list">
                            ${entry.carryPlan
                              .slice(0, 8)
                              .map(
                                (item) => `
                                  <article class="action-list__item">
                                    <div class="action-list__head">
                                      <div>
                                        <div class="action-list__title">${nameOf(item.fromId)} -> ${nameOf(item.toId)}</div>
                                        <div class="action-list__meta">Còn nợ cuối ${formatPeriodLabel(entry.period).toLowerCase()} ${formatPaymentVND(item.amount)}</div>
                                      </div>
                                      ${
                                        canOperateMonth
                                          ? `
                                            <div class="d-flex flex-wrap gap-2">
                                              <button class="btn ui-action-pill ui-action-pill--primary section-cta" data-pay-full="${settlementActionValue(item)}">
                                                Trả đủ
                                              </button>
                                              <button class="btn ui-action-pill ui-action-pill--secondary section-cta" data-pay-part="${settlementActionValue(item)}">
                                                Trả một phần
                                              </button>
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
                        `
                        : `
                          <div class="empty-state">
                            <div class="empty-state__title">Không còn nợ cuối tháng</div>
                            <div class="empty-state__text">Các khoản của tháng này đã được cân bằng khi chốt tháng.</div>
                          </div>
                        `
                    }
                  </div>
                </details>
              `,
            )
            .join("")}
        </div>
      </div>
    </details>
  `;
}

function renderPaymentsHistory(payments, canOperate) {
  if (!payments.length) {
    return `
      <div class="empty-state">
        <div class="empty-state__title">Chưa có thanh toán nào trong tháng</div>
        <div class="empty-state__text">
          Lịch sử thanh toán của tháng đang xem sẽ hiển thị ở đây.
        </div>
      </div>
    `;
  }

  return `
    <div class="stack-list">
      ${sortPayments(payments)
        .map(
          (payment) => `
            <article class="action-list__item">
              <div class="action-list__head">
                <div>
                  <div class="action-list__title">${payment.date} • ${nameOf(payment.fromId)} -> ${nameOf(payment.toId)}</div>
                  <div class="action-list__meta">${formatPaymentVND(payment.amount)}</div>
                  <div class="action-list__meta">${payment.note || "Không có ghi chú"}</div>
                  <div class="action-list__meta">Người tạo: ${creatorLabel(payment.createdBy)}</div>
                </div>
                ${
                  canOperate
                    ? `
                      <div class="d-flex flex-wrap gap-2">
                        <button class="btn ui-action-pill ui-action-pill--secondary section-cta" data-edit-payment="${payment.id}">
                          Sửa ngày / ghi chú
                        </button>
                        <button class="btn ui-action-pill ui-action-pill--danger section-cta" data-delete-payment="${payment.id}">
                          Xóa
                        </button>
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
  `;
}

function renderVerificationSummary(settlement) {
  return `
    <div class="summary-strip">
      <div class="summary-strip__item">
        <span class="summary-strip__label">Tổng nợ gốc</span>
        <span class="summary-strip__value">${formatPaymentVND(settlement?.totals?.grossDebtTotal || 0)}</span>
      </div>
      <div class="summary-strip__item">
        <span class="summary-strip__label">Payment đã áp</span>
        <span class="summary-strip__value">${formatPaymentVND(settlement?.paymentsAppliedTotal || 0)}</span>
      </div>
      <div class="summary-strip__item">
        <span class="summary-strip__label">Còn phải thanh toán</span>
        <span class="summary-strip__value">${formatPaymentVND(settlement?.totals?.remainingDebtTotal || 0)}</span>
      </div>
    </div>
  `;
}

function renderAppliedPaymentsList(payments) {
  if (!payments.length) {
    return `
      <div class="empty-state">
        <div class="empty-state__title">Chưa có payment nào trong tháng</div>
        <div class="empty-state__text">
          Bảng đối chiếu đang lấy nguyên nợ gốc của tháng này để tính số dư còn lại.
        </div>
      </div>
    `;
  }

  return `
    <div class="action-list">
      ${sortPayments(payments)
        .map(
          (payment) => `
            <article class="action-list__item">
              <div class="action-list__head">
                <div>
                  <div class="action-list__title">${payment.date} • ${nameOf(payment.fromId)} -> ${nameOf(payment.toId)}</div>
                  <div class="action-list__meta">${formatPaymentVND(payment.amount)}</div>
                </div>
              </div>
            </article>
          `,
        )
        .join("")}
    </div>
  `;
}

function renderReadonlySettlementList(items, emptyText) {
  if (!items.length) {
    return `
      <div class="empty-state">
        <div class="empty-state__title">Không còn cấn trừ nào trong tháng</div>
        <div class="empty-state__text">${emptyText}</div>
      </div>
    `;
  }

  return `
    <div class="action-list">
      ${items
        .map(
          (item) => `
            <article class="action-list__item">
              <div class="action-list__head">
                <div>
                  <div class="action-list__title">${nameOf(item.fromId)} -> ${nameOf(item.toId)}</div>
                  <div class="action-list__meta">Còn lại ${formatPaymentVND(item.amount)}</div>
                </div>
              </div>
            </article>
          `,
        )
        .join("")}
    </div>
  `;
}

function renderLoading() {
  return `
    <div class="card">
      <div class="card-body d-flex align-items-center gap-3">
        <div class="spinner-border" role="status" aria-label="Loading"></div>
        <div>
          <div class="fw-semibold">Đang tải dữ liệu thanh toán...</div>
          <div class="text-secondary small">Vui lòng chờ trong giây lát.</div>
        </div>
      </div>
    </div>
  `;
}

function renderVerificationPanels(period, expenses, payments, settlement) {
  if (!expenses.length && !payments.length) {
    return `
      <div class="empty-state">
        <div class="empty-state__title">Tháng này chưa có dữ liệu đối chiếu</div>
        <div class="empty-state__text">
          Chưa có khoản chi hoặc thanh toán nào trong ${formatPeriodLabel(period).toLowerCase()} để tạo ma trận đối chiếu.
        </div>
      </div>
    `;
  }

  return `
    <section class="card">
      <div class="card-body section-card__body">
        ${renderSectionHeader({
          title: "Ma trận nợ gốc",
          subtitle: "Bảng nợ phát sinh từ các khoản chi trong tháng đã chọn.",
        })}
        ${renderMatrixTable({
          members: ROSTER,
          matrix: settlement.grossMatrix,
          formatAmount: formatPaymentVND,
          title: "Ma trận nợ gốc từ chi tiêu",
        })}
      </div>
    </section>

    <section class="card">
      <div class="card-body section-card__body">
        ${renderSectionHeader({
          title: "Số dư sau khi áp payment",
          subtitle:
            "Số dư của riêng tháng này sau khi đã trừ các payment ghi nhận trong tháng.",
        })}
        ${renderBalancesList(settlement.balances)}
      </div>
    </section>
  `;
}

function renderBalancesList(balances) {
  return `
    <div class="stack-list">
      ${ROSTER.map((member) => {
        const value = Number(balances?.[member.id] || 0);
        const absolute = Math.abs(value);
        const label =
          value > 0
            ? "Đã trả nhiều hơn phần đang nợ"
            : value < 0
              ? "Đang còn nợ trong tháng"
              : "Đã cân bằng";

        return `
          <div class="action-list__item">
            <div class="action-list__head">
              <div>
                <div class="action-list__title">${nameOf(member.id)}</div>
                <div class="action-list__meta">${label}</div>
              </div>
              <div class="fw-semibold">${formatPaymentVND(absolute)}</div>
            </div>
          </div>
        `;
      }).join("")}
    </div>
  `;
}

function renderVerificationAuditPanels(period, expenses, payments, settlement) {
  if (!expenses.length && !payments.length) {
    return `
      <div class="empty-state">
        <div class="empty-state__title">Tháng này chưa có dữ liệu đối chiếu</div>
        <div class="empty-state__text">
          Chưa có khoản chi hoặc thanh toán nào trong ${formatPeriodLabel(period).toLowerCase()} để tạo ma trận đối chiếu.
        </div>
      </div>
    `;
  }

  return `
    <section class="card">
      <div class="card-body section-card__body">
        ${renderSectionHeader({
          title: "Ma trận nợ gốc",
          subtitle: "Bảng nợ phát sinh từ các khoản chi trong tháng đã chọn.",
        })}
        ${renderMatrixTable({
          members: ROSTER,
          matrix: settlement.grossMatrix,
          formatAmount: formatPaymentVND,
          title: "Ma trận nợ gốc từ chi tiêu",
        })}
      </div>
    </section>
  `;
}

export async function renderPaymentsPage(options = {}) {
  if (!state.user || !state.groupId) return;

  const app = document.querySelector("#app");
  const canOperate = state.canOperateMonth;
  const groupId = state.groupId;
  const openVerification = options.openVerification === true;
  const aliasMode = options.aliasMode === true;
  const currentUserLabel = getCurrentUserLabel(state);
  let period = getSelectedPeriod();
  let paymentHistoryOpen = false;

  let allExpenses = [];
  let allPayments = [];
  let expensesReady = false;
  let paymentsReady = false;
  let unsubscribeExpenses = null;
  let unsubscribePayments = null;
  let disposed = false;

  function buildView() {
    const monthExpenses = filterMonth(allExpenses, period);
    const monthPayments = filterMonth(allPayments, period);
    const previousExpenses = filterBeforeMonth(allExpenses, period);
    const previousPayments = filterBeforeMonth(allPayments, period);

    const monthSettlement = buildMonthlySettlementView({
      roster: ROSTER,
      expenses: monthExpenses,
      payments: monthPayments,
    });
    const previousSettlement = buildMonthlySettlementView({
      roster: ROSTER,
      expenses: previousExpenses,
      payments: previousPayments,
    });
    const previousDebtByMonth = buildPreviousDebtByMonth(
      allExpenses,
      allPayments,
      period,
    );

    return {
      monthExpenses,
      monthPayments,
      monthSettlement,
      previousSettlement,
      previousDebtByMonth,
    };
  }

  function render() {
    if (!expensesReady || !paymentsReady) {
      app.innerHTML = renderAppShell({
        pageId: "payments",
        title: "Thanh toán",
        subtitle: "Cấn trừ theo tháng đang xem",
        meta: [`Đăng nhập: ${currentUserLabel}`, `Nhóm: ${groupId}`],
        showPeriodFilter: true,
        period,
        content: renderLoading(),
      });

      mountPrimaryNav({
        active: "payments",
        isOwner: state.isOwner,
        includeLogout: true,
        onLogout: async () => logout(),
        userLabel: currentUserLabel,
      });

      document
        .getElementById("globalPeriodPicker")
        ?.addEventListener("change", (event) => {
          setSelectedPeriod(event.target.value);
        });
      return;
    }

    const {
      monthExpenses,
      monthPayments,
      monthSettlement,
      previousSettlement,
      previousDebtByMonth,
    } = buildView();
    const summary = paymentSummary(
      monthExpenses,
      monthPayments,
      monthSettlement.settlementPlan,
      previousSettlement.settlementPlan,
    );

    app.innerHTML = renderAppShell({
      pageId: "payments",
      title: "Thanh toán",
      subtitle: "Cấn trừ và lịch sử thanh toán của tháng đang xem",
      meta: [`Đăng nhập: ${currentUserLabel}`, `Nhóm: ${groupId}`],
      showPeriodFilter: true,
      period,
      content: `
        ${
          aliasMode
            ? `
              <div class="info-banner">
                <span class="fw-semibold">Phần đối chiếu cấn trừ đã được gộp vào Thanh toán.</span>
                <span>Liên kết cũ <code>#/matrix</code> hiện mở thẳng phần đối chiếu của tháng đang xem.</span>
              </div>
            `
            : ""
        }

        <div class="info-banner">
          <span class="fw-semibold">Hiển thị cân bằng theo tháng và chi tiết nợ cũ.</span>
          <span>Bạn xem dòng cấn trừ của tháng đang chọn và nợ treo từng tháng trước (nếu có).</span>
        </div>

        ${renderSummaryCards(summary)}
        ${renderPreviousDebtByMonth(previousDebtByMonth, canOperate)}

        <section class="card section-card">
          <div class="card-body section-card__body">
            ${renderSectionHeader({
              title: "Cấn trừ tháng đang xem",
              subtitle: `Các khoản còn cần thanh toán trong ${formatPeriodLabel(period).toLowerCase()}.`,
            })}
            ${renderSettlementList(monthSettlement.settlementPlan, canOperate)}
          </div>
        </section>

        <details class="card section-card section-toggle" id="paymentHistory" ${paymentHistoryOpen ? "open" : ""}>
          <summary class="card-header section-toggle__summary">
            <div>
              <div class="section-toggle__title">Lịch sử thanh toán tháng</div>
              <div class="section-toggle__subtitle">Ẩn mặc định, mở ra khi cần kiểm tra hoặc sửa ngày / ghi chú.</div>
            </div>
            <span class="filter-pill filter-pill--neutral">${monthPayments.length} giao dịch</span>
          </summary>
          <div class="card-body section-card__body">
            ${renderPaymentsHistory(monthPayments, canOperate)}
          </div>
        </details>

        <details class="card section-card section-toggle" id="paymentsVerification" ${openVerification ? "open" : ""}>
          <summary class="card-header section-toggle__summary">
            <div>
              <div class="section-toggle__title">Xem ma trận đối chiếu theo tháng</div>
              <div class="section-toggle__subtitle">Đối chiếu riêng ${formatPeriodLabel(period).toLowerCase()} bằng nợ gốc và số dư sau payment.</div>
            </div>
            <span class="filter-pill filter-pill--neutral">${formatPeriodLabel(period)}</span>
          </summary>
          <div class="card-body section-card__body">
            ${renderSectionHeader({
              title: "Đối chiếu theo tháng",
              subtitle:
                "Ma trận dưới đây chỉ tính riêng tháng đang xem để mọi người tự kiểm tra nhanh.",
            })}
            ${renderVerificationAuditPanels(
              period,
              monthExpenses,
              monthPayments,
              monthSettlement,
            )}
          </div>
        </details>
      `,
    });

    mountPrimaryNav({
      active: "payments",
      isOwner: state.isOwner,
      includeLogout: true,
      onLogout: async () => logout(),
      userLabel: currentUserLabel,
    });

    document
      .getElementById("globalPeriodPicker")
      ?.addEventListener("change", (event) => {
        setSelectedPeriod(event.target.value);
      });

    app
      .querySelector("#paymentHistory")
      ?.addEventListener("toggle", (event) => {
        paymentHistoryOpen = event.currentTarget.open;
      });

    bindSettlementButtons(monthSettlement.settlementPlan);
    bindHistoryActions(monthPayments);
  }

  function bindSettlementButtons() {
    if (!canOperate) return;

    app.querySelectorAll("[data-pay-full]").forEach((button) => {
      button.addEventListener("click", () => {
        const [fromId, toId, amountString] = button
          .getAttribute("data-pay-full")
          .split("|");
        const amount = payableSettlementAmount(amountString);

        openPaymentModal({
          fromName: nameOf(fromId),
          toName: nameOf(toId),
          amount,
          lockAmount: true,
          defaultNote: "Trả đủ theo cấn trừ",
          parseVndInput,
          title: "Ghi nhận trả đủ",
          onSubmit: async ({ amount: paidAmount, note }) => {
            try {
              await addPayment(groupId, {
                fromId,
                toId,
                amount: paidAmount,
                date: defaultPaymentDateForPeriod(period),
                note,
                createdBy: state.user.uid,
              });
              showToast({
                title: "Thành công",
                message: "Đã ghi nhận thanh toán.",
                variant: "success",
              });
            } catch (error) {
              throw new Error(
                mapFirestoreError(error, "Không thể ghi nhận thanh toán."),
              );
            }
          },
        });
      });
    });

    app.querySelectorAll("[data-pay-part]").forEach((button) => {
      button.addEventListener("click", () => {
        const [fromId, toId, amountString] = button
          .getAttribute("data-pay-part")
          .split("|");
        const amount = payableSettlementAmount(amountString);

        openPaymentModal({
          fromName: nameOf(fromId),
          toName: nameOf(toId),
          amount,
          maxAmount: amount,
          defaultNote: "Trả một phần theo cấn trừ",
          parseVndInput,
          title: "Ghi nhận trả một phần",
          onSubmit: async ({ amount: paidAmount, note }) => {
            try {
              await addPayment(groupId, {
                fromId,
                toId,
                amount: paidAmount,
                date: defaultPaymentDateForPeriod(period),
                note,
                createdBy: state.user.uid,
              });
              showToast({
                title: "Thành công",
                message: "Đã ghi nhận thanh toán.",
                variant: "success",
              });
            } catch (error) {
              throw new Error(
                mapFirestoreError(error, "Không thể ghi nhận thanh toán."),
              );
            }
          },
        });
      });
    });
  }

  function bindHistoryActions(payments) {
    if (!canOperate) return;

    app.querySelectorAll("[data-edit-payment]").forEach((button) => {
      button.addEventListener("click", () => {
        const payment = payments.find(
          (item) => item.id === button.getAttribute("data-edit-payment"),
        );
        if (!payment) return;

        openPaymentEditModal({
          date: payment.date || "",
          note: payment.note || "",
          onSubmit: async ({ date, note }) => {
            try {
              await updatePayment(groupId, payment.id, { date, note });
              showToast({
                title: "Thành công",
                message: "Đã cập nhật ngày và ghi chú thanh toán.",
                variant: "success",
              });
            } catch (error) {
              throw new Error(
                mapFirestoreError(error, "Không thể cập nhật thanh toán."),
              );
            }
          },
        });
      });
    });

    app.querySelectorAll("[data-delete-payment]").forEach((button) => {
      button.addEventListener("click", () => {
        const payment = payments.find(
          (item) => item.id === button.getAttribute("data-delete-payment"),
        );
        if (!payment) return;

        openConfirmModal({
          title: "Xóa thanh toán",
          message: "Bạn chắc chắn muốn xóa thanh toán này?",
          meta: `${payment.date} • ${nameOf(payment.fromId)} -> ${nameOf(payment.toId)} • ${formatPaymentVND(payment.amount)}`,
          onConfirm: async () => {
            await removePayment(groupId, payment.id);
            showToast({
              title: "Đã xóa",
              message: "Thanh toán đã được xóa khỏi tháng đang xem.",
              variant: "success",
            });
          },
        });
      });
    });
  }

  const unsubscribeSelectedPeriod = subscribeSelectedPeriod((nextPeriod) => {
    if (nextPeriod === period) return;
    period = nextPeriod;
    render();
  });

  function startWatchers() {
    unsubscribeExpenses?.();
    unsubscribePayments?.();
    expensesReady = false;
    paymentsReady = false;

    unsubscribeExpenses = watchExpenses(groupId, (items) => {
      if (disposed) return;
      allExpenses = items;
      expensesReady = true;
      render();
    });

    unsubscribePayments = watchPayments(groupId, (items) => {
      if (disposed) return;
      allPayments = items;
      paymentsReady = true;
      render();
    });
  }

  const onHashChange = () => {
    const hash = location.hash || "#/dashboard";
    if (!hash.startsWith("#/payments") && !hash.startsWith("#/matrix")) {
      disposed = true;
      unsubscribeExpenses?.();
      unsubscribePayments?.();
      unsubscribeSelectedPeriod();
      window.removeEventListener("hashchange", onHashChange);
    }
  };

  window.addEventListener("hashchange", onHashChange);
  render();
  startWatchers();
}
