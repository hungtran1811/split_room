import { logout } from "../../services/auth.service";
import { state } from "../../core/state";
import { formatVND } from "../../config/i18n";
import {
  getCurrentUserLabel,
  getMemberLabelById,
  getUserLabel,
} from "../../core/display-name";
import { mapFirestoreError } from "../../core/errors";
import { showToast } from "../components/toast";
import { mountPrimaryNav } from "../layout/navbar";
import {
  getMonthlyReportLive,
  getMonthlyReportSnapshot,
  listMonthlyReportPeriods,
  saveMonthlyReportSnapshot,
} from "../../services/report.service";

function byId(id) {
  return document.getElementById(id);
}

function currentPeriod() {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}

function formatDateTime(value) {
  if (!value) return "Chưa có";
  if (typeof value?.toDate === "function") {
    return value.toDate().toLocaleString("vi-VN");
  }
  if (value instanceof Date) {
    return value.toLocaleString("vi-VN");
  }
  return String(value);
}

function userLabel(value) {
  if (!value) return "-";

  const memberLabel = getMemberLabelById(value);
  if (memberLabel !== value) return memberLabel;

  const member = (state.members || []).find(
    (item) => item.uid === value || item.id === value,
  );
  if (member) return getUserLabel(member);
  if (state.user?.uid === value) return getCurrentUserLabel(state);
  return value;
}

function renderSummaryCards(report) {
  const stats = report?.stats || {};
  return `
    <div class="row g-2 mb-3">
      <div class="col-6 col-lg-3">
        <div class="card h-100">
          <div class="card-body">
            <div class="text-secondary small">Tổng chi tiêu</div>
            <div class="fw-semibold fs-5">${formatVND(stats.expenseTotal || 0)}</div>
            <div class="small text-secondary">${stats.expenseCount || 0} khoản</div>
          </div>
        </div>
      </div>
      <div class="col-6 col-lg-3">
        <div class="card h-100">
          <div class="card-body">
            <div class="text-secondary small">Thanh toán</div>
            <div class="fw-semibold fs-5">${formatVND(stats.paymentTotal || 0)}</div>
            <div class="small text-secondary">${stats.paymentCount || 0} giao dịch</div>
          </div>
        </div>
      </div>
      <div class="col-6 col-lg-3">
        <div class="card h-100">
          <div class="card-body">
            <div class="text-secondary small">Tiền nhà</div>
            <div class="fw-semibold fs-5">${formatVND(stats.rentTotal || 0)}</div>
            <div class="small text-secondary">${stats.rentTotal ? "Đã có bản ghi" : "Chưa có bản ghi"}</div>
          </div>
        </div>
      </div>
      <div class="col-6 col-lg-3">
        <div class="card h-100">
          <div class="card-body">
            <div class="text-secondary small">Cấn trừ cuối kỳ</div>
            <div class="fw-semibold fs-5">${stats.settlementCount || 0}</div>
            <div class="small text-secondary">dòng thanh toán</div>
          </div>
        </div>
      </div>
    </div>
  `;
}

function renderRentCard(rentSummary) {
  if (!rentSummary) {
    return `
      <div class="card mb-3">
        <div class="card-header">Tình trạng tiền nhà</div>
        <div class="card-body text-secondary">Tháng này chưa có bản ghi tiền nhà.</div>
      </div>
    `;
  }

  return `
    <div class="card mb-3">
      <div class="card-header">Tình trạng tiền nhà</div>
      <div class="card-body">
        <div class="row g-3">
          <div class="col-6 col-md-3">
            <div class="text-secondary small">Người trả</div>
            <div class="fw-semibold">${userLabel(rentSummary.payerId)}</div>
          </div>
          <div class="col-6 col-md-3">
            <div class="text-secondary small">Tổng tiền nhà</div>
            <div class="fw-semibold">${formatVND(rentSummary.total || 0)}</div>
          </div>
          <div class="col-6 col-md-3">
            <div class="text-secondary small">Đã thu</div>
            <div class="fw-semibold text-success">${formatVND(rentSummary.collected || 0)}</div>
          </div>
          <div class="col-6 col-md-3">
            <div class="text-secondary small">Còn thiếu</div>
            <div class="fw-semibold ${
              Number(rentSummary.remaining || 0) > 0 ? "text-danger" : "text-success"
            }">${formatVND(rentSummary.remaining || 0)}</div>
          </div>
        </div>
      </div>
    </div>
  `;
}

function renderMemberSummaries(report) {
  const rows = report?.memberSummaries || [];
  if (!rows.length) {
    return `
      <div class="card mb-3">
        <div class="card-header">Theo từng thành viên</div>
        <div class="card-body text-secondary">Chưa có dữ liệu thành viên.</div>
      </div>
    `;
  }

  return `
    <div class="card mb-3">
      <div class="card-header">Theo từng thành viên</div>
      <div class="card-body p-0">
        <div class="table-responsive">
          <table class="table table-sm mb-0 align-middle">
            <thead>
              <tr>
                <th>Thành viên</th>
                <th>Số dư ròng</th>
                <th>Phần tiền nhà</th>
                <th>Đã trả</th>
                <th>Còn thiếu</th>
              </tr>
            </thead>
            <tbody>
              ${rows
                .map((item) => {
                  const balance = Number(item.netBalance || 0);
                  const balanceLabel =
                    balance > 0
                      ? `Được nhận ${formatVND(balance)}`
                      : balance < 0
                        ? `Phải trả ${formatVND(Math.abs(balance))}`
                        : "Cân bằng";

                  return `
                    <tr>
                      <td class="fw-semibold">${item.name}</td>
                      <td>${balanceLabel}</td>
                      <td>${formatVND(item.rentShare || 0)}</td>
                      <td>${formatVND(item.rentPaid || 0)}</td>
                      <td>${formatVND(item.rentRemaining || 0)}</td>
                    </tr>
                  `;
                })
                .join("")}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  `;
}

function renderSettlementPlan(report) {
  const items = report?.settlementPlan || [];
  return `
    <div class="card mb-3">
      <div class="card-header">Cấn trừ cuối kỳ</div>
      <div class="card-body p-0">
        <ul class="list-group list-group-flush">
          ${
            items.length
              ? items
                  .map(
                    (item) => `
                      <li class="list-group-item d-flex justify-content-between align-items-center">
                        <div>
                          <div class="fw-semibold">${userLabel(item.fromId)} -> ${userLabel(item.toId)}</div>
                          <div class="small text-secondary">${formatVND(item.amount || 0)}</div>
                        </div>
                      </li>
                    `,
                  )
                  .join("")
              : '<li class="list-group-item text-secondary">Không có khoản cấn trừ nào.</li>'
          }
        </ul>
      </div>
    </div>
  `;
}

function renderSnapshotHistory(items, activePeriod) {
  return `
    <div class="card">
      <div class="card-header">Lịch sử snapshot</div>
      <div class="card-body p-0">
        <div class="list-group list-group-flush">
          ${
            items.length
              ? items
                  .map(
                    (item) => `
                      <button
                        type="button"
                        class="list-group-item list-group-item-action ${
                          item.period === activePeriod ? "active" : ""
                        }"
                        data-report-period="${item.period}"
                      >
                        <div class="d-flex justify-content-between">
                          <span class="fw-semibold">${item.period}</span>
                          <span class="small">${formatDateTime(item.snapshotAt)}</span>
                        </div>
                        <div class="small ${
                          item.period === activePeriod ? "text-white-50" : "text-secondary"
                        }">
                          ${userLabel(item.snapshotBy)} • ${item.stats?.settlementCount || 0} dòng cấn trừ
                        </div>
                      </button>
                    `,
                  )
                  .join("")
              : '<div class="list-group-item text-secondary">Chưa có snapshot nào.</div>'
          }
        </div>
      </div>
    </div>
  `;
}

export async function renderReportsPage() {
  if (!state.user || !state.groupId) return;

  const app = document.querySelector("#app");
  const groupId = state.groupId;
  let period = currentPeriod();
  let loading = true;
  let saving = false;
  let errorMessage = "";
  let liveReport = null;
  let snapshotReport = null;
  let snapshotPeriods = [];
  let loadToken = 0;
  let disposed = false;

  function activeReport() {
    return snapshotReport || liveReport;
  }

  function render() {
    const report = activeReport();
    const showingSnapshot = !!snapshotReport;

    app.innerHTML = `
      <div class="app-shell" data-page="reports">
        <div class="app-shell__container">
          <div class="app-shell__header">
            <div class="app-shell__title-block">
              <h1 class="app-shell__title">Báo cáo tháng</h1>
              <div class="app-shell__meta">Đăng nhập: ${getCurrentUserLabel(state)}</div>
              <div class="app-shell__meta">Nhóm: <b>${groupId}</b></div>
            </div>
            <div id="primaryNavHost" class="app-shell__nav-host"></div>
          </div>

        <div class="row g-3 mb-3">
          <div class="col-12 col-lg-8">
            <div class="card">
              <div class="card-body">
                <div class="row g-3 align-items-end">
                  <div class="col-12 col-md-4">
                    <label class="form-label small mb-1">Chọn tháng</label>
                    <input id="reportPeriod" type="month" class="form-control" value="${period}" />
                  </div>
                  <div class="col-12 col-md-8">
                    <div class="d-flex flex-wrap gap-2 align-items-center">
                      <span class="badge ${showingSnapshot ? "bg-success" : "bg-warning text-dark"}">
                        ${showingSnapshot ? "Đã lưu snapshot" : "Đang xem dữ liệu live"}
                      </span>
                      ${
                        showingSnapshot
                          ? `<span class="small text-secondary">Lưu lúc ${formatDateTime(report?.meta?.snapshotAt)} bởi ${userLabel(report?.meta?.snapshotBy)}</span>`
                          : '<span class="small text-secondary">Báo cáo này đang tính trực tiếp từ dữ liệu hiện tại.</span>'
                      }
                    </div>
                    ${
                      state.canOperateMonth
                        ? `
                          <div class="d-flex gap-2 mt-3">
                            <button id="btnSaveSnapshot" class="btn btn-primary btn-sm" ${
                              saving || !liveReport ? "disabled" : ""
                            }>
                              ${saving ? "Đang lưu..." : showingSnapshot ? "Lưu lại snapshot" : "Lưu snapshot tháng"}
                            </button>
                            <div class="small text-secondary align-self-center">Nút này luôn lưu từ dữ liệu live hiện tại.</div>
                          </div>
                        `
                        : '<div class="small text-secondary mt-3">Bạn chỉ có quyền xem báo cáo và snapshot đã lưu.</div>'
                    }
                  </div>
                </div>
              </div>
            </div>
          </div>
          <div class="col-12 col-lg-4">
            ${renderSnapshotHistory(snapshotPeriods, period)}
          </div>
        </div>

        ${
          loading
            ? `
              <div class="d-flex align-items-center gap-3 py-4">
                <div class="spinner-border" role="status" aria-label="Loading"></div>
                <div>
                  <div class="fw-semibold">Đang tải báo cáo tháng ${period}...</div>
                  <div class="text-secondary small">Vui lòng chờ trong giây lát</div>
                </div>
              </div>
            `
            : errorMessage
              ? `
                <div class="alert alert-danger">
                  <div class="fw-semibold mb-1">Không thể tải báo cáo</div>
                  <div class="small">${errorMessage}</div>
                </div>
              `
              : `
                ${renderSummaryCards(report)}
                ${renderRentCard(report?.rentSummary)}
                <div class="row g-3">
                  <div class="col-12 col-lg-7">
                    ${renderMemberSummaries(report)}
                  </div>
                  <div class="col-12 col-lg-5">
                    ${renderSettlementPlan(report)}
                  </div>
                </div>
              `
        }
        </div>
      </div>
    `;

    mountPrimaryNav({
      active: "reports",
      isOwner: state.isOwner,
      includeLogout: true,
      onLogout: async () => {
        await logout();
      },
    });

    byId("reportPeriod")?.addEventListener("change", async (event) => {
      period = event.target.value || currentPeriod();
      await loadData();
    });

    byId("btnSaveSnapshot")?.addEventListener("click", async () => {
      await handleSaveSnapshot();
    });

    app.querySelectorAll("[data-report-period]").forEach((button) => {
      button.addEventListener("click", async () => {
        const nextPeriod = button.getAttribute("data-report-period");
        if (!nextPeriod || nextPeriod === period) return;
        period = nextPeriod;
        await loadData();
      });
    });
  }

  async function loadData() {
    const token = ++loadToken;
    loading = true;
    errorMessage = "";
    render();

    try {
      const [live, snapshot, periods] = await Promise.all([
        getMonthlyReportLive(groupId, period),
        getMonthlyReportSnapshot(groupId, period),
        listMonthlyReportPeriods(groupId),
      ]);

      if (disposed || token !== loadToken) return;

      liveReport = live;
      snapshotReport = snapshot;
      snapshotPeriods = periods;
      loading = false;
      render();
    } catch (error) {
      if (disposed || token !== loadToken) return;

      loading = false;
      errorMessage = mapFirestoreError(error, "Không thể tải báo cáo.");
      render();
    }
  }

  async function handleSaveSnapshot() {
    if (!state.canOperateMonth || !liveReport || saving) return;

    saving = true;
    render();

    try {
      await saveMonthlyReportSnapshot(groupId, period, liveReport, state.user);
      showToast({
        title: "Thành công",
        message: `Đã lưu snapshot báo cáo tháng ${period}.`,
        variant: "success",
      });
      saving = false;
      await loadData();
    } catch (error) {
      saving = false;
      render();
      showToast({
        title: "Thất bại",
        message: mapFirestoreError(error, "Không thể lưu snapshot báo cáo."),
        variant: "danger",
      });
    }
  }

  const onHashChange = () => {
    if (!location.hash.startsWith("#/reports")) {
      disposed = true;
      window.removeEventListener("hashchange", onHashChange);
    }
  };

  window.addEventListener("hashchange", onHashChange);
  await loadData();
}
