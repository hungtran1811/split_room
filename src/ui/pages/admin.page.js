import { logout } from "../../services/auth.service";
import {
  getSelectedPeriod,
  state,
  subscribeSelectedPeriod,
} from "../../core/state";
import { getCurrentUserLabel, getUserLabel } from "../../core/display-name";
import { ALLOWED_EMAILS } from "../../config/constants";
import { EMAIL_TO_MEMBER_ID } from "../../config/members.map";
import { mapFirestoreError } from "../../core/errors";
import { showToast } from "../components/toast";
import { openConfirmModal } from "../components/confirmModal";
import { renderAuthShell, renderAppShell } from "../layout/app-shell";
import { mountPrimaryNav, unmountPrimaryNav } from "../layout/navbar";
import {
  demoteBackupAdmin,
  getAdminOverview,
  listGroupMembers,
  promoteBackupAdmin,
} from "../../services/admin.service";

function roleLabel(role) {
  if (role === "owner") return "Admin chính";
  if (role === "admin") return "Admin phụ";
  return "Thành viên";
}

function roleBadgeClass(role) {
  if (role === "owner") return "text-bg-danger";
  if (role === "admin") return "text-bg-warning";
  return "text-bg-secondary";
}

function diagnosticsHtml(items = []) {
  if (!items.length) {
    return '<span class="badge bg-success-subtle text-success border">OK</span>';
  }

  return items
    .map(
      (item) =>
        `<span class="badge bg-light text-dark border me-1 mb-1">${item.label}</span>`,
    )
    .join("");
}

function memberLabel(member) {
  return getUserLabel(member);
}

function renderOverviewCards(overview) {
  return `
    <section class="stat-grid">
      <article class="stat-card">
        <div class="stat-card__label">Admin chính</div>
        <div class="stat-card__value stat-card__value--compact">${
          overview?.owner ? memberLabel(overview.owner) : "Chưa có"
        }</div>
        <div class="stat-card__hint">Owner cố định của nhóm</div>
      </article>
      <article class="stat-card">
        <div class="stat-card__label">Admin phụ</div>
        <div class="stat-card__value stat-card__value--compact">${
          overview?.backupAdmin ? memberLabel(overview.backupAdmin) : "Chưa có"
        }</div>
        <div class="stat-card__hint">Tối đa một người</div>
      </article>
      <article class="stat-card">
        <div class="stat-card__label">Số thành viên</div>
        <div class="stat-card__value">${overview?.memberCount || 0}</div>
        <div class="stat-card__hint">Đã có hồ sơ trong nhóm</div>
      </article>
      <article class="stat-card">
        <div class="stat-card__label">Allowlist</div>
        <div class="stat-card__value">${ALLOWED_EMAILS.length}</div>
        <div class="stat-card__hint">Đang quản lý ngoài app</div>
      </article>
    </section>
  `;
}

function renderHealthCard(overview) {
  return `
    <section class="card section-card">
      <div class="card-header">Sức khỏe dữ liệu nhóm</div>
      <div class="card-body section-card__body">
        <div class="summary-strip">
          <div class="summary-strip__item">
            <span class="summary-strip__label">Thiếu memberId</span>
            <span class="summary-strip__value">${
              overview?.diagnostics?.missingMemberId?.length || 0
            }</span>
          </div>
          <div class="summary-strip__item">
            <span class="summary-strip__label">Role legacy</span>
            <span class="summary-strip__value">${
              overview?.diagnostics?.legacyRoles?.length || 0
            }</span>
          </div>
          <div class="summary-strip__item">
            <span class="summary-strip__label">Email mismatch</span>
            <span class="summary-strip__value">${
              overview?.diagnostics?.emailMapMismatch?.length || 0
            }</span>
          </div>
        </div>
        <div class="summary-strip">
          <div class="summary-strip__item">
            <span class="summary-strip__label">Không nằm trong roster</span>
            <span class="summary-strip__value">${
              overview?.diagnostics?.unknownRosterMembers?.length || 0
            }</span>
          </div>
          <div class="summary-strip__item">
            <span class="summary-strip__label">Tiền nhà tháng hiện tại</span>
            <span class="summary-strip__value">${
              overview?.currentPeriodStatus?.rentExists ? "Đã có" : "Chưa có"
            }</span>
          </div>
        </div>
      </div>
    </section>
  `;
}

function renderMembersTable(members, actionPending) {
  return `
    <section class="card section-card">
      <div class="card-header d-flex justify-content-between align-items-center">
        <span>Danh sách thành viên</span>
        <span class="small text-secondary">
          ${
            actionPending
              ? "Đang cập nhật quyền..."
              : "Chỉ admin chính mới đổi được admin phụ"
          }
        </span>
      </div>
      <div class="card-body p-0">
        <div class="table-responsive">
          <table class="table table-sm align-middle mb-0">
            <thead>
              <tr>
                <th>Tên</th>
                <th>memberId</th>
                <th>Email</th>
                <th>UID</th>
                <th>Role</th>
                <th>Trạng thái</th>
                <th class="text-end">Hành động</th>
              </tr>
            </thead>
            <tbody>
              ${members
                .map(
                  (member) => `
                    <tr>
                      <td class="fw-semibold">${memberLabel(member)}</td>
                      <td>${member.memberId || "-"}</td>
                      <td>${member.email || "-"}</td>
                      <td><code class="small">${member.uid || "-"}</code></td>
                      <td><span class="badge ${roleBadgeClass(member.role)}">${roleLabel(member.role)}</span></td>
                      <td>${diagnosticsHtml(member.diagnostics)}</td>
                      <td class="text-end">
                        ${
                          member.role === "owner"
                            ? '<span class="small text-secondary">Cố định</span>'
                            : member.role === "admin"
                              ? `<button class="btn ui-action-pill ui-action-pill--danger section-cta" data-action="demote" data-uid="${member.uid}" ${
                                  actionPending ? "disabled" : ""
                                }>Gỡ admin phụ</button>`
                              : `<button class="btn ui-action-pill ui-action-pill--secondary section-cta" data-action="promote" data-uid="${member.uid}" ${
                                  actionPending ? "disabled" : ""
                                }>Đặt làm admin phụ</button>`
                        }
                      </td>
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

export async function renderAdminPage() {
  if (!state.user || !state.groupId) return;

  const app = document.querySelector("#app");

  if (!state.isOwner) {
    unmountPrimaryNav();
    app.innerHTML = renderAuthShell({
      title: "Quản trị nhóm",
      subtitle: "403 / Không có quyền truy cập",
      content: `
        <div class="alert alert-danger mb-0">
          <div class="fw-semibold mb-2">Chỉ admin chính mới được vào trang quản trị.</div>
          <div class="small mb-3">
            Bạn vẫn có thể quay về dashboard hoặc tiếp tục xem báo cáo của nhóm.
          </div>
          <div class="d-flex gap-2">
            <a class="btn ui-action-pill ui-action-pill--primary" href="#/dashboard">Về Dashboard</a>
            <a class="btn ui-action-pill ui-action-pill--secondary" href="#/reports">Báo cáo</a>
          </div>
        </div>
      `,
    });
    return;
  }

  let loading = true;
  let actionPending = false;
  let errorMessage = "";
  let members = [];
  let overview = null;
  let loadToken = 0;
  let disposed = false;
  let selectedPeriod = getSelectedPeriod();

  function render() {
    app.innerHTML = renderAppShell({
      pageId: "admin",
      title: "Quản trị nhóm",
      subtitle: "Quyền thành viên và sức khỏe dữ liệu",
      meta: [
        `Đăng nhập: ${getCurrentUserLabel(state)}`,
        `Nhóm: ${state.groupId}`,
        `Tháng đang xem: ${selectedPeriod}`,
      ],
      content: `
        <div class="info-banner">
          <span class="fw-semibold">Allowlist và email map vẫn đang quản lý ngoài app</span>
          <span>Hiện có ${Object.keys(EMAIL_TO_MEMBER_ID).length} mapping email -> memberId được hard-code trong cấu hình.</span>
        </div>

        ${
          loading
            ? `
              <section class="card section-card">
                <div class="card-body d-flex align-items-center gap-3">
                  <div class="spinner-border" role="status" aria-label="Loading"></div>
                  <div>
                    <div class="fw-semibold">Đang tải dữ liệu quản trị...</div>
                    <div class="text-secondary small">Vui lòng chờ trong giây lát</div>
                  </div>
                </div>
              </section>
            `
            : errorMessage
              ? `
                <div class="alert alert-danger mb-0">
                  <div class="fw-semibold mb-1">Không thể tải trang quản trị</div>
                  <div class="small">${errorMessage}</div>
                </div>
              `
              : `
                ${renderOverviewCards(overview)}
                ${renderHealthCard(overview)}
                ${renderMembersTable(members, actionPending)}
              `
        }
      `,
    });

    mountPrimaryNav({
      active: "admin",
      isOwner: state.isOwner,
      includeLogout: true,
      onLogout: async () => {
        await logout();
      },
      userLabel: getCurrentUserLabel(state),
    });

    app.querySelectorAll("[data-action='promote']").forEach((button) => {
      button.addEventListener("click", () => {
        const member = members.find((item) => item.uid === button.dataset.uid);
        if (!member) return;

        const replacing =
          overview?.backupAdmin && overview.backupAdmin.uid !== member.uid
            ? `Admin phụ hiện tại (${memberLabel(overview.backupAdmin)}) sẽ bị gỡ quyền.`
            : "Thành viên này sẽ có quyền vận hành tháng.";

        openConfirmModal({
          title: "Đặt admin phụ",
          message: `Đặt ${memberLabel(member)} làm admin phụ?`,
          meta: replacing,
          okText: "Xác nhận",
          danger: false,
          onConfirm: async () => {
            await runAction(async () => {
              await promoteBackupAdmin(state.groupId, member.uid, state.user);
            }, `Đã đặt ${memberLabel(member)} làm admin phụ.`);
          },
        });
      });
    });

    app.querySelectorAll("[data-action='demote']").forEach((button) => {
      button.addEventListener("click", () => {
        const member = members.find((item) => item.uid === button.dataset.uid);
        if (!member) return;

        openConfirmModal({
          title: "Gỡ admin phụ",
          message: `Gỡ quyền admin phụ của ${memberLabel(member)}?`,
          meta: "Thành viên này sẽ quay về quyền thành viên thường.",
          okText: "Gỡ quyền",
          danger: true,
          onConfirm: async () => {
            await runAction(async () => {
              await demoteBackupAdmin(state.groupId, member.uid, state.user);
            }, `Đã gỡ quyền admin phụ của ${memberLabel(member)}.`);
          },
        });
      });
    });
  }

  async function loadData() {
    const token = ++loadToken;
    loading = true;
    errorMessage = "";
    render();

    try {
      const [nextMembers, nextOverview] = await Promise.all([
        listGroupMembers(state.groupId),
        getAdminOverview(state.groupId, selectedPeriod),
      ]);

      if (disposed || token !== loadToken) return;
      members = nextMembers;
      overview = nextOverview;
      loading = false;
      render();
    } catch (error) {
      if (disposed || token !== loadToken) return;
      loading = false;
      errorMessage = mapFirestoreError(
        error,
        "Không thể tải dữ liệu quản trị.",
      );
      render();
    }
  }

  async function runAction(action, successMessage) {
    actionPending = true;
    render();

    try {
      await action();
      showToast({
        title: "Thành công",
        message: successMessage,
        variant: "success",
      });
      actionPending = false;
      await loadData();
    } catch (error) {
      actionPending = false;
      render();
      showToast({
        title: "Thất bại",
        message: mapFirestoreError(error, error?.message),
        variant: "danger",
      });
      throw error;
    }
  }

  const unsubscribeSelectedPeriod = subscribeSelectedPeriod(async (nextPeriod) => {
    if (nextPeriod === selectedPeriod) return;
    selectedPeriod = nextPeriod;
    await loadData();
  });

  const onHashChange = () => {
    if (!location.hash.startsWith("#/admin")) {
      disposed = true;
      unsubscribeSelectedPeriod();
      window.removeEventListener("hashchange", onHashChange);
    }
  };

  window.addEventListener("hashchange", onHashChange);
  await loadData();
}
