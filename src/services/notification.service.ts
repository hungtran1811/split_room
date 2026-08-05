import {
  collection,
  doc,
  onSnapshot,
  query,
  serverTimestamp,
  updateDoc,
  where,
  writeBatch,
  type Firestore,
  type Unsubscribe,
} from "firebase/firestore";
import { db } from "../config/firebase";
import { ROSTER, nameOf } from "../config/roster";
import { formatVND } from "../config/i18n";

function requireDb(): Firestore {
  if (!db) {
    throw new Error("Firestore chưa được cấu hình.");
  }
  return db;
}

function formatSettlementLine(item: Record<string, unknown>, memberId: string): string {
  const amount = formatVND(Number(item.amount || 0));
  if (item.fromId === memberId) {
    return `Bạn cần chuyển ${amount} cho ${nameOf(String(item.toId))}`;
  }
  return `${nameOf(String(item.fromId))} cần chuyển ${amount} cho bạn`;
}

function escapeHtml(value: unknown): string {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

/**
 * Watch notifications for the signed-in user in a group.
 * @returns unsubscribe function
 */
export function watchMyNotifications(
  groupId: string,
  uid: string,
  cb: (items: Array<Record<string, unknown> & { id: string }>) => void,
): Unsubscribe {
  const firestore = requireDb();
  const q = query(
    collection(firestore, "groups", groupId, "notifications"),
    where("uid", "==", uid),
  );

  return onSnapshot(q, (snap) => {
    const items = snap.docs
      .map((docSnap) => ({ id: docSnap.id, ...docSnap.data() } as Record<string, unknown> & { id: string }))
      .sort((left, right) => {
        const leftMs = (left.createdAt as { toMillis?: () => number })?.toMillis?.() || 0;
        const rightMs = (right.createdAt as { toMillis?: () => number })?.toMillis?.() || 0;
        return rightMs - leftMs;
      });
    cb(items);
  });
}

export async function markNotificationRead(groupId: string, id: string): Promise<void> {
  const firestore = requireDb();
  const ref = doc(firestore, "groups", groupId, "notifications", id);
  await updateDoc(ref, { readAt: serverTimestamp() });
}

/**
 * Client-side fan-out when Cloud Functions are not deployed yet.
 * Writes in-app notifications + pending mailOutbox docs.
 */
export async function fanOutMonthClosed(
  groupId: string,
  {
    period,
    settlementPlan = [],
    members = [],
    closedBy = null,
  }: {
    period?: string;
    settlementPlan?: Record<string, unknown>[];
    members?: Record<string, unknown>[];
    closedBy?: string | null;
  } = {},
): Promise<void> {
  const firestore = requireDb();
  const batch = writeBatch(firestore);
  const now = serverTimestamp();

  for (const member of members) {
    const uid = (member.uid || member.id) as string | undefined;
    const memberId = member.memberId as string | undefined;
    if (!uid || !memberId) continue;

    const personalPlan = settlementPlan.filter(
      (item) => item.fromId === memberId || item.toId === memberId,
    );
    const lines = personalPlan.map((item) => formatSettlementLine(item, memberId));
    const title = `Tháng ${period} đã được chốt`;
    const body = lines.length
      ? `${lines.join(". ")}.`
      : `Bạn không còn khoản cấn trừ trong tháng ${period}.`;

    const notificationRef = doc(
      collection(firestore, "groups", groupId, "notifications"),
    );
    batch.set(notificationRef, {
      uid,
      memberId,
      type: "month-closed",
      period,
      title,
      body,
      settlement: personalPlan,
      readAt: null,
      createdAt: now,
      closedBy: closedBy || null,
    });

    const email = String(member.email || "").trim();
    if (!email) continue;

    const name = (member.displayName as string) || nameOf(memberId);
    const subject = `[SplitRoom ${groupId}] Đã chốt tháng ${period}`;
    const summary = lines.length
      ? lines.map((line) => `• ${line}`).join("\n")
      : `• Bạn không còn khoản cấn trừ trong tháng ${period}.`;
    const text = [
      `Xin chào ${name},`,
      "",
      `Tháng ${period} của nhóm ${groupId} đã được chốt sổ.`,
      "",
      "Tóm tắt cấn trừ của bạn:",
      summary,
      "",
      "Bạn có thể xem chi tiết trong ứng dụng SplitRoom.",
      "",
      "— SplitRoom",
    ].join("\n");
    const html = `
      <p>Xin chào <strong>${escapeHtml(name)}</strong>,</p>
      <p>Tháng <strong>${escapeHtml(period)}</strong> của nhóm <strong>${escapeHtml(groupId)}</strong> đã được chốt sổ.</p>
      <p>Tóm tắt cấn trừ của bạn:</p>
      <ul>
        ${
          lines.length
            ? lines.map((line) => `<li>${escapeHtml(line)}</li>`).join("")
            : `<li>Bạn không còn khoản cấn trừ trong tháng ${escapeHtml(period)}.</li>`
        }
      </ul>
      <p>Bạn có thể xem chi tiết trong ứng dụng SplitRoom.</p>
      <p>— SplitRoom</p>
    `.trim();

    const mailRef = doc(collection(firestore, "groups", groupId, "mailOutbox"));
    batch.set(mailRef, {
      to: email,
      uid,
      memberId,
      period,
      groupId,
      type: "month-closed",
      subject,
      text,
      html,
      status: "pending",
      createdAt: now,
      closedBy: closedBy || null,
    });
  }

  await batch.commit();
}

/** Helper for tests / UI: roster-aware empty settlement message. */
export function emptySettlementMessage(period: string): string {
  return `Bạn không còn khoản cấn trừ trong tháng ${period}.`;
}

export function rosterLabel(memberId: string): string {
  return ROSTER.find((member) => member.id === memberId)?.name || memberId;
}
