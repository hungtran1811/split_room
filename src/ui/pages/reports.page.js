import { logout } from "../../services/auth.service";
import {
  getSelectedPeriod,
  setSelectedPeriod,
  state,
  subscribeSelectedPeriod,
} from "../../core/state";
import { formatVND } from "../../config/i18n";
import {
  getCurrentUserLabel,
  getMemberLabelById,
  getUserLabel,
} from "../../core/display-name";
import { mapFirestoreError } from "../../core/errors";
import { renderAppShell } from "../layout/app-shell";
import { mountPrimaryNav } from "../layout/navbar";
import { getMonthlyReportLive } from "../../services/report.service";

function byId(id) {
  return document.getElementById(id);
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
    <section class="stat-grid">
      <article class="stat-card">
        <div class="stat-card__label">Tổng chi tiêu</div>
        <div class="stat-card__value">${formatVND(stats.expenseTotal || 0)}</div>
        <div class="stat-card__hint">${stats.expenseCount || 0} khoản</div>
      </article>
      <article class="stat-card">
        <div class="stat-card__label">Thanh toán</div>
        <div class="stat-card__value">${formatVND(stats.paymentTotal || 0)}</div>
        <div class="stat-card__hint">${stats.paymentCount || 0} giao dịch</div>
      </article>
      <article class="stat-card">
        <div class="stat-card__label">Tiền nhà</div>
        <div class="stat-card__value">${formatVND(stats.rentTotal || 0)}</div>
        <div class="stat-card__hint">
          ${stats.rentTotal ? "Đã có bản ghi" : "Chưa có bản ghi"}
        </div>
      </article>
      <article class="stat-card">
        <div class="stat-card__label">Cấn trừ cuối kỳ</div>
        <div class="stat-card__value">${stats.settlementCount || 0}</div>
        <div class="stat-card__hint">dòng thanh toán</div>
      </article>
    </section>
  `;
}

function renderRentCard(rentSummary) {
  if (!rentSummary) {
    return `
      <section class="card section-card">
        <div class="card-header">Tình trạng tiền nhà</div>
        <div class="card-body section-card__body">
          <div class="empty-state">
            <div class="empty-state__title">Tháng này chưa có bản ghi tiền nhà</div>
            <div class="empty-state__text">
              Bạn vẫn có thể xem báo cáo live của chi tiêu và thanh toán.
            </div>
          </div>
        </div>
      </section>
    `;
  }

  return `
    <section class="card section-card">
      <div class="card-header">Tình trạng tiền nhà</div>
      <div class="card-body section-card__body">
        <div class="summary-strip">
          <div class="summary-strip__item">
            <span class="summary-strip__label">Người trả</span>
            <span class="summary-strip__value">${userLabel(rentSummary.payerId)}</span>
          </div>
          <div class="summary-strip__item">
            <span class="summary-strip__label">Tổng tiền nhà</span>
            <span class="summary-strip__value">${formatVND(rentSummary.total || 0)}</span>
          </div>
          <div class="summary-strip__item">
            <span class="summary-strip__label">Đã thu</span>
            <span class="summary-strip__value">${formatVND(rentSummary.collected || 0)}</span>
          </div>
        </div>
        <div class="summary-strip">
          <div class="summary-strip__item">
            <span class="summary-strip__label">Còn thiếu</span>
            <span class="summary-strip__value">${formatVND(rentSummary.remaining || 0)}</span>
          </div>
        </div>
      </div>
    </section>
  `;
}

function renderMemberSummaries(report) {
  const rows = report?.memberSummaries || [];
  if (!rows.length) {
    return `
      <section class="card section-card">
        <div class="card-header">Theo từng thành viên</div>
        <div class="card-body section-card__body">
          <div class="empty-state">
            <div class="empty-state__title">Chưa có dữ liệu thành viên</div>
            <div class="empty-state__text">Báo cáo tháng này chưa có gì để tổng hợp.</div>
          </div>
        </div>
      </section>
    `;
  }

  return `
    <section class="card section-card">
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
    </section>
  `;
}

function renderSettlementPlan(report) {
  const items = report?.settlementPlan || [];

  return `
    <section class="card section-card">
      <div class="card-header">Cấn trừ cuối kỳ</div>
      <div class="card-body section-card__body">
        ${
          items.length
            ? `
              <div class="action-list">
                ${items
                  .map(
                    (item) => `
                      <article class="action-list__item">
                        <div class="action-list__head">
                          <div>
                            <div class="action-list__title">${userLabel(item.fromId)} -> ${userLabel(item.toId)}</div>
                            <div class="action-list__meta">${formatVND(item.amount || 0)}</div>
                          </div>
                        </div>
                      </article>
                    `,
                  )
                  .join("")}
              </div>
            `
            : `
              <div class="empty-state">
                <div class="empty-state__title">Không có khoản cấn trừ nào</div>
                <div class="empty-state__text">Tháng này không còn khoản nợ nào cần thanh toán thêm.</div>
              </div>
            `
        }
      </div>
    </section>
  `;
}

function renderLoading(period) {
  return `
    <section class="card section-card">
      <div class="card-body d-flex align-items-center gap-3">
        <div class="spinner-border" role="status" aria-label="Loading"></div>
        <div>
          <div class="fw-semibold">Đang tải báo cáo tháng ${period}...</div>
          <div class="text-secondary small">Vui lòng chờ trong giây lát</div>
        </div>
      </div>
    </section>
  `;
}

function renderError(message) {
  return `
    <div class="alert alert-danger mb-0">
      <div class="fw-semibold mb-1">Không thể tải báo cáo</div>
      <div class="small">${message}</div>
    </div>
  `;
}

export async function renderReportsPage() {
  if (!state.user || !state.groupId) return;

  const app = document.querySelector("#app");
  const groupId = state.groupId;
  let period = getSelectedPeriod();
  let loading = true;
  let errorMessage = "";
  let liveReport = null;
  let loadToken = 0;
  let disposed = false;

  function render() {
    app.innerHTML = renderAppShell({
      pageId: "reports",
      title: "Báo cáo tháng",
      subtitle: "Tổng hợp theo dữ liệu live",
      meta: [
        `Đăng nhập: ${getCurrentUserLabel(state)}`,
        `Nhóm: ${groupId}`,
      ],
      showPeriodFilter: true,
      period,
      content: `
        <div class="info-banner">
          <span class="fw-semibold">Báo cáo live</span>
          <span>Báo cáo này được tính trực tiếp từ chi tiêu, thanh toán và tiền nhà của tháng đang xem.</span>
        </div>

        ${
          loading
            ? renderLoading(period)
            : errorMessage
              ? renderError(errorMessage)
              : `
                ${renderSummaryCards(liveReport)}
                ${renderRentCard(liveReport?.rentSummary)}
                ${renderMemberSummaries(liveReport)}
                ${renderSettlementPlan(liveReport)}
              `
        }
      `,
    });

    mountPrimaryNav({
      active: "reports",
      isOwner: state.isOwner,
      includeLogout: true,
      onLogout: async () => {
        await logout();
      },
      userLabel: getCurrentUserLabel(state),
    });

    byId("globalPeriodPicker")?.addEventListener("change", (event) => {
      setSelectedPeriod(event.target.value);
    });
  }

  async function loadData() {
    const token = ++loadToken;
    loading = true;
    errorMessage = "";
    render();

    try {
      const live = await getMonthlyReportLive(groupId, period);

      if (disposed || token !== loadToken) return;

      liveReport = live;
      loading = false;
      render();
    } catch (error) {
      if (disposed || token !== loadToken) return;

      loading = false;
      errorMessage = mapFirestoreError(error, "Không thể tải báo cáo.");
      render();
    }
  }

  const unsubscribeSelectedPeriod = subscribeSelectedPeriod(async (nextPeriod) => {
    if (nextPeriod === period) return;
    period = nextPeriod;
    await loadData();
  });

  const onHashChange = () => {
    if (!location.hash.startsWith("#/reports")) {
      disposed = true;
      unsubscribeSelectedPeriod();
      window.removeEventListener("hashchange", onHashChange);
    }
  };

  window.addEventListener("hashchange", onHashChange);
  await loadData();
}
