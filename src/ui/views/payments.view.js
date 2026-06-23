import { getRouteQuery } from "../../core/routing";
import { state } from "../../core/state";
import { ROSTER, nameOf } from "../../config/roster";
import { getCurrentUserLabel, getUserLabel } from "../../core/display-name";
import { formatVND } from "../../config/i18n";
import { buildMonthlySettlementView } from "../../domain/matrix/compute";
import { getMonthRange, lastDayOfPeriod } from "../../core/period";
import { renderMatrixTable } from "../components/matrixTable";
import { renderIconButton, renderListRow } from "../components/listRow";
import { renderMetricGrid } from "../components/metricTile";
import { renderSectionHeader } from "../components/sectionHeader";
import { renderSkeletonStatGrid } from "../components/skeletonCard";
import { renderSkeletonList } from "../components/skeletonList";

const PERIOD_KEY_REGEX = /^\d{4}-\d{2}$/;
export const PAYMENT_TABS = [
  { id: "suggest", label: "Gợi ý" },
  { id: "history", label: "Lịch sử" },
  { id: "matrix", label: "Ma trận" },
];

export function resolveActiveTab(options = {}) {
  const queryTab = getRouteQuery().get("tab");
  if (queryTab && PAYMENT_TABS.some((tab) => tab.id === queryTab)) {
    return queryTab;
  }
  if (options.openVerification || options.aliasMode) return "matrix";
  return "suggest";
}

function roundWhole(amount) {
  const value = Number(amount || 0);
  if (!Number.isFinite(value)) return 0;
  return Math.round(value);
}

export function formatPaymentVND(amount) {
  return formatVND(roundWhole(amount));
}

export function payableSettlementAmount(amount) {
  return Math.max(0, roundWhole(amount));
}

export function settlementActionValue(item, debtPeriod = "") {
  const period = debtPeriod ? `|${debtPeriod}` : "";
  return `${item.fromId}|${item.toId}|${payableSettlementAmount(item.amount)}${period}`;
}

export function parseSettlementAction(value, viewingPeriod = "") {
  const parts = String(value || "").split("|");
  const [fromId, toId, amountString, debtPeriod] = parts;

  return {
    fromId: fromId || "",
    toId: toId || "",
    amount: payableSettlementAmount(amountString),
    debtPeriod: debtPeriod || viewingPeriod || "",
  };
}

export function paymentDateBoundsForPeriod(period) {
  const { start, end } = getMonthRange(period);
  const lastDay = lastDayOfPeriod(period);
  return {
    minDate: start,
    maxDate: lastDay,
    exclusiveEnd: end,
  };
}

export function isPaymentDateInPeriod(date, period) {
  const { minDate, exclusiveEnd } = paymentDateBoundsForPeriod(period);
  const value = String(date || "");
  return value >= minDate && value < exclusiveEnd;
}

export function paymentDateHelpForPeriod(period) {
  const defaultDate = defaultPaymentDateForPeriod(period);
  const today = todayYmd();
  if (defaultDate === today) {
    return "Mặc định hôm nay — có thể sửa trong tháng này.";
  }
  return `Mặc định cuối tháng ${formatPeriodLabel(period).toLowerCase()} — có thể sửa trong tháng đó.`;
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

export function defaultPaymentDateForPeriod(period) {
  const today = todayYmd();
  if (today.startsWith(`${period}-`)) return today;
  return lastDayOfPeriod(period);
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

export function filterBeforeMonth(items, period) {
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

export function buildPreviousDebtByMonth(allExpenses, allPayments, period) {
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

export function paymentSummary(expenses, payments, settlementPlan, previousPlan) {
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
  return renderMetricGrid(
    [
      {
        label: "Chi",
        value: `${summary.expenseCount}`,
        tone: summary.expenseCount ? "neutral" : "warning",
      },
      {
        label: "Đã trả",
        value: formatPaymentVND(summary.paymentTotal),
        tone: summary.paymentTotal > 0 ? "positive" : "neutral",
      },
      {
        label: "Cấn trừ",
        value: summary.settlementCount ? `${summary.settlementCount}` : "0",
        tone: summary.settlementCount ? "danger" : "positive",
      },
      {
        label: "Nợ cũ",
        value: formatPaymentVND(summary.previousDebtTotal),
        tone: summary.previousDebtCount ? "warning" : "positive",
      },
    ],
    { columns: 4 },
  );
}

function renderSettlementList(items, canOperateMonth, debtPeriod = "") {
  if (!items.length) {
    return `<div class="empty-state empty-state--compact"><div class="empty-state__title">Đã cân bằng</div></div>`;
  }

  return `
    <div class="stack-list">
      ${items
        .map((item) => {
          const actions = canOperateMonth
            ? `
              <button class="btn btn-primary btn-sm" data-pay-full="${settlementActionValue(item, debtPeriod)}">Đủ</button>
              <button class="btn btn-outline-secondary btn-sm" data-pay-part="${settlementActionValue(item, debtPeriod)}">Một phần</button>
              ${renderIconButton({
                icon: "copy",
                label: "Copy",
                variant: "outline-secondary",
                dataAttrs: { "copy-settlement": settlementActionValue(item, debtPeriod) },
              })}
            `
            : "";

          return renderListRow({
            title: `${nameOf(item.fromId)} → ${nameOf(item.toId)}`,
            amount: formatPaymentVND(item.amount),
            actions,
            className: "list-row--settlement",
          });
        })
        .join("")}
    </div>
  `;
}

function renderPreviousDebtByMonth(timeline, canOperateMonth) {
  if (!timeline.length) return "";

  return `
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
                                              <button class="btn ui-action-pill ui-action-pill--primary section-cta" data-pay-full="${settlementActionValue(item, entry.period)}">
                                                Trả đủ
                                              </button>
                                              <button class="btn ui-action-pill ui-action-pill--secondary section-cta" data-pay-part="${settlementActionValue(item, entry.period)}">
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
  `;
}

function renderPaymentsHistory(payments, canOperate) {
  if (!payments.length) {
    return `<div class="empty-state empty-state--compact"><div class="empty-state__title">Chưa có giao dịch</div></div>`;
  }

  return `
    <div class="stack-list">
      ${sortPayments(payments)
        .map((payment) => {
          const actions = canOperate
            ? `
              ${renderIconButton({
                icon: "edit",
                label: "Sửa",
                variant: "outline-secondary",
                dataAttrs: { "edit-payment": payment.id },
              })}
              ${renderIconButton({
                icon: "trash",
                label: "Xóa",
                variant: "outline-danger",
                dataAttrs: { "delete-payment": payment.id },
              })}
            `
            : "";

          return renderListRow({
            title: `${nameOf(payment.fromId)} → ${nameOf(payment.toId)}`,
            subtitle: `${payment.date}${payment.note ? ` • ${payment.note}` : ""}`,
            amount: formatPaymentVND(payment.amount),
            actions,
          });
        })
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

export function renderLoading() {
  return `
    <div class="skeleton-card skeleton-card--stat"></div>
    ${renderSkeletonStatGrid()}
    ${renderSkeletonList({ count: 3 })}
  `;
}

function renderSuggestTab({
  summary,
  previousDebtByMonth,
  monthSettlement,
  canOperate,
  period,
}) {
  return `
    <div class="payments-page__panel">
      ${renderSummaryCards(summary)}
      <section class="payments-section">
        <div class="payments-section__head">
          <h3 class="payments-section__title">Gợi ý cấn trừ tháng này</h3>
          ${
            monthSettlement.settlementPlan.length
              ? `<button type="button" class="btn btn-outline-secondary btn-sm" id="btnCopyAllSettlement">Copy nhắc Zalo</button>`
              : ""
          }
        </div>
        ${renderSettlementList(monthSettlement.settlementPlan, canOperate, period)}
      </section>
      ${
        previousDebtByMonth.length
          ? `
            <section class="payments-section">
              <h3 class="payments-section__title">Nợ cũ theo tháng</h3>
              ${renderPreviousDebtByMonth(previousDebtByMonth, canOperate)}
            </section>
          `
          : ""
      }
    </div>
  `;
}

function renderHistoryTab(monthPayments, canOperate) {
  return `
    <div class="payments-page__panel">
      <section class="payments-section">
        <h3 class="payments-section__title">Lịch sử thanh toán tháng này</h3>
        ${renderPaymentsHistory(monthPayments, canOperate)}
      </section>
    </div>
  `;
}

function renderMatrixTab(period, monthExpenses, monthPayments, monthSettlement) {
  return `
    <div class="payments-page__panel">
      ${renderVerificationSummary(monthSettlement)}
      ${renderVerificationAuditPanels(
        period,
        monthExpenses,
        monthPayments,
        monthSettlement,
      )}
    </div>
  `;
}

export function renderTabPanels({
  activeTab,
  period,
  summary,
  previousDebtByMonth,
  monthExpenses,
  monthPayments,
  monthSettlement,
  canOperate,
}) {
  if (activeTab === "history") {
    return renderHistoryTab(monthPayments, canOperate);
  }

  if (activeTab === "matrix") {
    return renderMatrixTab(
      period,
      monthExpenses,
      monthPayments,
      monthSettlement,
    );
  }

  return renderSuggestTab({
    summary,
    previousDebtByMonth,
    monthSettlement,
    canOperate,
    period,
  });
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
