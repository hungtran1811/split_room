import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "../shared/ui/Button";
import { ConfirmDialog } from "../shared/ui/ConfirmDialog";
import { EmptyState } from "../shared/ui/EmptyState";
import { MemberAvatar } from "../shared/ui/MemberAvatar";
import { OverviewSection } from "../shared/ui/OverviewSection";
import { PageHeader } from "../shared/ui/PageHeader";
import { PageLoadingSkeleton } from "../shared/ui/Skeleton";
import { useToast } from "../shared/ui/Toast";
import { useSession } from "../app/SessionContext";
import { isOwnerProfile } from "../core/roles";
import {
  MAX_BACKUP_ADMINS,
  demoteBackupAdmin,
  getAdminOverview,
  listGroupMembers,
  promoteBackupAdmin,
} from "../services/admin.service";

type AdminMember = Awaited<ReturnType<typeof listGroupMembers>>[number];
type AdminOverview = Awaited<ReturnType<typeof getAdminOverview>>;

type ConfirmState = {
  open: boolean;
  kind: "promote" | "demote";
  member: AdminMember | null;
};

const ROLE_MATRIX = [
  {
    capability: "Tạo khoản chi",
    owner: true,
    admin: true,
    member: true,
  },
  {
    capability: "Sửa khoản chi",
    owner: true,
    admin: true,
    member: false,
  },
  {
    capability: "Xóa khoản chi",
    owner: true,
    admin: false,
    member: false,
  },
  {
    capability: "Ghi nhận thanh toán",
    owner: true,
    admin: true,
    member: false,
  },
  {
    capability: "Sửa tiền nhà / chốt tháng",
    owner: true,
    admin: true,
    member: false,
  },
  {
    capability: "Xem toàn bộ nợ nhóm",
    owner: true,
    admin: true,
    member: false,
  },
  {
    capability: "Đặt / gỡ admin phụ",
    owner: true,
    admin: false,
    member: false,
  },
] as const;

function roleLabel(role: string): string {
  if (role === "owner") return "Admin chính";
  if (role === "admin") return "Admin phụ";
  return "Thành viên";
}

function memberLabel(member: AdminMember): string {
  return String(member.displayName || member.email || member.memberId || member.uid || "Người dùng");
}

function checkMark(ok: boolean): string {
  return ok ? "Có" : "—";
}

const EMPTY_CONFIRM: ConfirmState = {
  open: false,
  kind: "promote",
  member: null,
};

export function AdminPage() {
  const session = useSession();
  const { showToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [actionPending, setActionPending] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [members, setMembers] = useState<AdminMember[]>([]);
  const [overview, setOverview] = useState<AdminOverview | null>(null);
  const [confirmState, setConfirmState] = useState<ConfirmState>(EMPTY_CONFIRM);

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

  const backupAdmins = useMemo(() => {
    const fromMembers = members.filter((member) => member.role === "admin");
    if (fromMembers.length) return fromMembers;
    return overview?.backupAdmins || [];
  }, [members, overview]);

  const regularMembers = useMemo(
    () => members.filter((member) => member.role === "member"),
    [members],
  );

  const canPromoteMore = backupAdmins.length < MAX_BACKUP_ADMINS;

  function openPromoteConfirm(member: AdminMember) {
    if (!canPromoteMore) {
      showToast({
        title: "Đã đủ admin phụ",
        message: `Tối đa ${MAX_BACKUP_ADMINS} người. Hãy gỡ một admin phụ trước.`,
        variant: "danger",
      });
      return;
    }
    setConfirmState({ open: true, kind: "promote", member });
  }

  function openDemoteConfirm(member: AdminMember) {
    setConfirmState({ open: true, kind: "demote", member });
  }

  function closeConfirm() {
    if (actionPending) return;
    setConfirmState(EMPTY_CONFIRM);
  }

  async function runConfirmedAction() {
    if (!session.groupId || !session.user || !confirmState.member?.uid) return;
    const member = confirmState.member;
    const kind = confirmState.kind;

    setActionPending(true);
    try {
      if (kind === "promote") {
        await promoteBackupAdmin(session.groupId, String(member.uid), session.user);
        showToast({
          title: "Thành công",
          message: `Đã đặt ${memberLabel(member)} làm admin phụ.`,
          variant: "success",
        });
      } else {
        await demoteBackupAdmin(session.groupId, String(member.uid), session.user);
        showToast({
          title: "Thành công",
          message: `Đã gỡ quyền admin phụ của ${memberLabel(member)}.`,
          variant: "success",
        });
      }
      setConfirmState(EMPTY_CONFIRM);
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

  if (!owner) {
    return (
      <EmptyState
        title="Không có quyền truy cập"
        description="Chỉ admin chính mới được vào trang quản trị."
      />
    );
  }

  const confirmMember = confirmState.member;
  const confirmTitle =
    confirmState.kind === "promote" ? "Đặt làm admin phụ" : "Gỡ quyền admin phụ";
  const confirmDescription = confirmMember ? (
    confirmState.kind === "promote" ? (
      <>
        Đặt <strong>{memberLabel(confirmMember)}</strong> làm admin phụ?
        <br />
        Hiện có {backupAdmins.length}/{MAX_BACKUP_ADMINS} admin phụ.
      </>
    ) : (
      <>
        Gỡ quyền admin phụ của <strong>{memberLabel(confirmMember)}</strong>?
      </>
    )
  ) : null;

  return (
    <div className="admin-page">
      <PageHeader
        title="Quản trị nhóm"
        subtitle="Đặt tối đa 2 admin phụ và xem quyền từng vai trò"
      />

      {loading ? (
        <PageLoadingSkeleton stats={4} rows={2} />
      ) : errorMessage ? (
        <EmptyState title="Không thể tải trang quản trị" description={errorMessage} />
      ) : (
        <>
          <OverviewSection
            title="Bảng quyền"
            subtitle="Admin phụ giúp vận hành tháng; chỉ admin chính được xóa chi và đổi role"
          >
            <div className="role-matrix-wrap">
              <table className="role-matrix">
                <thead>
                  <tr>
                    <th>Quyền</th>
                    <th>Admin chính</th>
                    <th>Admin phụ</th>
                    <th>Thành viên</th>
                  </tr>
                </thead>
                <tbody>
                  {ROLE_MATRIX.map((row) => (
                    <tr key={row.capability}>
                      <td>{row.capability}</td>
                      <td className={row.owner ? "role-matrix__yes" : "role-matrix__no"}>
                        {checkMark(row.owner)}
                      </td>
                      <td className={row.admin ? "role-matrix__yes" : "role-matrix__no"}>
                        {checkMark(row.admin)}
                      </td>
                      <td className={row.member ? "role-matrix__yes" : "role-matrix__no"}>
                        {checkMark(row.member)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </OverviewSection>

          <OverviewSection
            title="Admin phụ hiện tại"
            subtitle={`${backupAdmins.length}/${MAX_BACKUP_ADMINS} người · tối đa 2`}
          >
            {backupAdmins.length ? (
              <div className="admin-backup-list">
                {backupAdmins.map((admin) => (
                  <div key={String(admin.uid || admin.id)} className="admin-backup-card">
                    <div className="admin-backup-card__identity">
                      <MemberAvatar
                        memberId={String(admin.memberId || "")}
                        label={memberLabel(admin)}
                        size={44}
                      />
                      <div>
                        <div className="admin-backup-card__name">{memberLabel(admin)}</div>
                        <div className="admin-backup-card__meta">
                          {String(admin.email || "-")}
                          {admin.memberId ? ` · ${String(admin.memberId)}` : ""}
                        </div>
                      </div>
                    </div>
                    <Button
                      variant="danger"
                      className="btn--sm"
                      disabled={actionPending}
                      onClick={() => openDemoteConfirm(admin)}
                    >
                      Gỡ quyền
                    </Button>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState
                title="Chưa có admin phụ"
                description="Chọn tối đa 2 thành viên bên dưới để đặt làm admin phụ."
              />
            )}
          </OverviewSection>

          <OverviewSection title="Thành viên" subtitle={`${members.length} người trong nhóm`}>
            <div className="admin-member-list">
              {members.map((member) => (
                <article key={String(member.uid || member.id)} className="admin-member-card">
                  <div className="admin-member-card__top">
                    <div className="admin-member-card__identity">
                      <MemberAvatar
                        memberId={String(member.memberId || "")}
                        label={memberLabel(member)}
                        size={40}
                      />
                      <div>
                        <div className="admin-member-card__name">{memberLabel(member)}</div>
                        <div className="admin-member-card__meta">
                          {String(member.email || "-")}
                          <br />
                          memberId: {String(member.memberId || "-")}
                        </div>
                      </div>
                    </div>
                    <span className={`role-badge role-badge--${member.role}`}>
                      {roleLabel(member.role)}
                    </span>
                  </div>
                  <div className="admin-member-card__actions">
                    {member.role === "owner" ? (
                      <span className="form-hint">Cố định · toàn quyền</span>
                    ) : member.role === "admin" ? (
                      <Button
                        variant="danger"
                        className="btn--sm"
                        disabled={actionPending}
                        onClick={() => openDemoteConfirm(member)}
                      >
                        Gỡ admin phụ
                      </Button>
                    ) : (
                      <Button
                        variant="primary"
                        className="btn--sm"
                        disabled={actionPending || !canPromoteMore}
                        onClick={() => openPromoteConfirm(member)}
                      >
                        Đặt làm admin phụ
                      </Button>
                    )}
                  </div>
                </article>
              ))}
              {!regularMembers.length && !backupAdmins.length ? (
                <p className="form-hint">Chưa có thành viên thường để đặt admin phụ.</p>
              ) : null}
              {!canPromoteMore ? (
                <p className="form-hint">
                  Đã đủ {MAX_BACKUP_ADMINS} admin phụ. Gỡ một người nếu muốn đặt người khác.
                </p>
              ) : null}
            </div>
          </OverviewSection>
        </>
      )}

      <ConfirmDialog
        open={confirmState.open}
        title={confirmTitle}
        description={confirmDescription}
        confirmLabel={confirmState.kind === "promote" ? "Đặt admin phụ" : "Gỡ quyền"}
        confirmVariant={confirmState.kind === "promote" ? "primary" : "danger"}
        pending={actionPending}
        onCancel={closeConfirm}
        onConfirm={() => void runConfirmedAction()}
      />
    </div>
  );
}
