import { formatVND } from "../../config/i18n";
import {
  getCurrentUserLabel,
  getMemberLabelById,
  getUserLabel,
} from "../../core/display-name";
import { state } from "../../core/state";
import { renderMetricGrid } from "../components/metricTile";
import { renderSkeletonStatGrid } from "../components/skeletonCard";

export function userLabel(value) {
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

export function renderSummaryCards(report) {
  const stats = report?.stats || {};

  return renderMetricGrid(
    [
      {
        label: "Chi tiêu",
        value: formatVND(stats.expenseTotal || 0),
        delta: `${stats.expenseCount || 0} khoản`,
        tone: "neutral",
      },
      {
        label: "Thanh toán",
        value: formatVND(stats.paymentTotal || 0),
        delta: `${stats.paymentCount || 0} giao dịch`,
        tone: "positive",
      },
      {
        label: "Tiền nhà",
        value: formatVND(stats.rentTotal || 0),
        delta: stats.rentTotal ? "Đã có" : "Chưa có",
        tone: "warning",
      },
      {
        label: "Cấn trừ",
        value: `${stats.settlementCount || 0}`,
        delta: "cuối kỳ",
        tone: stats.settlementCount ? "danger" : "positive",
      },
    ],
    { columns: 4 },
  );
}

export function renderLockBar({ locked, canLock }) {
  if (locked) {
    return `<div class="filter-pill filter-pill--success">Đã chốt tháng</div>`;
  }
  if (!canLock) return "";
  return `<button type="button" class="btn btn-primary btn-sm" id="btnLockPeriod">Chốt tháng</button>`;
}

export function renderExportBar({ canExport }) {
  if (!canExport) return "";
  return `<button type="button" class="btn btn-outline-secondary btn-sm" id="btnExportReport">Xuất CSV</button>`;
}

export function renderRentCard(rentSummary) {
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

export function renderMemberSummaries(report) {
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

  const rowItems = rows.map((item) => {
    const balance = Number(item.netBalance || 0);
    const balanceLabel =
      balance > 0
        ? `Được nhận ${formatVND(balance)}`
        : balance < 0
          ? `Phải trả ${formatVND(Math.abs(balance))}`
          : "Cân bằng";

    return { ...item, balanceLabel };
  });

  return `
    <section class="card section-card">
      <div class="card-header">Theo từng thành viên</div>
      <div class="card-body p-0">
        <div class="member-report-cards">
          ${rowItems
            .map(
              (item) => `
                <article class="member-report-card">
                  <div class="member-report-card__name">${item.name}</div>
                  <div class="member-report-card__grid">
                    <div class="member-report-card__item">
                      <span class="member-report-card__label">Số dư ròng</span>
                      <span class="member-report-card__value">${item.balanceLabel}</span>
                    </div>
                    <div class="member-report-card__item">
                      <span class="member-report-card__label">Phần tiền nhà</span>
                      <span class="member-report-card__value">${formatVND(item.rentShare || 0)}</span>
                    </div>
                    <div class="member-report-card__item">
                      <span class="member-report-card__label">Đã trả</span>
                      <span class="member-report-card__value">${formatVND(item.rentPaid || 0)}</span>
                    </div>
                    <div class="member-report-card__item">
                      <span class="member-report-card__label">Còn thiếu</span>
                      <span class="member-report-card__value">${formatVND(item.rentRemaining || 0)}</span>
                    </div>
                  </div>
                </article>
              `,
            )
            .join("")}
        </div>
        <div class="table-responsive member-report-table">
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
              ${rowItems
                .map(
                  (item) => `
                    <tr>
                      <td class="fw-semibold">${item.name}</td>
                      <td>${item.balanceLabel}</td>
                      <td>${formatVND(item.rentShare || 0)}</td>
                      <td>${formatVND(item.rentPaid || 0)}</td>
                      <td>${formatVND(item.rentRemaining || 0)}</td>
                    </tr>
                  `,
                )
                .join("")}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  `;
}

export function renderSettlementPlan(report) {
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

export function renderReportsLoading() {
  return `
    <div class="reports-page__stack">
      ${renderSkeletonStatGrid()}
      <div class="skeleton-card skeleton-card--stat"></div>
      <div class="skeleton-card"></div>
      <div class="skeleton-card"></div>
    </div>
  `;
}

export function renderReportsError(message) {
  return `
    <div class="alert alert-danger mb-0">
      <div class="fw-semibold mb-1">Không thể tải báo cáo</div>
      <div class="small">${message}</div>
    </div>
  `;
}

export function renderReportsBody({ loading, errorMessage, liveReport }) {
  if (loading) return renderReportsLoading();
  if (errorMessage) return renderReportsError(errorMessage);

  return `
    ${renderSummaryCards(liveReport)}
    ${renderRentCard(liveReport?.rentSummary)}
    ${renderMemberSummaries(liveReport)}
    ${renderSettlementPlan(liveReport)}
  `;
}
