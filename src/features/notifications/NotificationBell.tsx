import { useEffect, useRef, useState } from "react";
import { useSession } from "../../app/SessionContext";
import { useNotifications } from "../../hooks/useNotifications";

function formatNotifyTime(value: unknown): string {
  if (!value) return "";
  const asDate = value as { toDate?: () => Date };
  const date = typeof asDate?.toDate === "function" ? asDate.toDate() : new Date(value as string);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function NotificationBell() {
  const { groupId, user } = useSession();
  const { items, unreadCount, markRead } = useNotifications(groupId, user?.uid);
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    const onDocumentClick = (event: MouseEvent) => {
      if (!rootRef.current) return;
      if (rootRef.current.contains(event.target as Node)) return;
      setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };

    document.addEventListener("click", onDocumentClick);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("click", onDocumentClick);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div className="notify-bell" ref={rootRef}>
      <button
        type="button"
        className="notify-bell__trigger"
        aria-label="Thông báo"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
          <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
        </svg>
        {unreadCount > 0 ? (
          <span className="notify-bell__badge">{unreadCount > 9 ? "9+" : unreadCount}</span>
        ) : null}
      </button>

      {open ? (
        <div className="notify-bell__panel" role="region" aria-label="Danh sách thông báo">
          <div className="notify-bell__head">Thông báo</div>
          <div className="notify-bell__body">
            {items.length === 0 ? (
              <div className="empty-state empty-state--compact">
                <div className="empty-state__title">Chưa có thông báo</div>
                <div className="empty-state__text">Khi tháng được chốt, nhắc nợ sẽ hiện ở đây.</div>
              </div>
            ) : (
              items.map((item) => {
                const unread = !item.readAt;
                return (
                  <button
                    key={item.id}
                    type="button"
                    className={`notify-bell__item ${unread ? "is-unread" : ""}`.trim()}
                    onClick={() => {
                      if (unread) void markRead(item.id);
                    }}
                  >
                    <div className="notify-bell__item-top">
                      <span className="notify-bell__item-title">{item.title || "Thông báo"}</span>
                      {unread ? <span className="notify-bell__dot" aria-hidden="true" /> : null}
                    </div>
                    <div className="notify-bell__item-body">{item.body || ""}</div>
                    <div className="notify-bell__item-meta">{formatNotifyTime(item.createdAt)}</div>
                  </button>
                );
              })
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
