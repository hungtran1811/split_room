import {
  collection,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  type Firestore,
} from "firebase/firestore";
import { db } from "../config/firebase";

function requireDb(): Firestore {
  if (!db) {
    throw new Error("Firestore chưa được cấu hình.");
  }
  return db;
}

function periodDocRef(groupId: string, period: string) {
  return doc(requireDb(), "groups", groupId, "periods", period);
}

export function buildMonthlyReportSnapshotPayload(
  period: string,
  payload: Record<string, unknown>,
  existingDoc: Record<string, unknown> | null = null,
) {
  return {
    period,
    snapshotType: "monthly-report",
    reportVersion: 1,
    snapshotAt: serverTimestamp(),
    snapshotBy: payload.snapshotBy,
    stats: payload.stats,
    snapshot: payload.snapshot,
    updatedAt: serverTimestamp(),
    createdAt: existingDoc?.createdAt || serverTimestamp(),
  };
}

export function buildMonthClosePayload(
  period: string,
  payload: Record<string, unknown>,
  existingDoc: Record<string, unknown> | null = null,
) {
  return {
    period,
    lockedSoft: true,
    lockedAt: serverTimestamp(),
    lockedBy: payload.lockedBy || payload.closedBy || null,
    closedAt: serverTimestamp(),
    closedBy: payload.closedBy || payload.lockedBy || null,
    closeSource: payload.closeSource || "manual",
    snapshotType: "month-close",
    reportVersion: 1,
    stats: payload.stats || {},
    snapshot: payload.snapshot || {},
    updatedAt: serverTimestamp(),
    createdAt: existingDoc?.createdAt || serverTimestamp(),
  };
}

export async function savePeriodSnapshot(
  groupId: string,
  period: string,
  payload: Record<string, unknown>,
): Promise<void> {
  const ref = periodDocRef(groupId, period);
  const existing = await getDoc(ref);
  const currentData = existing.exists() ? existing.data() : null;
  const data = buildMonthClosePayload(period, payload, currentData);
  await setDoc(ref, data, { merge: true });
}

export async function saveMonthlyReportSnapshot(
  groupId: string,
  period: string,
  payload: Record<string, unknown>,
): Promise<void> {
  const ref = periodDocRef(groupId, period);
  const existing = await getDoc(ref);
  const currentData = existing.exists() ? existing.data() : null;
  const nextPayload = buildMonthlyReportSnapshotPayload(
    period,
    payload,
    currentData,
  );

  await setDoc(ref, nextPayload, { merge: true });
}

export async function getPeriod(
  groupId: string,
  period: string,
): Promise<(Record<string, unknown> & { id: string }) | null> {
  const snap = await getDoc(periodDocRef(groupId, period));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

export async function listPeriods(
  groupId: string,
): Promise<Array<Record<string, unknown> & { id: string }>> {
  const firestore = requireDb();
  const colRef = collection(firestore, "groups", groupId, "periods");
  const q = query(colRef, orderBy("period", "desc"));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}
