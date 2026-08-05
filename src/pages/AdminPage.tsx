import { useCallback, useEffect, useState } from "react";
import { EmptyState } from "../shared/ui/EmptyState";
import { SkeletonList, SkeletonStatGrid } from "../shared/ui/Skeleton";
import { useToast } from "../shared/ui/Toast";
import { useSession } from "../app/SessionContext";
import { ALLOWED_EMAILS } from "../config/constants";
import { isOwnerProfile } from "../core/roles";
import {
  demoteBackupAdmin,
  getAdminOverview,
  listGroupMembers,
  promoteBackupAdmin,
} from "../services/admin.service";

type AdminMember = Awaited<ReturnType<typeof listGroupMembers>>[number];
type AdminOverview = Awaited<ReturnType<typeof getAdminOverview>>;

function roleLabel(role: string): string {
  if (role === "owner") return "Admin chính";
  if (role === "admin") return "Admin phụ";
  return "Thành viên";
}

function memberLabel(member: AdminMember): string {
  return String(member.displayName || member.email || member.memberId || member.uid || "Người dùng");
}

export function AdminPage() {
  const session = useSession();
  const { showToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [actionPending, setActionPending] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [members, setMembers] = useState<AdminMember[]>([]);
  const [overview, setOverview] = useState<AdminOverview | null>(null);

  const owner = isOwnerProfile(session.memberProfile);

  const loadData = useCallback(async () => {
    if (!session.groupId) return;
    setLoading(true);
    setErrorMessage("");
    try {
      const [nextMembers, nextOverview] = await Promise.all([
        listGroupMembers(session.groupId),
        getAdminOverview(session.groupId, session.selectedPeriod),
      ]);
      setMembers(nextMembers);
      setOverview(nextOverview);
    } catch (error) {
      setErrorMessage((error as { message?: string })?.message || "Không thể tải dữ liệu quản trị.");
    } finally {
      setLoading(false);
    }
  }, [session.groupId, session.selectedPeriod]);

  useEffect(() => {
    if (owner) void loadData();
  }, [owner, loadData]);

  async function runAction(action: () => Promise<void>, successMessage: string) {
    setActionPending(true);
    try {
      await action();
      showToast({ title: "Thành công", message: successMessage, variant: "success" });
      await loadData();
    } catch (error) {
      showToast({
        title: "Thất bại",
        message: (error as { message?: string })?.message || "Thao tác thất bại.",
        variant: "danger",
      });
    } finally {
      setActionPending(false);
    }
  }

  async function handlePromote(member: AdminMember) {
    if (!session.groupId || !session.user || !member.uid) return;
    const confirmed = window.confirm(`Đặt ${memberLabel(member)} làm admin phụ?`);
    if (!confirmed) return;
    await runAction(
      () => promoteBackupAdmin(session.groupId!, String(member.uid), session.user!),
      `Đã đặt ${memberLabel(member)} làm admin phụ.`,
    );
  }

  async function handleDemote(member: AdminMember) {
    if (!session.groupId || !session.user || !member.uid) return;
    const confirmed = window.confirm(`Gỡ quyền admin phụ của ${memberLabel(member)}?`);
    if (!confirmed) return;
    await runAction(
      () => demoteBackupAdmin(session.groupId!, String(member.uid), session.user!),
      `Đã gỡ quyền admin phụ của ${memberLabel(member)}.`,
    );
  }

  if (!owner) {
    return (
      <EmptyState
        title="Không có quyền truy cập"
        description="Chỉ admin chính mới được vào trang quản trị."
      />
    );
  }

  return (
    <div className="admin-page">
      <div className="page-head">
        <h1 className="page-head__title">Quản trị</h1>
        <p className="page-head__subtitle">Quyền thành viên và sức khỏe dữ liệu nhóm</p>
      </div>

      {loading ? (
        <>
          <SkeletonStatGrid count={4} />
          <SkeletonList count={2} />
        </>
      ) : errorMessage ? (
        <EmptyState title="Không thể tải trang quản trị" description={errorMessage} />
      ) : (
        <>
          <section className="admin-stat-grid">
            <article className="metric-tile">
              <div className="metric-tile__label">Admin chính</div>
              <div className="metric-tile__value">{overview?.owner ? memberLabel(overview.owner) : "Chưa có"}</div>
            </article>
            <article className="metric-tile">
              <div className="metric-tile__label">Admin phụ</div>
              <div className="metric-tile__value">{overview?.backupAdmin ? memberLabel(overview.backupAdmin) : "Chưa có"}</div>
            </article>
            <article className="metric-tile">
              <div className="metric-tile__label">Số thành viên</div>
              <div className="metric-tile__value">{overview?.memberCount || 0}</div>
            </article>
            <article className="metric-tile">
              <div className="metric-tile__label">Allowlist</div>
              <div className="metric-tile__value">{ALLOWED_EMAILS.length}</div>
            </article>
          </section>

          <section className="card">
            <h2 className="section-title">Sức khỏe dữ liệu nhóm</h2>
            <div className="summary-strip">
              <div className="summary-strip__item">
                <span className="summary-strip__label">Thiếu memberId</span>
                <span className="summary-strip__value">{overview?.diagnostics?.missingMemberId?.length || 0}</span>
              </div>
              <div className="summary-strip__item">
                <span className="summary-strip__label">Role legacy</span>
                <span className="summary-strip__value">{overview?.diagnostics?.legacyRoles?.length || 0}</span>
              </div>
              <div className="summary-strip__item">
                <span className="summary-strip__label">Email mismatch</span>
                <span className="summary-strip__value">{overview?.diagnostics?.emailMapMismatch?.length || 0}</span>
              </div>
              <div className="summary-strip__item">
                <span className="summary-strip__label">Tiền nhà tháng này</span>
                <span className="summary-strip__value">{overview?.currentPeriodStatus?.rentExists ? "Đã có" : "Chưa có"}</span>
              </div>
            </div>
          </section>

          <section className="card">
            <div className="card__head">
              <h2 className="section-title" style={{ marginBottom: 0 }}>
                Danh sách thành viên
              </h2>
              <span className="form-hint">{actionPending ? "Đang cập nhật quyền..." : "Chỉ admin chính mới đổi được admin phụ"}</span>
            </div>
            <div className="admin-table-wrap">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Tên</th>
                    <th>memberId</th>
                    <th>Email</th>
                    <th>Role</th>
                    <th>Trạng thái</th>
                    <th>Hành động</th>
                  </tr>
                </thead>
                <tbody>
                  {members.map((member) => (
                    <tr key={String(member.uid || member.id)}>
                      <td>{memberLabel(member)}</td>
                      <td>{String(member.memberId || "-")}</td>
                      <td>{String(member.email || "-")}</td>
                      <td>
                        <span className={`role-badge role-badge--${member.role}`}>{roleLabel(member.role)}</span>
                      </td>
                      <td>
                        {member.diagnostics?.length ? (
                          member.diagnostics.map((item) => (
                            <span key={item.code} className="status-badge status-badge--pending" style={{ marginRight: 4 }}>
                              {item.label}
                            </span>
                          ))
                        ) : (
                          <span className="status-badge status-badge--settled">OK</span>
                        )}
                      </td>
                      <td>
                        {member.role === "owner" ? (
                          <span className="form-hint">Cố định</span>
                        ) : member.role === "admin" ? (
                          <button type="button" className="btn btn--danger btn--sm" disabled={actionPending} onClick={() => void handleDemote(member)}>
                            Gỡ admin phụ
                          </button>
                        ) : (
                          <button type="button" className="btn btn--ghost btn--sm" disabled={actionPending} onClick={() => void handlePromote(member)}>
                            Đặt làm admin phụ
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
