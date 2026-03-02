import { logout } from "../../services/auth.service";
import { state } from "../../core/state";
import { getCurrentUserLabel, getUserLabel } from "../../core/display-name";
import { ALLOWED_EMAILS } from "../../config/constants";
import { EMAIL_TO_MEMBER_ID } from "../../config/members.map";
import { mapFirestoreError } from "../../core/errors";
import { showToast } from "../components/toast";
import { openConfirmModal } from "../components/confirmModal";
import { mountPrimaryNav } from "../layout/navbar";
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
  if (role === "owner") return "bg-danger";
  if (role === "admin") return "bg-warning text-dark";
  return "bg-secondary";
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

export async function renderAdminPage() {
  if (!state.user || !state.groupId) return;

  const app = document.querySelector("#app");

  if (!state.isOwner) {
    app.innerHTML = `
      <div class="app-shell auth-shell">
        <div class="app-shell__container app-shell__container--sm">
          <div class="alert alert-danger">
            <div class="fw-semibold mb-2">403 / Không có quyền truy cập</div>
            <div class="small mb-3">Chỉ admin chính mới được vào trang quản trị nhóm.</div>
            <div class="d-flex gap-2">
              <a class="btn btn-primary btn-sm" href="#/dashboard">Về Dashboard</a>
              <a class="btn btn-outline-secondary btn-sm" href="#/reports">Báo cáo</a>
            </div>
          </div>
        </div>
      </div>
    `;
    return;
  }

  let loading = true;
  let actionPending = false;
  let errorMessage = "";
  let members = [];
  let overview = null;
  let loadToken = 0;
  let disposed = false;

  function render() {
    app.innerHTML = `
      <div class="app-shell" data-page="admin">
        <div class="app-shell__container">
          <div class="app-shell__header">
            <div class="app-shell__title-block">
              <h1 class="app-shell__title">Quản trị nhóm</h1>
              <div class="app-shell__meta">Đăng nhập: ${getCurrentUserLabel(state)}</div>
              <div class="app-shell__meta">Nhóm: <b>${state.groupId}</b></div>
            </div>
            <div id="primaryNavHost" class="app-shell__nav-host"></div>
          </div>

        ${
          loading
            ? `
              <div class="d-flex align-items-center gap-3 py-4">
                <div class="spinner-border" role="status" aria-label="Loading"></div>
                <div>
                  <div class="fw-semibold">Đang tải dữ liệu quản trị...</div>
                  <div class="text-secondary small">Vui lòng chờ trong giây lát</div>
                </div>
              </div>
            `
            : errorMessage
              ? `
                <div class="alert alert-danger">
                  <div class="fw-semibold mb-1">Không thể tải trang quản trị</div>
                  <div class="small">${errorMessage}</div>
                </div>
              `
              : `
                <div class="row g-3 mb-3">
                  <div class="col-12 col-lg-7">
                    <div class="card h-100">
                      <div class="card-header">Tổng quan quyền</div>
                      <div class="card-body">
                        <div class="row g-3">
                          <div class="col-12 col-md-6">
                            <div class="text-secondary small">Admin chính</div>
                            <div class="fw-semibold">${overview?.owner ? memberLabel(overview.owner) : "Chưa có"}</div>
                          </div>
                          <div class="col-12 col-md-6">
                            <div class="text-secondary small">Admin phụ</div>
                            <div class="fw-semibold">${overview?.backupAdmin ? memberLabel(overview.backupAdmin) : "Chưa có"}</div>
                          </div>
                          <div class="col-12 col-md-6">
                            <div class="text-secondary small">Số thành viên</div>
                            <div class="fw-semibold">${overview?.memberCount || 0}</div>
                          </div>
                          <div class="col-12 col-md-6">
                            <div class="text-secondary small">Allowlist</div>
                            <div class="fw-semibold">Quản lý ngoài app</div>
                            <div class="small text-secondary">${ALLOWED_EMAILS.length} email đang hard-code trong rules/config</div>
                          </div>
                          <div class="col-12">
                            <div class="text-secondary small">Mapping memberId</div>
                            <div class="small text-secondary">
                              memberId hiện đang hard-code theo email map với ${Object.keys(EMAIL_TO_MEMBER_ID).length} mục.
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div class="col-12 col-lg-5">
                    <div class="card h-100">
                      <div class="card-header">Sức khỏe dữ liệu nhóm</div>
                      <div class="card-body">
                        <div class="d-flex justify-content-between mb-2">
                          <span class="text-secondary small">Thiếu memberId</span>
                          <span class="fw-semibold">${overview?.diagnostics?.missingMemberId?.length || 0}</span>
                        </div>
                        <div class="d-flex justify-content-between mb-2">
                          <span class="text-secondary small">Role legacy</span>
                          <span class="fw-semibold">${overview?.diagnostics?.legacyRoles?.length || 0}</span>
                        </div>
                        <div class="d-flex justify-content-between mb-2">
                          <span class="text-secondary small">Email không khớp map</span>
                          <span class="fw-semibold">${overview?.diagnostics?.emailMapMismatch?.length || 0}</span>
                        </div>
                        <div class="d-flex justify-content-between mb-3">
                          <span class="text-secondary small">Không nằm trong roster</span>
                          <span class="fw-semibold">${overview?.diagnostics?.unknownRosterMembers?.length || 0}</span>
                        </div>
                        <hr />
                        <div class="d-flex justify-content-between mb-2">
                          <span class="text-secondary small">Tiền nhà tháng hiện tại</span>
                          <span class="badge ${overview?.currentPeriodStatus?.rentExists ? "bg-success" : "bg-secondary"}">
                            ${overview?.currentPeriodStatus?.rentExists ? "Đã có" : "Chưa có"}
                          </span>
                        </div>
                        <div class="d-flex justify-content-between">
                          <span class="text-secondary small">Snapshot báo cáo tháng hiện tại</span>
                          <span class="badge ${overview?.currentPeriodStatus?.reportSnapshotExists ? "bg-success" : "bg-secondary"}">
                            ${overview?.currentPeriodStatus?.reportSnapshotExists ? "Đã có" : "Chưa có"}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <div class="card">
                  <div class="card-header d-flex justify-content-between align-items-center">
                    <div>Danh sách thành viên</div>
                    <div class="small text-secondary">${actionPending ? "Đang cập nhật quyền..." : "Chỉ admin chính mới được đổi admin phụ"}</div>
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
                                          ? `<button class="btn btn-outline-danger btn-sm" data-action="demote" data-uid="${member.uid}" ${actionPending ? "disabled" : ""}>Gỡ admin phụ</button>`
                                          : `<button class="btn btn-outline-primary btn-sm" data-action="promote" data-uid="${member.uid}" ${actionPending ? "disabled" : ""}>Đặt làm admin phụ</button>`
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
                </div>
              `
        }
        </div>
      </div>
    `;

    mountPrimaryNav({
      active: "admin",
      isOwner: state.isOwner,
      includeLogout: true,
      onLogout: async () => {
        await logout();
      },
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
        getAdminOverview(state.groupId),
      ]);

      if (disposed || token !== loadToken) return;
      members = nextMembers;
      overview = nextOverview;
      loading = false;
      render();
    } catch (error) {
      if (disposed || token !== loadToken) return;
      loading = false;
      errorMessage = mapFirestoreError(error, "Không thể tải dữ liệu quản trị.");
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

  const onHashChange = () => {
    if (!location.hash.startsWith("#/admin")) {
      disposed = true;
      window.removeEventListener("hashchange", onHashChange);
    }
  };

  window.addEventListener("hashchange", onHashChange);
  await loadData();
}
