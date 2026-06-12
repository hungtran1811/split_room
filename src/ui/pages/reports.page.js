import { logout } from "../../services/auth.service";
import { getSelectedPeriod, state } from "../../core/state";
import { getCurrentUserLabel } from "../../core/display-name";
import { mapFirestoreError } from "../../core/errors";
import { openConfirmModal } from "../components/confirmModal";
import { showToast } from "../components/toast";
import { mountAuthenticatedPage, patchMainContent } from "../layout/page-mount";
import { getMonthlyReportLive } from "../../services/report.service";
import { downloadMonthlyReportCsv } from "../../services/report-export.service";
import { getPeriod, savePeriodSnapshot } from "../../services/period.service";
import { createRenderScheduler } from "../utils/render-scheduler";
import {
  renderExportBar,
  renderLockBar,
  renderReportsBody,
} from "../views/reports.view";

function byId(id) {
  return document.getElementById(id);
}

export async function renderReportsPage() {
  if (!state.user || !state.groupId) return;

  const groupId = state.groupId;
  let period = getSelectedPeriod();
  let loading = true;
  let errorMessage = "";
  let liveReport = null;
  let periodLocked = false;
  let loadToken = 0;
  let disposed = false;
  let shellMounted = false;

  const { schedule, dispose: disposeScheduler } = createRenderScheduler(render);

  function bindActions() {
    const lockButton = byId("btnLockPeriod");
    if (lockButton && !lockButton.dataset.bound) {
      lockButton.dataset.bound = "true";
      lockButton.addEventListener("click", () => {
        if (!liveReport || periodLocked) return;

        openConfirmModal({
          title: "Chốt tháng",
          message: "Khóa mềm tháng này và lưu snapshot báo cáo?",
          onConfirm: async () => {
            await savePeriodSnapshot(groupId, period, {
              lockedBy: state.user.uid,
              stats: liveReport.stats,
              snapshot: {
                balances: liveReport.balances,
                settlementPlan: liveReport.settlementPlan,
                rent: liveReport.rentSummary,
                members: liveReport.memberSummaries,
              },
            });
            periodLocked = true;
            showToast({
              title: "Đã chốt",
              message: "Tháng đã được khóa mềm.",
              variant: "success",
            });
            schedule();
          },
        });
      });
    }

    const exportButton = byId("btnExportReport");
    if (exportButton && !exportButton.dataset.bound) {
      exportButton.dataset.bound = "true";
      exportButton.addEventListener("click", () => {
        if (!liveReport) return;
        downloadMonthlyReportCsv(liveReport, period);
        showToast({
          title: "Đã xuất",
          message: "Báo cáo CSV đã được tải xuống.",
          variant: "success",
        });
      });
    }
  }

  function renderReportsContent() {
    return `
      <div class="reports-page">
        <div class="reports-lock-row">
          ${renderLockBar({ locked: periodLocked, canLock: state.isOwner })}
          ${renderExportBar({ canExport: !loading && !errorMessage && !!liveReport })}
        </div>
        <div id="reports-body" class="reports-page__body">
          ${renderReportsBody({ loading, errorMessage, liveReport })}
        </div>
      </div>
    `;
  }

  function render() {
    if (!shellMounted) {
      mountAuthenticatedPage({
        pageId: "reports",
        title: "",
        meta: [],
        period,
        periodLocked,
        content: renderReportsContent(),
        nav: {
          active: "reports",
          isOwner: state.isOwner,
          includeLogout: true,
          onLogout: async () => logout(),
          userLabel: getCurrentUserLabel(state),
        },
        onPeriodChange: (nextPeriod) => {
          if (nextPeriod === period) return;
          period = nextPeriod;
          shellMounted = false;
          loadData();
        },
      });
      shellMounted = true;
    } else {
      patchMainContent("#reports-body", renderReportsBody({ loading, errorMessage, liveReport }));
      const lockRow = document.querySelector(".reports-lock-row");
      if (lockRow) {
        lockRow.innerHTML = `
          ${renderLockBar({ locked: periodLocked, canLock: state.isOwner })}
          ${renderExportBar({ canExport: !loading && !errorMessage && !!liveReport })}
        `;
      }
    }

    bindActions();
  }

  async function loadData() {
    const token = ++loadToken;
    loading = true;
    errorMessage = "";
    schedule();

    try {
      const [live, periodDoc] = await Promise.all([
        getMonthlyReportLive(groupId, period),
        getPeriod(groupId, period),
      ]);

      if (disposed || token !== loadToken) return;

      liveReport = live;
      periodLocked = !!periodDoc?.lockedSoft;
      loading = false;
      schedule();
    } catch (error) {
      if (disposed || token !== loadToken) return;

      loading = false;
      errorMessage = mapFirestoreError(error, "Không thể tải báo cáo.");
      schedule();
    }
  }

  const onHashChange = () => {
    if (!location.hash.startsWith("#/reports")) {
      disposed = true;
      disposeScheduler();
      window.removeEventListener("hashchange", onHashChange);
    }
  };

  window.addEventListener("hashchange", onHashChange);
  await loadData();
}
