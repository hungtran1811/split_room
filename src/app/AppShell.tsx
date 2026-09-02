import { useEffect, useRef, useState } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { comparePeriod, currentPeriod, shiftPeriod } from "../core/period";
import { isOwnerProfile } from "../core/roles";
import { resolveMemberIdFromEmail } from "../config/members.map";
import { logout } from "../services/auth.service";
import { updateOwnAvatar } from "../services/member.service";
import { NotificationBell } from "../features/notifications/NotificationBell";
import { AvatarPicker } from "../shared/ui/AvatarPicker";
import { BottomSheet } from "../shared/ui/BottomSheet";
import { NicknameSheet } from "../shared/ui/NicknameSheet";
import { BrandLogo } from "../shared/ui/BrandLogo";
import { MemberAvatar } from "../shared/ui/MemberAvatar";
import { useToast } from "../shared/ui/Toast";
import { useSession } from "./SessionContext";

const NAV_ITEMS = [
  {
    id: "dashboard",
    to: "/dashboard",
    label: "Tổng quan",
    icon: <path d="M3 10.5 12 3l9 7.5M5 9.5V20h14V9.5M10 20v-6h4v6" />,
  },
  {
    id: "expenses",
    to: "/expenses",
    label: "Chi tiêu",
    icon: <path d="M6 2h12v20l-3-2-3 2-3-2-3 2zM9 7h6M9 11h6M9 15h4" />,
  },
  {
    id: "payments",
    to: "/payments",
    label: "Thanh toán",
    icon: (
      <path d="m7 16-4 4 4 4M3 20h14a4 4 0 0 0 0-8h-2m6-8-4-4-4 4M21 4H7a4 4 0 1 0 0 8h2" />
    ),
  },
  {
    id: "reports",
    to: "/reports",
    label: "Báo cáo",
    icon: <path d="M4 19V5M4 19h16M8 17V10M12 17V7M16 17v-4" />,
  },
  {
    id: "rent",
    to: "/rent",
    label: "Tiền nhà",
    icon: <path d="M3 21h18M5 21V7l7-4 7 4v14M9 21v-4h2v4M13 21v-4h2v4" />,
  },
];

function formatPeriodLabel(period: string): string {
  const [year, month] = String(period || "").split("-");
  if (!year || !month) return period || "-";
  return `Tháng ${Number(month)}/${year}`;
}

function currentUserLabel(session: ReturnType<typeof useSession>): string {
  const displayName = session.memberProfile?.displayName || session.user?.displayName || "";
  const email = session.memberProfile?.email || session.user?.email || "";
  return String(displayName || email || "Người dùng");
}

export function AppShell() {
  const session = useSession();
  const navigate = useNavigate();
  const { showToast } = useToast();
  const [profileOpen, setProfileOpen] = useState(false);
  const [avatarOpen, setAvatarOpen] = useState(false);
  const [nicknameOpen, setNicknameOpen] = useState(false);
  const [avatarSaving, setAvatarSaving] = useState(false);
  const profileRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!profileOpen) return;

    const onDocumentClick = (event: MouseEvent) => {
      if (!profileRef.current) return;
      if (profileRef.current.contains(event.target as Node)) return;
      setProfileOpen(false);
    };

    document.addEventListener("click", onDocumentClick);
    return () => document.removeEventListener("click", onDocumentClick);
  }, [profileOpen]);

  const label = currentUserLabel(session);
  const owner = isOwnerProfile(session.memberProfile);
  const myMemberId =
    session.memberProfile?.memberId ||
    resolveMemberIdFromEmail(session.user?.email) ||
    "";
  const myPhotoURL = String(session.memberProfile?.photoURL || "");
  const canGoForward =
    comparePeriod(session.selectedPeriod, currentPeriod()) < 0;

  async function handleLogout() {
    setProfileOpen(false);
    await logout();
  }

  async function handleSelectAvatar(petId: string) {
    if (!session.groupId || !session.user?.uid) return;
    setAvatarSaving(true);
    try {
      await updateOwnAvatar(session.groupId, session.user.uid, petId);
      showToast({
        title: "Đã đổi avatar",
        message: "Avatar thú cưng của bạn đã được cập nhật.",
        variant: "success",
      });
      setAvatarOpen(false);
    } catch (error) {
      showToast({
        title: "Không đổi được",
        message: (error as { message?: string })?.message || "Thử lại sau.",
        variant: "danger",
      });
    } finally {
      setAvatarSaving(false);
    }
  }

  return (
    <div className="app-shell">
      <header className="app-header">
        <NavLink to="/dashboard" className="app-header__brand" aria-label="SplitRoom">
          <BrandLogo size={36} className="app-header__brand-logo" decorative />
        </NavLink>

        <div className="app-header__period">
          <div className="period-chip">
            <button
              type="button"
              className="period-chip__btn"
              aria-label="Tháng trước"
              onClick={() => session.setSelectedPeriod(shiftPeriod(session.selectedPeriod, -1))}
            >
              ‹
            </button>
            <span className="period-chip__label">{formatPeriodLabel(session.selectedPeriod)}</span>
            <button
              type="button"
              className="period-chip__btn"
              aria-label="Tháng sau"
              disabled={!canGoForward}
              onClick={() => {
                if (!canGoForward) return;
                session.setSelectedPeriod(shiftPeriod(session.selectedPeriod, 1));
              }}
            >
              ›
            </button>
          </div>
        </div>

        <div className="app-header__actions">
          {session.lockedSoft ? <span className="lock-badge">Đã chốt</span> : null}
          <NotificationBell />
          <div className="profile-menu" ref={profileRef}>
            <button
              type="button"
              className="profile-menu__trigger"
              aria-label="Menu tài khoản"
              aria-expanded={profileOpen}
              onClick={() => setProfileOpen((current) => !current)}
            >
              <MemberAvatar
                memberId={myMemberId}
                photoURL={myPhotoURL}
                label={label}
                size={36}
              />
            </button>
            {profileOpen ? (
              <div className="profile-menu__panel">
                <div className="profile-menu__name">{label}</div>
                <button
                  type="button"
                  className="profile-menu__item"
                  onClick={() => {
                    setProfileOpen(false);
                    setAvatarOpen(true);
                  }}
                >
                  Đổi avatar thú cưng
                </button>
                <button
                  type="button"
                  className="profile-menu__item"
                  onClick={() => {
                    setProfileOpen(false);
                    setNicknameOpen(true);
                  }}
                >
                  Đặt biệt danh
                </button>
                {owner ? (
                  <button
                    type="button"
                    className="profile-menu__item profile-menu__item--admin"
                    onClick={() => {
                      setProfileOpen(false);
                      navigate("/admin");
                    }}
                  >
                    Quản trị nhóm
                  </button>
                ) : null}
                <button
                  type="button"
                  className="profile-menu__item profile-menu__item--danger"
                  onClick={() => void handleLogout()}
                >
                  Đăng xuất
                </button>
              </div>
            ) : null}
          </div>
        </div>
      </header>

      <main className="app-main">
        <Outlet />
      </main>

      <nav className="bottom-nav" aria-label="Điều hướng chính">
        <div className="bottom-nav__inner">
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.id}
              to={item.to}
              className={({ isActive }) =>
                `bottom-nav__item ${isActive ? "is-active" : ""}`.trim()
              }
            >
              <svg
                className="bottom-nav__icon"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                {item.icon}
              </svg>
              <span>{item.label}</span>
            </NavLink>
          ))}
        </div>
      </nav>

      <NicknameSheet open={nicknameOpen} onClose={() => setNicknameOpen(false)} />

      <BottomSheet
        open={avatarOpen}
        onClose={() => {
          if (!avatarSaving) setAvatarOpen(false);
        }}
        title="Chọn avatar thú cưng"
      >
        <p className="form-hint" style={{ marginBottom: 12 }}>
          Chọn một thú cưng làm ảnh đại diện. Bạn có thể đổi bất cứ lúc nào.
        </p>
        <AvatarPicker
          selectedSrc={myPhotoURL}
          memberId={myMemberId}
          disabled={avatarSaving}
          onSelect={(petId) => void handleSelectAvatar(petId)}
        />
      </BottomSheet>
    </div>
  );
}
