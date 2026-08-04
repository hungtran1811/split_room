import {
  collection,
  doc,
  onSnapshot,
  query,
  serverTimestamp,
  updateDoc,
  where,
  writeBatch,
} from "firebase/firestore";
import { db } from "../config/firebase";
import { ROSTER, nameOf } from "../config/roster";
import { formatVND } from "../config/i18n";

function formatSettlementLine(item, memberId) {
  const amount = formatVND(item.amount || 0);
  if (item.fromId === memberId) {
    return `Bạn cần chuyển ${amount} cho ${nameOf(item.toId)}`;
  }
  return `${nameOf(item.fromId)} cần chuyển ${amount} cho bạn`;
}

function escapeHtml(value) {
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
export function watchMyNotifications(groupId, uid, cb) {
  const q = query(
    collection(db, "groups", groupId, "notifications"),
    where("uid", "==", uid),
  );

  return onSnapshot(q, (snap) => {
    const items = snap.docs
      .map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }))
      .sort((left, right) => {
        const leftMs = left.createdAt?.toMillis?.() || 0;
        const rightMs = right.createdAt?.toMillis?.() || 0;
        return rightMs - leftMs;
      });
    cb(items);
  });
}

export async function markNotificationRead(groupId, id) {
  const ref = doc(db, "groups", groupId, "notifications", id);
  await updateDoc(ref, { readAt: serverTimestamp() });
}

/**
 * Client-side fan-out when Cloud Functions are not deployed yet.
 * Writes in-app notifications + pending mailOutbox docs.
 */
export async function fanOutMonthClosed(
  groupId,
  { period, settlementPlan = [], members = [], closedBy = null } = {},
) {
  const batch = writeBatch(db);
  const now = serverTimestamp();

  for (const member of members) {
    const uid = member.uid || member.id;
    const memberId = member.memberId;
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
      collection(db, "groups", groupId, "notifications"),
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

    const name = member.displayName || nameOf(memberId);
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

    const mailRef = doc(collection(db, "groups", groupId, "mailOutbox"));
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
export function emptySettlementMessage(period) {
  return `Bạn không còn khoản cấn trừ trong tháng ${period}.`;
}

export function rosterLabel(memberId) {
  return ROSTER.find((member) => member.id === memberId)?.name || memberId;
}
