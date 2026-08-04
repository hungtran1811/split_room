import { initializeApp } from "firebase-admin/app";
import { FieldValue, getFirestore } from "firebase-admin/firestore";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { onDocumentCreated } from "firebase-functions/v2/firestore";
import {
  DEFAULT_GROUP_ID,
  buildCloseSnapshot,
  buildMailOutboxItems,
  buildMemberNotifications,
  currentPeriodInTz,
  getMonthRange,
  previousPeriod,
} from "./monthClose.js";

initializeApp();

const db = getFirestore();

async function listDocsByDateRange(groupId, collectionName, period) {
  const { start, end } = getMonthRange(period);
  const snap = await db
    .collection("groups")
    .doc(groupId)
    .collection(collectionName)
    .where("date", ">=", start)
    .where("date", "<", end)
    .get();

  return snap.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }));
}

async function loadMembers(groupId) {
  const snap = await db.collection("groups").doc(groupId).collection("members").get();
  return snap.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }));
}

async function loadRent(groupId, period) {
  const rentRef = db.collection("groups").doc(groupId).collection("rents").doc(period);
  const rentSnap = await rentRef.get();
  if (rentSnap.exists) return { id: rentSnap.id, ...rentSnap.data() };

  const periodSnap = await db
    .collection("groups")
    .doc(groupId)
    .collection("periods")
    .doc(period)
    .get();

  if (periodSnap.exists && periodSnap.data()?.rent) {
    return periodSnap.data().rent;
  }

  return null;
}

/**
 * Shared close path: lock period, write snapshot, fan out notifications + mail.
 */
export async function closeMonth(groupId, period, { source = "manual", closedBy = null } = {}) {
  const periodRef = db.collection("groups").doc(groupId).collection("periods").doc(period);
  const existing = await periodRef.get();

  if (existing.exists && existing.data()?.lockedSoft === true) {
    return {
      ok: true,
      skipped: true,
      reason: "already-locked",
      period,
      groupId,
    };
  }

  const [expenses, payments, rent, members] = await Promise.all([
    listDocsByDateRange(groupId, "expenses", period),
    listDocsByDateRange(groupId, "payments", period),
    loadRent(groupId, period),
    loadMembers(groupId),
  ]);

  const closeSnapshot = buildCloseSnapshot({
    expenses,
    payments,
    rent,
    members,
  });

  const now = FieldValue.serverTimestamp();
  const periodPayload = {
    period,
    lockedSoft: true,
    lockedAt: now,
    lockedBy: closedBy,
    closedAt: now,
    closedBy,
    closeSource: source,
    snapshotType: "month-close",
    reportVersion: 1,
    stats: closeSnapshot.stats,
    snapshot: closeSnapshot.snapshot,
    updatedAt: now,
    createdAt: existing.exists ? existing.data()?.createdAt || now : now,
  };

  const batch = db.batch();
  batch.set(periodRef, periodPayload, { merge: true });

  const notifications = buildMemberNotifications(
    closeSnapshot.settlementPlan,
    members,
    period,
  );
  for (const notification of notifications) {
    const ref = db.collection("groups").doc(groupId).collection("notifications").doc();
    batch.set(ref, {
      ...notification,
      createdAt: now,
    });
  }

  const mailItems = buildMailOutboxItems({
    settlementPlan: closeSnapshot.settlementPlan,
    members,
    period,
    groupId,
  });
  for (const item of mailItems) {
    const ref = db.collection("groups").doc(groupId).collection("mailOutbox").doc();
    batch.set(ref, {
      ...item,
      createdAt: now,
    });
  }

  await batch.commit();

  return {
    ok: true,
    skipped: false,
    period,
    groupId,
    source,
    notificationCount: notifications.length,
    mailCount: mailItems.length,
    stats: closeSnapshot.stats,
  };
}

export const scheduledMonthClose = onSchedule(
  {
    schedule: "15 0 1 * *",
    timeZone: "Asia/Ho_Chi_Minh",
  },
  async () => {
    const current = currentPeriodInTz(new Date(), "Asia/Ho_Chi_Minh");
    const period = previousPeriod(current);
    const result = await closeMonth(DEFAULT_GROUP_ID, period, {
      source: "schedule",
      closedBy: "system:scheduledMonthClose",
    });
    console.log("[scheduledMonthClose]", result);
    return result;
  },
);

export const manualMonthClose = onCall(async (request) => {
  if (!request.auth?.uid) {
    throw new HttpsError("unauthenticated", "Cần đăng nhập để chốt tháng.");
  }

  const groupId = String(request.data?.groupId || DEFAULT_GROUP_ID).trim();
  const period = String(request.data?.period || "").trim();

  if (!/^\d{4}-\d{2}$/.test(period)) {
    throw new HttpsError("invalid-argument", "Period phải là YYYY-MM.");
  }

  const memberSnap = await db
    .collection("groups")
    .doc(groupId)
    .collection("members")
    .doc(request.auth.uid)
    .get();

  if (!memberSnap.exists || memberSnap.data()?.role !== "owner") {
    throw new HttpsError(
      "permission-denied",
      "Chỉ owner của nhóm mới được chốt tháng.",
    );
  }

  return closeMonth(groupId, period, {
    source: "manual",
    closedBy: request.auth.uid,
  });
});

async function sendViaResend({ to, subject, html, text }) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.CLOSE_FROM_EMAIL;

  if (!apiKey || !from) {
    throw new Error("Thiếu RESEND_API_KEY hoặc CLOSE_FROM_EMAIL.");
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [to],
      subject,
      html,
      text,
    }),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message =
      payload?.message || payload?.error || `Resend HTTP ${response.status}`;
    throw new Error(message);
  }

  return payload;
}

export const processMailOutbox = onDocumentCreated(
  "groups/{groupId}/mailOutbox/{mailId}",
  async (event) => {
    const snap = event.data;
    if (!snap) return null;

    const data = snap.data() || {};
    if (data.status !== "pending") return null;

    const ref = snap.ref;

    try {
      const result = await sendViaResend({
        to: data.to,
        subject: data.subject,
        html: data.html,
        text: data.text,
      });

      await ref.update({
        status: "sent",
        sentAt: FieldValue.serverTimestamp(),
        provider: "resend",
        providerId: result?.id || null,
        error: null,
      });
    } catch (error) {
      await ref.update({
        status: "failed",
        failedAt: FieldValue.serverTimestamp(),
        error: String(error?.message || error),
      });
      console.error("[processMailOutbox]", error);
    }

    return null;
  },
);
