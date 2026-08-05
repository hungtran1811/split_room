import {
  collection,
  getDocs,
  orderBy,
  query,
  where,
  type Firestore,
  type QuerySnapshot,
  type DocumentData,
} from "firebase/firestore";
import { db } from "../config/firebase";
import { ROSTER } from "../config/roster";
import { wrapFirestoreError } from "../core/errors";
import { buildMonthlyReport } from "../domain/report/compute";
import { saveMonthlyReportSnapshot as savePeriodReportSnapshot } from "./period.service";
import { getRentByPeriod } from "./rent.service";
import { getMonthRange } from "./month-ops.service";

function requireDb(): Firestore {
  if (!db) {
    throw new Error("Firestore chưa được cấu hình.");
  }
  return db;
}

function normalizeDocs(snapshot: QuerySnapshot<DocumentData>) {
  return snapshot.docs.map((docSnap) => ({
    id: docSnap.id,
    ...docSnap.data(),
  }));
}

export function isMonthlyReportSnapshotDoc(docData: Record<string, unknown> | null | undefined): boolean {
  return (
    docData?.snapshotType === "monthly-report" &&
    !!docData?.snapshot &&
    typeof docData.snapshot === "object"
  );
}

export function normalizeMonthlyReportSnapshot(
  period: string,
  docData: Record<string, unknown>,
) {
  if (!isMonthlyReportSnapshotDoc(docData)) return null;

  const stats = docData.stats as Record<string, unknown> | undefined;
  const snapshot = docData.snapshot as Record<string, unknown> | undefined;

  return {
    period: (docData.period as string) || period,
    stats: {
      expenseCount: Number(stats?.expenseCount || 0),
      paymentCount: Number(stats?.paymentCount || 0),
      expenseTotal: Number(stats?.expenseTotal || 0),
      paymentTotal: Number(stats?.paymentTotal || 0),
      rentTotal: Number(stats?.rentTotal || 0),
      settlementCount: Number(stats?.settlementCount || 0),
    },
    balances: { ...(snapshot?.balances as Record<string, unknown> || {}) },
    settlementPlan: [...(snapshot?.settlementPlan as unknown[] || [])],
    rentSummary: snapshot?.rent || null,
    memberSummaries: [...(snapshot?.members as unknown[] || [])],
    meta: {
      source: "snapshot" as const,
      snapshotAt: docData.snapshotAt || null,
      snapshotBy: (docData.snapshotBy as string) || "",
      reportVersion: Number(docData.reportVersion || 1),
      createdAt: docData.createdAt || null,
      updatedAt: docData.updatedAt || null,
    },
  };
}

export function toPeriodSummary(periodDoc: Record<string, unknown> & { id?: string }) {
  if (!isMonthlyReportSnapshotDoc(periodDoc)) return null;

  const stats = periodDoc.stats as Record<string, unknown> | undefined;

  return {
    period: (periodDoc.period as string) || periodDoc.id,
    snapshotAt: periodDoc.snapshotAt || null,
    snapshotBy: (periodDoc.snapshotBy as string) || "",
    updatedAt: periodDoc.updatedAt || null,
    stats: {
      expenseCount: Number(stats?.expenseCount || 0),
      paymentCount: Number(stats?.paymentCount || 0),
      expenseTotal: Number(stats?.expenseTotal || 0),
      paymentTotal: Number(stats?.paymentTotal || 0),
      rentTotal: Number(stats?.rentTotal || 0),
      settlementCount: Number(stats?.settlementCount || 0),
    },
  };
}

async function listExpensesByRange(groupId: string, startDate: string, endDate: string) {
  const firestore = requireDb();
  const ref = collection(firestore, "groups", groupId, "expenses");
  const q = query(
    ref,
    where("date", ">=", startDate),
    where("date", "<", endDate),
    orderBy("date", "desc"),
    orderBy("createdAt", "desc"),
  );
  const snap = await getDocs(q);
  return normalizeDocs(snap);
}

async function listPaymentsByRange(groupId: string, startDate: string, endDate: string) {
  const firestore = requireDb();
  const ref = collection(firestore, "groups", groupId, "payments");
  const q = query(
    ref,
    where("date", ">=", startDate),
    where("date", "<", endDate),
    orderBy("date", "asc"),
    orderBy("createdAt", "asc"),
  );
  const snap = await getDocs(q);
  return normalizeDocs(snap);
}

export async function getMonthlyReportLive(groupId: string, period: string) {
  try {
    const { start, end } = getMonthRange(period);
    const [expenses, payments, rent] = await Promise.all([
      listExpensesByRange(groupId, start, end),
      listPaymentsByRange(groupId, start, end),
      getRentByPeriod(groupId, period),
    ]);

    return {
      ...buildMonthlyReport({
        period,
        roster: [...ROSTER],
        expenses,
        payments,
        rent,
      }),
      meta: {
        source: "live" as const,
      },
    };
  } catch (error) {
    throw wrapFirestoreError(
      error,
      `Không thể tải báo cáo tháng ${period}.`,
    );
  }
}

export async function saveMonthlyReportSnapshot(
  groupId: string,
  period: string,
  report: Record<string, unknown>,
  actor: { uid?: string } | null | undefined,
): Promise<void> {
  try {
    await savePeriodReportSnapshot(groupId, period, {
      snapshotBy: actor?.uid || "",
      stats: report.stats,
      snapshot: {
        balances: report.balances,
        settlementPlan: report.settlementPlan,
        rent: report.rentSummary,
        members: report.memberSummaries,
      },
    });
  } catch (error) {
    throw wrapFirestoreError(
      error,
      `Không thể lưu snapshot báo cáo tháng ${period}.`,
    );
  }
}
