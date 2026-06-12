import { logout } from "../../services/auth.service";
import { buildHash } from "../../core/routing";
import { getSelectedPeriod, state } from "../../core/state";
import { formatVND } from "../../config/i18n";
import { ROSTER } from "../../config/roster";
import { EMAIL_TO_MEMBER_ID } from "../../config/members.map";
import {
  getCurrentUserLabel,
  getMemberLabelById,
} from "../../core/display-name";
import {
  fetchHistoricalBefore,
  subscribeLiveMonthData,
} from "../../services/live-data-hub";
import { getMonthRange } from "../../services/month-ops.service";
import { renderBtn, renderBtnGroup } from "../components/actionButton";
import { renderBalanceHero } from "../components/balanceHero";
import {
  buildMemberSummaries,
  renderMemberSummaries,
  renderQuickCtaGrid,
} from "../components/dashOverview";
import { openOnboardingModal } from "../components/onboardingModal";
import { renderMetricGrid } from "../components/metricTile";
import { renderProgressRing } from "../components/progressRing";
import { buildDailyTotals, renderSparkline } from "../components/sparkline";
import { renderSectionHeader } from "../components/sectionHeader";
import { renderDashboardLoading } from "../views/dashboard.view";
import { renderSkeletonList } from "../components/skeletonList";
import { buildMonthlySettlementView } from "../../domain/matrix/compute";
import { mountPage } from "../layout/page-lifecycle";
import { mountAuthenticatedPage, patchMainContent } from "../layout/page-mount";
import { getAppRoot, getMainElement } from "../layout/shell-controller";
import { createRenderScheduler } from "../utils/render-scheduler";

function clampPercent(value) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, value));
}

function nameOf(memberId) {
  return getMemberLabelById(memberId);
}

function getMyMemberId() {
  return (
    state.memberProfile?.memberId ||
    EMAIL_TO_MEMBER_ID[state.user?.email || ""] ||
    null
  );
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
    if (date >= start) continue;
    const monthKey = periodKeyOfDate(date);
    if (monthKey) months.add(monthKey);
  }

  for (const item of payments) {
    const date = String(item?.date || "");
    if (date >= start) continue;
    const monthKey = periodKeyOfDate(date);
    if (monthKey) months.add(monthKey);
  }

  return [...months].sort();
}

function buildPreviousDebtTimeline(expenses = [], payments = [], period) {
  const months = listHistoricalPeriods(expenses, payments, period);
  const timeline = [];
  let cumulativeExpenses = [];
  let cumulativePayments = [];

  for (const monthKey of months) {
    const monthExpenses = expenses.filter((item) =>
      String(item?.date || "").startsWith(`${monthKey}-`),
    );
    const monthPayments = payments.filter((item) =>
      String(item?.date || "").startsWith(`${monthKey}-`),
    );

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

function summarizeRentForMember(rentDoc, memberId) {
  if (!rentDoc || !memberId) return null;

  const payerId = rentDoc.payerId || "hung";
  const shares = rentDoc.shares || {};
  const paid = rentDoc.paid || {};
  const total = Number(rentDoc.total || 0);

  if (memberId === payerId) {
    const myShare = Number(shares[payerId] || 0);
    const expectedFromOthers = Math.max(0, total - myShare);
    const collectedFromOthers = Object.entries(paid).reduce((sum, [id, value]) => {
      return id === payerId ? sum : sum + Number(value || 0);
    }, 0);
    const remaining = Math.max(0, expectedFromOthers - collectedFromOthers);

    return {
      mode: "payer",
      total,
      myShare,
      collectedFromOthers,
      expectedFromOthers,
      remaining,
    };
  }

  const share = Number(shares[memberId] || 0);
  const alreadyPaid = Number(paid[memberId] || 0);
  const remaining = Math.max(0, share - alreadyPaid);

  return {
    mode: "member",
    total,
    share,
    alreadyPaid,
    remaining,
  };
}

function renderHeroRow(stats) {
  return renderMetricGrid(
    [
      {
        label: "Chi",
        value: formatVND(stats.expenseTotal),
        href: "#/expenses",
        tone: "neutral",
      },
      {
        label: "Đã trả",
        value: formatVND(stats.paymentTotal),
        href: buildHash("/payments", { tab: "history" }),
        tone: stats.paymentTotal > 0 ? "positive" : "neutral",
      },
      {
        label: "Nhà",
        value: formatVND(stats.rentTotal),
        href: "#/rent",
        tone: stats.rentTotal > 0 ? "warning" : "neutral",
      },
      {
        label: "Cấn trừ",
        value: stats.settlementCount ? `${stats.settlementCount}` : "0",
        href: buildHash("/payments", { tab: "suggest" }),
        tone: stats.settlementCount ? "danger" : "positive",
      },
    ],
    { columns: 4 },
  );
}

function renderRentSection(rentSummary) {
  const openRent = renderBtn({
    label: "Mở",
    href: "#/rent",
    variant: "outline-secondary",
    size: "sm",
  });

  if (!rentSummary) {
    return `
      <section class="dash-panel">
        <div class="dash-panel__body">
          <div class="dash-panel__head">
            <h3 class="dash-panel__title">Tiền nhà</h3>
            ${openRent}
          </div>
          ${renderBtn({ label: "Nhập tiền nhà", href: "#/rent", variant: "primary", size: "sm" })}
        </div>
      </section>
    `;
  }

  const percent =
    rentSummary.mode === "payer"
      ? clampPercent(
          rentSummary.expectedFromOthers <= 0
            ? 100
            : (rentSummary.collectedFromOthers / rentSummary.expectedFromOthers) *
                100,
        )
      : clampPercent(
          rentSummary.share <= 0
            ? 100
            : (rentSummary.alreadyPaid / rentSummary.share) * 100,
        );

  const cards =
    rentSummary.mode === "payer"
      ? [
          { label: "Bạn", value: formatVND(rentSummary.myShare), tone: "neutral" },
          {
            label: "Đã thu",
            value: formatVND(rentSummary.collectedFromOthers),
            tone: "positive",
          },
          {
            label: "Thiếu",
            value: formatVND(rentSummary.remaining),
            tone: rentSummary.remaining > 0 ? "danger" : "positive",
          },
        ]
      : [
          {
            label: "Cần trả",
            value: formatVND(rentSummary.share),
            tone: "warning",
          },
          {
            label: "Đã trả",
            value: formatVND(rentSummary.alreadyPaid),
            tone: "positive",
          },
          {
            label: "Thiếu",
            value: formatVND(rentSummary.remaining),
            tone: rentSummary.remaining > 0 ? "danger" : "positive",
          },
        ];

  const statusLabel =
    rentSummary.remaining > 0
      ? `Thiếu ${formatVND(rentSummary.remaining)}`
      : "Đủ";
  const statusTone = rentSummary.remaining > 0 ? "warning" : "positive";

  return `
    <section class="dash-panel rent-status-card">
      <div class="dash-panel__body">
        <div class="dash-panel__head rent-status-card__head">
          <h3 class="dash-panel__title">Tiền nhà</h3>
          ${openRent}
        </div>
        <div class="rent-status-card__body">
          <div class="rent-status-card__ring">
            ${renderProgressRing({ percent, size: 96, stroke: 9 })}
            <span class="rent-status-card__badge rent-status-card__badge--${statusTone}">
              ${statusLabel}
            </span>
          </div>
          <div class="rent-status-card__stats">
            ${cards
              .map(
                (card) => `
                  <div class="rent-status-card__stat rent-status-card__stat--${card.tone || "neutral"}">
                    <span class="rent-status-card__stat-label">${card.label}</span>
                    <strong class="rent-status-card__stat-value">${card.value}</strong>
                  </div>
                `,
              )
              .join("")}
          </div>
        </div>
      </div>
    </section>
  `;
}

function renderPreviousDebtSection(items, timeline = [], loading = false) {
  if (loading) {
    return `
      <details class="dash-panel" id="previousDebtPanel">
        <summary class="dash-panel__summary">Nợ cũ</summary>
        <div class="dash-panel__body">${renderSkeletonList({ count: 2 })}</div>
      </details>
    `;
  }

  if (!items.length) return "";

  const totalDebt = sumAmount(items);

  return `
    <details class="dash-panel" id="previousDebtPanel">
      <summary class="dash-panel__summary">
        <span>Nợ cũ</span>
        <span class="filter-pill filter-pill--warning">${formatVND(totalDebt)}</span>
      </summary>
      <div class="dash-panel__body">
        <div class="compact-list">
          ${items
            .slice(0, 6)
            .map(
              (item) => `
                <div class="compact-list__row">
                  <span>${nameOf(item.fromId)} → ${nameOf(item.toId)}</span>
                  <strong>${formatVND(item.amount)}</strong>
                </div>
              `,
            )
            .join("")}
        </div>
        ${
          timeline.length
            ? `
              <details class="mt-2">
                <summary class="small text-secondary">Theo tháng (${timeline.length})</summary>
                <div class="compact-list mt-2">
                  ${timeline
                    .map(
                      (entry) => `
                        <div class="compact-list__row">
                          <span>${formatPeriodLabel(entry.period)}</span>
                          <strong>${formatVND(entry.carryTotal)}</strong>
                        </div>
                      `,
                    )
                    .join("")}
                </div>
              </details>
            `
            : ""
        }
        ${renderBtn({
          label: "Ghi cấn trừ",
          href: buildHash("/payments", { tab: "suggest" }),
          variant: "primary",
          size: "sm",
          className: "mt-3",
        })}
      </div>
    </details>
  `;
}

function computePersonalDebt(myMemberId, rentSummary, settlementPlan, hasRentDoc) {
  let rentDebt = 0;
  if (rentSummary?.mode === "member") {
    rentDebt = Math.max(0, Number(rentSummary.remaining || 0));
  }

  let expenseDebt = 0;
  for (const item of settlementPlan || []) {
    if (item.fromId === myMemberId) {
      expenseDebt += Math.max(0, Number(item.amount || 0));
    }
  }

  const total = rentDebt + expenseDebt;
  const breakdown = [];
  if (rentDebt > 0) breakdown.push({ label: "Tiền nhà", amount: rentDebt });
  if (expenseDebt > 0) {
    breakdown.push({ label: "Chi tiêu chung", amount: expenseDebt });
  }

  let status = "settled";
  let statusLabel = "Ổn";
  if (total > 0) {
    status = "debt";
    statusLabel = "Còn nợ";
  } else if (!hasRentDoc) {
    status = "pending";
    statusLabel = "Chưa nhập nhà";
  }

  return {
    total,
    breakdown,
    status,
    statusLabel,
  };
}

export function renderDashboardPage() {
  const app = getAppRoot();
  const myMemberId = getMyMemberId();
  const currentUserLabel = getCurrentUserLabel(state);
  let onboardingOpened = false;

  let period = getSelectedPeriod();
  let liveExpenses = [];
  let livePayments = [];
  let liveRent = null;
  let allTimeExpenses = [];
  let allTimePayments = [];
  let expensesReady = false;
  let paymentsReady = false;
  let rentReady = false;
  let allTimeExpensesReady = false;
  let allTimePaymentsReady = false;
  let allTimeLoading = false;
  let unsubscribeHub = null;
  let disposed = false;
  let allTimeStarted = false;
  let shellMounted = false;

  const { schedule: scheduleRender, dispose: disposeScheduler } =
    createRenderScheduler(recomputeAndRender);

  function renderShell(content) {
    mountAuthenticatedPage({
      pageId: "dashboard",
      title: "",
      meta: [],
      period,
      content: `
        <div class="dash-page">
          <div id="dashboard-hero">${content.hero || ""}</div>
          <div id="dashboard-quick">${content.quick || ""}</div>
          <div id="dashboard-metrics">${content.metrics || ""}</div>
          <div id="dashboard-members">${content.members || ""}</div>
          <div id="dashboard-body">${content.body || ""}</div>
        </div>
      `,
      nav: {
        active: "dashboard",
        isOwner: state.isOwner,
        includeLogout: true,
        onLogout: async () => logout(),
        userLabel: currentUserLabel,
      },
      onPeriodChange: (nextPeriod) => {
        if (nextPeriod === period) return;
        reloadPeriod(nextPeriod);
      },
    });

    shellMounted = true;

    if (!onboardingOpened) {
      onboardingOpened = true;
      openOnboardingModal();
    }
  }

  function renderLoadingShell() {
    renderShell(
      {
        hero: renderDashboardLoading(),
        quick: "",
        metrics: "",
        members: "",
        body: "",
      },
    );
  }

  function recomputeAndRender() {
    if (!expensesReady || !paymentsReady || !rentReady) {
      renderLoadingShell();
      return;
    }

    const expenseTotal = liveExpenses.reduce(
      (sum, item) => sum + Number(item.amount || 0),
      0,
    );
    const paymentTotal = livePayments.reduce(
      (sum, item) => sum + Number(item.amount || 0),
      0,
    );
    const monthlySettlementView = buildMonthlySettlementView({
      roster: ROSTER,
      expenses: liveExpenses,
      payments: livePayments,
    });
    const settlementPlan = monthlySettlementView.settlementPlan;
    const { start } = getMonthRange(period);
    const previousDebtSettlementPlan =
      allTimeExpensesReady && allTimePaymentsReady
        ? buildMonthlySettlementView({
            roster: ROSTER,
            expenses: allTimeExpenses.filter((item) => String(item.date || "") < start),
            payments: allTimePayments.filter((item) => String(item.date || "") < start),
          }).settlementPlan
        : null;
    const previousDebtTimeline =
      allTimeExpensesReady && allTimePaymentsReady
        ? buildPreviousDebtTimeline(
            allTimeExpenses,
            allTimePayments,
            period,
          )
        : [];

    const rentSummary = summarizeRentForMember(liveRent, myMemberId);
    const stats = {
      expenseTotal,
      expenseCount: liveExpenses.length,
      paymentTotal,
      paymentCount: livePayments.length,
      rentTotal: Number(liveRent?.total || 0),
      settlementCount: settlementPlan.length,
    };

    const tasks = [];
    if (!liveExpenses.length) {
      tasks.push({
        href: "#/expenses",
        cta: "+ Chi",
      });
    }
    if (!liveRent) {
      tasks.push({
        href: "#/rent",
        cta: "Nhập nhà",
        primary: true,
      });
    }
    if (settlementPlan.length > 0) {
      tasks.push({
        href: buildHash("/payments", { tab: "suggest" }),
        cta: "Cấn trừ",
        primary: true,
      });
    }

    const personalDebt = computePersonalDebt(
      myMemberId,
      rentSummary,
      settlementPlan,
      !!liveRent,
    );

    const previousDebtLoading = allTimeLoading;

    const memberSummaries = buildMemberSummaries({
      roster: ROSTER,
      rentDoc: liveRent,
      settlementPlan,
    });

    const heroHtml = renderBalanceHero({
      amount: personalDebt.total,
      status: personalDebt.status,
      statusLabel: personalDebt.statusLabel,
      breakdown: personalDebt.breakdown,
      actions: [],
    });
    const quickCtaHtml = renderQuickCtaGrid({
      expense: stats.expenseCount || "",
      settle: settlementPlan.length || "",
    });
    const membersHtml = renderMemberSummaries(memberSummaries, myMemberId);
    const metricsHtml = renderHeroRow(stats);
    const bodyHtml = `
      <div class="dash-page__stack">
        ${renderSparkline({
          values: buildDailyTotals(liveExpenses),
          label: "Chi 7 ngày",
        })}
        ${renderRentSection(rentSummary)}
        ${
          allTimeStarted
            ? renderPreviousDebtSection(
                previousDebtSettlementPlan || [],
                previousDebtTimeline,
                previousDebtLoading,
              )
            : `
              <details class="dash-panel" id="previousDebtPanel">
                <summary class="dash-panel__summary">Nợ cũ</summary>
              </details>
            `
        }
      </div>
    `;

    if (!shellMounted) {
      renderShell(
        {
          hero: heroHtml,
          quick: quickCtaHtml,
          metrics: metricsHtml,
          members: membersHtml,
          body: bodyHtml,
        },
      );
    } else {
      patchMainContent("#dashboard-hero", heroHtml);
      patchMainContent("#dashboard-quick", quickCtaHtml);
      patchMainContent("#dashboard-metrics", metricsHtml);
      patchMainContent("#dashboard-members", membersHtml);
      patchMainContent("#dashboard-body", bodyHtml);
    }
  }

  async function loadPreviousDebtData() {
    if (allTimeStarted || allTimeLoading || disposed) return;
    allTimeStarted = true;
    allTimeLoading = true;
    allTimeExpensesReady = false;
    allTimePaymentsReady = false;
    scheduleRender();

    const groupId = state.groupId;

    try {
      const { expensesBefore, paymentsBefore } = await fetchHistoricalBefore(
        groupId,
        period,
      );

      if (disposed) return;

      allTimeExpenses = expensesBefore;
      allTimePayments = paymentsBefore;
      allTimeExpensesReady = true;
      allTimePaymentsReady = true;
    } catch (error) {
      console.error("Failed to load previous debt data", error);
      allTimeExpensesReady = true;
      allTimePaymentsReady = true;
    } finally {
      allTimeLoading = false;
      scheduleRender();
    }
  }

  function startWatchers() {
    unsubscribeHub?.();
    expensesReady = false;
    paymentsReady = false;
    rentReady = false;

    unsubscribeHub = subscribeLiveMonthData({
      consumerId: "dashboard",
      groupId: state.groupId,
      period,
      onUpdate: ({
        expenses,
        payments,
        rent,
        expensesReady: nextExpensesReady,
        paymentsReady: nextPaymentsReady,
        rentReady: nextRentReady,
      }) => {
        if (disposed) return;
        liveExpenses = expenses;
        livePayments = payments;
        liveRent = rent;
        expensesReady = nextExpensesReady;
        paymentsReady = nextPaymentsReady;
        rentReady = nextRentReady;
        scheduleRender();
      },
    });
  }

  function reloadPeriod(nextPeriod) {
    period = nextPeriod;
    allTimeStarted = false;
    allTimeExpensesReady = false;
    allTimePaymentsReady = false;
    renderLoadingShell();
    startWatchers();
  }

  function dispose() {
    disposed = true;
    disposeScheduler();
    unsubscribeHub?.();
  }

  mountPage({
    dispose,
    onRouteLeave: (hash) => {
      if (!hash.startsWith("#/dashboard")) dispose();
    },
  });
  getMainElement()?.addEventListener("toggle", (event) => {
    if (event.target?.id === "previousDebtPanel" && event.target.open) {
      void loadPreviousDebtData();
    }
  });

  renderLoadingShell();
  startWatchers();
}
