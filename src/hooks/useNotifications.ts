import { useCallback, useEffect, useState } from "react";
import type { NotificationDoc } from "../types/models";
import { markNotificationRead, watchMyNotifications } from "../services/notification.service";

export function useNotifications(groupId: string | null | undefined, uid: string | null | undefined) {
  const [items, setItems] = useState<NotificationDoc[]>([]);

  useEffect(() => {
    if (!groupId || !uid) {
      setItems([]);
      return;
    }

    const unsubscribe = watchMyNotifications(groupId, uid, (nextItems) => {
      setItems(nextItems as NotificationDoc[]);
    });

    return unsubscribe;
  }, [groupId, uid]);

  const markRead = useCallback(
    async (id: string) => {
      if (!groupId) return;
      await markNotificationRead(groupId, id);
      setItems((current) =>
        current.map((item) => (item.id === id ? { ...item, readAt: new Date() } : item)),
      );
    },
    [groupId],
  );

  const unreadCount = items.filter((item) => !item.readAt).length;

  return { items, unreadCount, markRead };
}
