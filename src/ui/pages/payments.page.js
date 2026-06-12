import { logout } from "../../services/auth.service";
import { buildHash } from "../../core/routing";
import { getSelectedPeriod, state } from "../../core/state";
import { ROSTER } from "../../config/roster";
import { getCurrentUserLabel } from "../../core/display-name";
import { buildMonthlySettlementView } from "../../domain/matrix/compute";
import {
  fetchHistoricalBefore,
  subscribeLiveMonthData,
} from "../../services/live-data-hub";
import { getMonthRange } from "../../services/month-ops.service";
import {
  bindSegmentedTabs,
  renderSegmentedTabs,
} from "../components/segmentedTabs";
import { bindPaymentsActions } from "../controllers/payments.controller";
import { mountPage } from "../layout/page-lifecycle";
import { mountAuthenticatedPage, patchMainContent } from "../layout/page-mount";
import { getAppRoot } from "../layout/shell-controller";
import { createRenderScheduler } from "../utils/render-scheduler";
import {
  PAYMENT_TABS,
  buildPreviousDebtByMonth,
  filterBeforeMonth,
  paymentSummary,
  renderLoading,
  renderTabPanels,
  resolveActiveTab,
} from "../views/payments.view";
export async function renderPaymentsPage(options = {}) {
  if (!state.user || !state.groupId) return;

  const app = getAppRoot();
  const canOperate = state.canOperateMonth;
  const groupId = state.groupId;
  const currentUserLabel = getCurrentUserLabel(state);
  let period = getSelectedPeriod();
  let activeTab = resolveActiveTab(options);

  let monthExpenses = [];
  let monthPayments = [];
  let allExpenses = [];
  let allPayments = [];
  let expensesReady = false;
  let paymentsReady = false;
  let historicalReady = false;
  let historicalLoading = false;
  let historicalStarted = false;
  let shellMounted = false;

  let unsubscribeHub = null;
  let disposed = false;

  const { schedule, dispose: disposeScheduler } = createRenderScheduler(render);

  async function loadHistoricalData() {
    if (historicalStarted || historicalLoading || disposed) return;
    historicalLoading = true;
    historicalStarted = true;
    schedule();

    try {
      const { expensesBefore, paymentsBefore } = await fetchHistoricalBefore(
        groupId,
        period,
      );

      if (disposed) return;

      allExpenses = expensesBefore;
      allPayments = paymentsBefore;
      historicalReady = true;
    } catch (error) {
      console.error("Failed to load historical payments data", error);
      historicalReady = true;
    } finally {
      historicalLoading = false;
      schedule();
    }
  }

  function buildView() {
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
    const previousDebtByMonth =
      historicalStarted && historicalReady
        ? buildPreviousDebtByMonth(allExpenses, allPayments, period)
        : [];

    return {
      monthSettlement,
      previousSettlement,
      previousDebtByMonth,
    };
  }

  function renderTabs(summary) {
    return PAYMENT_TABS.map((tab) => ({
      ...tab,
      badge:
        tab.id === "suggest"
          ? summary.settlementCount || ""
          : tab.id === "history"
            ? summary.paymentCount || ""
            : "",
    }));
  }

  function mountShell(panelHtml) {
    const summary = paymentSummary(monthExpenses, monthPayments, [], []);
    mountAuthenticatedPage({
      pageId: "payments",
      title: "",
      period,
      content: `
        <div class="payments-page">
          <div id="paymentsTabHost">
            ${renderSegmentedTabs({
              tabs: renderTabs(summary),
              activeId: activeTab,
              ariaLabel: "Chuyển tab cấn trừ",
            })}
          </div>
          <div id="payments-panel">${panelHtml}</div>
        </div>
      `,
      nav: {
        active: "payments",
        isOwner: state.isOwner,
        includeLogout: true,
        onLogout: async () => logout(),
        userLabel: currentUserLabel,
      },
      onPeriodChange: (nextPeriod) => {
        if (nextPeriod === period) return;
        period = nextPeriod;
        historicalStarted = false;
        historicalReady = false;
        shellMounted = false;
        startMonthWatchers();
        if (activeTab === "suggest") void loadHistoricalData();
        schedule();
      },
    });
    shellMounted = true;

    bindSegmentedTabs(app.querySelector("#paymentsTabHost"), {
      onChange: (tabId) => {
        activeTab = tabId;
        window.location.hash = buildHash("/payments", { tab: tabId });
        if (tabId === "suggest") void loadHistoricalData();
        schedule();
      },
    });
  }

  function render() {
    activeTab = resolveActiveTab(options);

    if (!expensesReady || !paymentsReady) {
      if (!shellMounted) mountShell(renderLoading());
      else patchMainContent("#payments-panel", renderLoading());
      return;
    }

    if (activeTab === "suggest" && !historicalStarted) {
      void loadHistoricalData();
    }

    if (activeTab === "suggest" && historicalLoading) {
      if (!shellMounted) mountShell(renderLoading());
      else patchMainContent("#payments-panel", renderLoading());
      return;
    }

    const { monthSettlement, previousSettlement, previousDebtByMonth } =
      buildView();
    const summary = paymentSummary(
      monthExpenses,
      monthPayments,
      monthSettlement.settlementPlan,
      previousSettlement.settlementPlan,
    );

    const panelHtml = renderTabPanels({
      activeTab,
      period,
      summary,
      previousDebtByMonth,
      monthExpenses,
      monthPayments,
      monthSettlement,
      canOperate,
    });

    if (!shellMounted) {
      mountShell(panelHtml);
    } else {
      patchMainContent("#payments-panel", panelHtml);
      const tabHost = app.querySelector("#paymentsTabHost");
      if (tabHost) {
        tabHost.innerHTML = renderSegmentedTabs({
          tabs: renderTabs(summary),
          activeId: activeTab,
          ariaLabel: "Chuyển tab cấn trừ",
        });
        bindSegmentedTabs(tabHost, {
          onChange: (tabId) => {
            activeTab = tabId;
            window.location.hash = buildHash("/payments", { tab: tabId });
            if (tabId === "suggest") void loadHistoricalData();
            schedule();
          },
        });
      }
    }

    bindPaymentsActions({
      root: app,
      groupId,
      period,
      canOperate,
      monthPayments,
      settlementPlan: monthSettlement.settlementPlan,
    });
  }

  function startMonthWatchers() {
    unsubscribeHub?.();
    expensesReady = false;
    paymentsReady = false;

    unsubscribeHub = subscribeLiveMonthData({
      consumerId: "payments",
      groupId,
      period,
      onUpdate: ({
        expenses,
        payments,
        expensesReady: nextExpensesReady,
        paymentsReady: nextPaymentsReady,
      }) => {
        if (disposed) return;
        monthExpenses = expenses;
        monthPayments = payments;
        expensesReady = nextExpensesReady;
        paymentsReady = nextPaymentsReady;
        schedule();
      },
    });
  }

  function dispose() {
    disposed = true;
    disposeScheduler();
    unsubscribeHub?.();
  }

  mountPage({
    dispose,
    onRouteLeave: (hash) => {
      if (!hash.startsWith("#/payments")) dispose();
    },
  });

  if (activeTab === "suggest") void loadHistoricalData();
  startMonthWatchers();
  schedule();
}
