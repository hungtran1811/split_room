import { getFunctions, httpsCallable } from "firebase/functions";
import { collection, getDocs, type Firestore } from "firebase/firestore";
import { fbApp, db } from "../config/firebase";
import { wrapFirestoreError } from "../core/errors";
import { savePeriodSnapshot } from "./period.service";
import { fanOutMonthClosed } from "./notification.service";
import { getMonthlyReportLive } from "./report.service";

function requireDb(): Firestore {
  if (!db) {
    throw new Error("Firestore chưa được cấu hình.");
  }
  return db;
}

function shouldFallbackToClient(error: unknown): boolean {
  const code = String((error as { code?: string })?.code || "");
  return (
    code === "functions/not-found" ||
    code === "functions/unavailable" ||
    code === "functions/unimplemented" ||
    code === "functions/internal" ||
    code === "functions/failed-precondition" ||
    /not found|unimplemented|unavailable/i.test(String((error as { message?: string })?.message || ""))
  );
}

async function listGroupMembers(groupId: string) {
  const firestore = requireDb();
  const snap = await getDocs(collection(firestore, "groups", groupId, "members"));
  return snap.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }));
}

async function closeMonthOnClient(
  groupId: string,
  period: string,
  { uid, liveReport }: { uid?: string; liveReport?: Record<string, unknown> },
) {
  const members = await listGroupMembers(groupId);
  const report = liveReport || (await getMonthlyReportLive(groupId, period));

  const closePayload = {
    lockedBy: uid,
    closedBy: uid,
    closeSource: "manual",
    stats: report.stats,
    snapshot: {
      balances: report.balances,
      settlementPlan: report.settlementPlan,
      rent: report.rentSummary,
      members: report.memberSummaries,
    },
  };

  await savePeriodSnapshot(groupId, period, closePayload);

  await fanOutMonthClosed(groupId, {
    period,
    settlementPlan: (closePayload.snapshot.settlementPlan || []) as Record<string, unknown>[],
    members,
    closedBy: uid || null,
  });

  return {
    ok: true,
    source: "client-fallback" as const,
    period,
    groupId,
  };
}

/**
 * Manual month close: prefer callable Cloud Function, fall back to client write.
 */
export async function closeMonthManual(
  groupId: string,
  period: string,
  { uid, liveReport }: { uid?: string; liveReport?: Record<string, unknown> } = {},
) {
  if (!groupId || !period) {
    throw new Error("Thiếu groupId hoặc period.");
  }

  if (fbApp) {
    try {
      const functions = getFunctions(fbApp);
      const callable = httpsCallable(functions, "manualMonthClose");
      const result = await callable({ groupId, period });
      return {
        ok: true,
        source: "callable" as const,
        ...((result?.data as Record<string, unknown>) || {}),
      };
    } catch (error) {
      if (!shouldFallbackToClient(error)) {
        throw wrapFirestoreError(error, "Không thể chốt tháng qua Cloud Functions.");
      }
      // Functions not deployed / unreachable — fall back.
    }
  }

  try {
    return await closeMonthOnClient(groupId, period, { uid, liveReport });
  } catch (error) {
    throw wrapFirestoreError(error, `Không thể chốt tháng ${period}.`);
  }
}
