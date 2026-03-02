import { collection, getDocs, orderBy, query, where } from "firebase/firestore";
import { db } from "../config/firebase";
import { ROSTER } from "../config/roster";
import { wrapFirestoreError } from "../core/errors";
import { buildMonthlyReport } from "../domain/report/compute";
import {
  getPeriod,
  listPeriods,
  saveMonthlyReportSnapshot as savePeriodReportSnapshot,
} from "./period.service";
import { getRentByPeriod } from "./rent.service";

function getMonthRange(period) {
  const [year, month] = String(period || "").split("-").map(Number);
  const start = `${String(year).padStart(4, "0")}-${String(month).padStart(
    2,
    "0",
  )}-01`;
  const next = new Date(year, month - 1, 1);
  next.setMonth(next.getMonth() + 1);

  return {
    start,
    end: `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(
      2,
      "0",
    )}-01`,
  };
}

function normalizeDocs(snapshot) {
  return snapshot.docs.map((docSnap) => ({
    id: docSnap.id,
    ...docSnap.data(),
  }));
}

export function isMonthlyReportSnapshotDoc(docData) {
  return (
    docData?.snapshotType === "monthly-report" &&
    !!docData?.snapshot &&
    typeof docData.snapshot === "object"
  );
}

export function normalizeMonthlyReportSnapshot(period, docData) {
  if (!isMonthlyReportSnapshotDoc(docData)) return null;

  return {
    period: docData.period || period,
    stats: {
      expenseCount: Number(docData.stats?.expenseCount || 0),
      paymentCount: Number(docData.stats?.paymentCount || 0),
      expenseTotal: Number(docData.stats?.expenseTotal || 0),
      paymentTotal: Number(docData.stats?.paymentTotal || 0),
      rentTotal: Number(docData.stats?.rentTotal || 0),
      settlementCount: Number(docData.stats?.settlementCount || 0),
    },
    balances: { ...(docData.snapshot?.balances || {}) },
    settlementPlan: [...(docData.snapshot?.settlementPlan || [])],
    rentSummary: docData.snapshot?.rent || null,
    memberSummaries: [...(docData.snapshot?.members || [])],
    meta: {
      source: "snapshot",
      snapshotAt: docData.snapshotAt || null,
      snapshotBy: docData.snapshotBy || "",
      reportVersion: Number(docData.reportVersion || 1),
      createdAt: docData.createdAt || null,
      updatedAt: docData.updatedAt || null,
    },
  };
}

export function toPeriodSummary(periodDoc) {
  if (!isMonthlyReportSnapshotDoc(periodDoc)) return null;

  return {
    period: periodDoc.period || periodDoc.id,
    snapshotAt: periodDoc.snapshotAt || null,
    snapshotBy: periodDoc.snapshotBy || "",
    updatedAt: periodDoc.updatedAt || null,
    stats: {
      expenseCount: Number(periodDoc.stats?.expenseCount || 0),
      paymentCount: Number(periodDoc.stats?.paymentCount || 0),
      expenseTotal: Number(periodDoc.stats?.expenseTotal || 0),
      paymentTotal: Number(periodDoc.stats?.paymentTotal || 0),
      rentTotal: Number(periodDoc.stats?.rentTotal || 0),
      settlementCount: Number(periodDoc.stats?.settlementCount || 0),
    },
  };
}

async function listExpensesByRange(groupId, startDate, endDate) {
  const ref = collection(db, "groups", groupId, "expenses");
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

async function listPaymentsByRange(groupId, startDate, endDate) {
  const ref = collection(db, "groups", groupId, "payments");
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

export async function getMonthlyReportLive(groupId, period) {
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
        roster: ROSTER,
        expenses,
        payments,
        rent,
      }),
      meta: {
        source: "live",
      },
    };
  } catch (error) {
    throw wrapFirestoreError(
      error,
      `Không thể tải báo cáo tháng ${period}.`,
    );
  }
}

export async function getMonthlyReportSnapshot(groupId, period) {
  try {
    const periodDoc = await getPeriod(groupId, period);
    return normalizeMonthlyReportSnapshot(period, periodDoc);
  } catch (error) {
    throw wrapFirestoreError(
      error,
      `Không thể tải snapshot báo cáo tháng ${period}.`,
    );
  }
}

export async function listMonthlyReportPeriods(groupId) {
  try {
    const periods = await listPeriods(groupId);
    return periods.map(toPeriodSummary).filter(Boolean);
  } catch (error) {
    throw wrapFirestoreError(error, "Không thể tải lịch sử snapshot.");
  }
}

export async function saveMonthlyReportSnapshot(groupId, period, report, actor) {
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
