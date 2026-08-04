import { buildHash } from "../../../core/routing";
import { formatVND } from "../../../config/i18n";
import { ROSTER } from "../../../config/roster";
import { getMemberLabelById } from "../../../core/display-name";
import { getMonthRange } from "../../../services/month-ops.service";
import { renderBtn } from "../../components/actionButton";
import { renderMetricGrid } from "../../components/metricTile";
import { renderProgressRing } from "../../components/progressRing";
import { renderSkeletonList } from "../../components/skeletonList";
import { renderSkeletonStatGrid } from "../../components/skeletonCard";
import { buildMonthlySettlementView } from "../../../domain/matrix/compute";

export function renderDashboardLoading() {
  return `
    <div class="skeleton-card skeleton-card--stat"></div>
    ${renderSkeletonStatGrid()}
    ${renderSkeletonList({ count: 2 })}
  `;
}

function clampPercent(value) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, value));
}

function nameOf(memberId) {
  return getMemberLabelById(memberId);
}

function sumAmount(items = []) {
  return items.reduce((sum, item) => sum + Number(item?.amount || 0), 0);
}

function periodKeyOfDate(date) {
  const value = String(date || "").slice(0, 7);
  return /^\d{4}-\d{2}$/.test(value) ? value : null;
}

function formatPeriodLabel(period) {
  const [year, month] = String(period || "").split("-");
  if (!year || !month) return period || "-";
  return `Tháng ${Number(month)} năm ${year}`;
}

function listHistoricalPeriods(expenses = [], payments = [], period) {
  const { start } = getMonthRange(period);
  const months = new Set();
  for (const item of expenses) {
    const date = String(item?.date || "");
    if (date < start) {
      const monthKey = periodKeyOfDate(date);
      if (monthKey) months.add(monthKey);
    }
  }
  for (const item of payments) {
    const date = String(item?.date || "");
    if (date < start) {
      const monthKey = periodKeyOfDate(date);
      if (monthKey) months.add(monthKey);
    }
  }
  return [...months].sort();
}

export function buildPreviousDebtTimeline(expenses = [], payments = [], period) {
  const timeline = [];
  let cumulativeExpenses = [];
  let cumulativePayments = [];
  for (const monthKey of listHistoricalPeriods(expenses, payments, period)) {
    const monthExpenses = expenses.filter((item) => String(item?.date || "").startsWith(`${monthKey}-`));
    const monthPayments = payments.filter((item) => String(item?.date || "").startsWith(`${monthKey}-`));
    cumulativeExpenses = cumulativeExpenses.concat(monthExpenses);
    cumulativePayments = cumulativePayments.concat(monthPayments);
    const carryPlan = buildMonthlySettlementView({
      roster: ROSTER,
      expenses: cumulativeExpenses,
      payments: cumulativePayments,
    }).settlementPlan;
    timeline.push({
      period: monthKey,
      expenseTotal: sumAmount(monthExpenses),
      paymentTotal: sumAmount(monthPayments),
      carryTotal: sumAmount(carryPlan),
      carryCount: carryPlan.length,
    });
  }
  return timeline;
}

export function summarizeRentForMember(rentDoc, memberId) {
  if (!rentDoc || !memberId) return null;
  const payerId = rentDoc.payerId || "hung";
  const shares = rentDoc.shares || {};
  const paid = rentDoc.paid || {};
  const total = Number(rentDoc.total || 0);
  if (memberId === payerId) {
    const myShare = Number(shares[payerId] || 0);
    const expectedFromOthers = Math.max(0, total - myShare);
    const collectedFromOthers = Object.entries(paid).reduce(
      (sum, [id, value]) => sum + (id === payerId ? 0 : Number(value || 0)),
      0,
    );
    return { mode: "payer", total, myShare, collectedFromOthers, expectedFromOthers, remaining: Math.max(0, expectedFromOthers - collectedFromOthers) };
  }
  const share = Number(shares[memberId] || 0);
  const alreadyPaid = Number(paid[memberId] || 0);
  return { mode: "member", total, share, alreadyPaid, remaining: Math.max(0, share - alreadyPaid) };
}

export function renderHeroRow(stats) {
  return renderMetricGrid([
    { label: "Chi", value: formatVND(stats.expenseTotal), href: "#/expenses", tone: "neutral" },
    { label: "Đã trả", value: formatVND(stats.paymentTotal), href: buildHash("/payments", { tab: "history" }), tone: stats.paymentTotal > 0 ? "positive" : "neutral" },
    { label: "Nhà", value: formatVND(stats.rentTotal), href: "#/rent", tone: stats.rentTotal > 0 ? "warning" : "neutral" },
    { label: "Cấn trừ", value: stats.settlementCount ? `${stats.settlementCount}` : "0", href: buildHash("/payments", { tab: "suggest" }), tone: stats.settlementCount ? "danger" : "positive" },
  ], { columns: 4 });
}

export function renderRentSection(rentSummary) {
  const openRent = renderBtn({ label: "Mở", href: "#/rent", variant: "outline-secondary", size: "sm" });
  if (!rentSummary) {
    return `<section class="dash-panel"><div class="dash-panel__body"><div class="dash-panel__head"><h3 class="dash-panel__title">Tiền nhà</h3>${openRent}</div>${renderBtn({ label: "Nhập tiền nhà", href: "#/rent", variant: "primary", size: "sm" })}</div></section>`;
  }
  const percent = rentSummary.mode === "payer"
    ? clampPercent(rentSummary.expectedFromOthers <= 0 ? 100 : (rentSummary.collectedFromOthers / rentSummary.expectedFromOthers) * 100)
    : clampPercent(rentSummary.share <= 0 ? 100 : (rentSummary.alreadyPaid / rentSummary.share) * 100);
  const cards = rentSummary.mode === "payer"
    ? [{ label: "Bạn", value: formatVND(rentSummary.myShare), tone: "neutral" }, { label: "Đã thu", value: formatVND(rentSummary.collectedFromOthers), tone: "positive" }, { label: "Thiếu", value: formatVND(rentSummary.remaining), tone: rentSummary.remaining > 0 ? "danger" : "positive" }]
    : [{ label: "Cần trả", value: formatVND(rentSummary.share), tone: "warning" }, { label: "Đã trả", value: formatVND(rentSummary.alreadyPaid), tone: "positive" }, { label: "Thiếu", value: formatVND(rentSummary.remaining), tone: rentSummary.remaining > 0 ? "danger" : "positive" }];
  const statusLabel = rentSummary.remaining > 0 ? `Thiếu ${formatVND(rentSummary.remaining)}` : "Đủ";
  const statusTone = rentSummary.remaining > 0 ? "warning" : "positive";
  return `
    <section class="dash-panel rent-status-card"><div class="dash-panel__body">
      <div class="dash-panel__head rent-status-card__head"><h3 class="dash-panel__title">Tiền nhà</h3>${openRent}</div>
      <div class="rent-status-card__body">
        <div class="rent-status-card__ring">${renderProgressRing({ percent, size: 96, stroke: 9 })}<span class="rent-status-card__badge rent-status-card__badge--${statusTone}">${statusLabel}</span></div>
        <div class="rent-status-card__stats">${cards.map((card) => `<div class="rent-status-card__stat rent-status-card__stat--${card.tone || "neutral"}"><span class="rent-status-card__stat-label">${card.label}</span><strong class="rent-status-card__stat-value">${card.value}</strong></div>`).join("")}</div>
      </div>
    </div></section>
  `;
}

export function renderPreviousDebtSection(items, timeline = [], loading = false) {
  if (loading) {
    return `<details class="dash-panel dash-panel--compact" id="previousDebtPanel"><summary class="dash-panel__summary">Nợ cũ</summary><div class="dash-panel__body dash-panel__body--compact">${renderSkeletonList({ count: 2 })}</div></details>`;
  }
  if (!items.length) return "";
  return `
    <details class="dash-panel dash-panel--compact" id="previousDebtPanel"><summary class="dash-panel__summary"><span>Nợ cũ</span><span class="filter-pill filter-pill--warning">${formatVND(sumAmount(items))}</span></summary>
      <div class="dash-panel__body dash-panel__body--compact">
        <div class="compact-list">${items.slice(0, 4).map((item) => `<div class="compact-list__row"><span>${nameOf(item.fromId)} → ${nameOf(item.toId)}</span><strong>${formatVND(item.amount)}</strong></div>`).join("")}</div>
        ${timeline.length ? `<details class="mt-2"><summary class="small text-secondary">Theo tháng (${timeline.length})</summary><div class="compact-list mt-2">${timeline.slice(-3).map((entry) => `<div class="compact-list__row"><span>${formatPeriodLabel(entry.period)}</span><strong>${formatVND(entry.carryTotal)}</strong></div>`).join("")}</div></details>` : ""}
        ${renderBtn({ label: "Ghi cấn trừ", href: buildHash("/payments", { tab: "suggest" }), variant: "outline-secondary", size: "sm", className: "mt-2" })}
      </div>
    </details>
  `;
}

export function computePersonalDebt(myMemberId, rentSummary, settlementPlan, hasRentDoc) {
  const rentDebt = rentSummary?.mode === "member" ? Math.max(0, Number(rentSummary.remaining || 0)) : 0;
  const expenseDebt = (settlementPlan || []).reduce(
    (sum, item) => sum + (item.fromId === myMemberId ? Math.max(0, Number(item.amount || 0)) : 0),
    0,
  );
  const total = rentDebt + expenseDebt;
  const breakdown = [];
  if (rentDebt > 0) breakdown.push({ label: "Tiền nhà", amount: rentDebt });
  if (expenseDebt > 0) breakdown.push({ label: "Chi tiêu chung", amount: expenseDebt });
  const status = total > 0 ? "debt" : !hasRentDoc ? "pending" : "settled";
  return { total, breakdown, status, statusLabel: status === "debt" ? "Còn nợ" : status === "pending" ? "Chưa nhập nhà" : "Ổn" };
}
