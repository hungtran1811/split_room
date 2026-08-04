import { logout } from "../../../services/auth.service";
import { getSelectedPeriod, state } from "../../../core/state";
import { ROSTER } from "../../../config/roster";
import { EMAIL_TO_MEMBER_ID } from "../../../config/members.map";
import { getCurrentUserLabel } from "../../../core/display-name";
import { fetchHistoricalBefore, subscribeLiveMonthData } from "../../../services/live-data-hub";
import { getMonthRange } from "../../../services/month-ops.service";
import { renderBalanceHero } from "../../components/balanceHero";
import { buildMemberSummaries, renderMemberSummaries, renderQuickCtaGrid } from "../../components/dashOverview";
import { openOnboardingModal } from "../../components/onboardingModal";
import { buildDailyTotals, renderSparkline } from "../../components/sparkline";
import { buildMonthlySettlementView } from "../../../domain/matrix/compute";
import { mountPage } from "../../layout/page-lifecycle";
import { mountAuthenticatedPage, patchMainContent } from "../../layout/page-mount";
import { getMainElement } from "../../layout/shell-controller";
import { createRenderScheduler } from "../../utils/render-scheduler";
import {
  buildPreviousDebtTimeline,
  computePersonalDebt,
  renderDashboardLoading,
  renderHeroRow,
  renderPreviousDebtSection,
  renderRentSection,
  summarizeRentForMember,
} from "./render";

function getMyMemberId() {
  return state.memberProfile?.memberId || EMAIL_TO_MEMBER_ID[state.user?.email || ""] || null;
}

export function renderDashboardPage() {
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

  const { schedule: scheduleRender, dispose: disposeScheduler } = createRenderScheduler(recomputeAndRender);

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
        if (nextPeriod !== period) reloadPeriod(nextPeriod);
      },
    });
    shellMounted = true;
    if (!onboardingOpened) {
      onboardingOpened = true;
      openOnboardingModal();
    }
  }

  function renderLoadingShell() {
    renderShell({ hero: renderDashboardLoading(), quick: "", metrics: "", members: "", body: "" });
  }

  function recomputeAndRender() {
    if (!expensesReady || !paymentsReady || !rentReady) {
      renderLoadingShell();
      return;
    }
    const expenseTotal = liveExpenses.reduce((sum, item) => sum + Number(item.amount || 0), 0);
    const paymentTotal = livePayments.reduce((sum, item) => sum + Number(item.amount || 0), 0);
    const settlementPlan = buildMonthlySettlementView({
      roster: ROSTER,
      expenses: liveExpenses,
      payments: livePayments,
    }).settlementPlan;
    const { start } = getMonthRange(period);
    const previousDebtSettlementPlan = allTimeExpensesReady && allTimePaymentsReady
      ? buildMonthlySettlementView({
          roster: ROSTER,
          expenses: allTimeExpenses.filter((item) => String(item.date || "") < start),
          payments: allTimePayments.filter((item) => String(item.date || "") < start),
        }).settlementPlan
      : null;
    const previousDebtTimeline = allTimeExpensesReady && allTimePaymentsReady
      ? buildPreviousDebtTimeline(allTimeExpenses, allTimePayments, period)
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
    const personalDebt = computePersonalDebt(myMemberId, rentSummary, settlementPlan, !!liveRent);
    const memberSummaries = buildMemberSummaries({ roster: ROSTER, rentDoc: liveRent, settlementPlan });
    const bodyHtml = `
      <div class="dash-page__stack">
        ${renderSparkline({ values: buildDailyTotals(liveExpenses), label: "Chi 7 ngày" })}
        ${renderRentSection(rentSummary)}
        ${allTimeStarted
          ? renderPreviousDebtSection(previousDebtSettlementPlan || [], previousDebtTimeline, allTimeLoading)
          : `<details class="dash-panel" id="previousDebtPanel"><summary class="dash-panel__summary">Nợ cũ</summary></details>`}
      </div>
    `;
    const content = {
      hero: renderBalanceHero({
        amount: personalDebt.total,
        status: personalDebt.status,
        statusLabel: personalDebt.statusLabel,
        breakdown: personalDebt.breakdown,
        actions: [],
      }),
      quick: renderQuickCtaGrid({ expense: stats.expenseCount || "", settle: settlementPlan.length || "" }),
      metrics: renderHeroRow(stats),
      members: renderMemberSummaries(memberSummaries, myMemberId),
      body: bodyHtml,
    };
    if (!shellMounted) renderShell(content);
    else {
      patchMainContent("#dashboard-hero", content.hero);
      patchMainContent("#dashboard-quick", content.quick);
      patchMainContent("#dashboard-metrics", content.metrics);
      patchMainContent("#dashboard-members", content.members);
      patchMainContent("#dashboard-body", content.body);
    }
  }

  async function loadPreviousDebtData() {
    if (allTimeStarted || allTimeLoading || disposed) return;
    allTimeStarted = true;
    allTimeLoading = true;
    allTimeExpensesReady = false;
    allTimePaymentsReady = false;
    scheduleRender();
    try {
      const { expensesBefore, paymentsBefore } = await fetchHistoricalBefore(state.groupId, period);
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
      onUpdate: ({ expenses, payments, rent, expensesReady: nextExpensesReady, paymentsReady: nextPaymentsReady, rentReady: nextRentReady }) => {
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
    if (event.target?.id === "previousDebtPanel" && event.target.open) void loadPreviousDebtData();
  });
  renderLoadingShell();
  startWatchers();
}
