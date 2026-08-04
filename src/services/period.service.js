import { db } from "../config/firebase";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
} from "firebase/firestore";

function periodDocRef(groupId, period) {
  return doc(db, "groups", groupId, "periods", period);
}

export function buildMonthlyReportSnapshotPayload(period, payload, existingDoc = null) {
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

export function buildMonthClosePayload(period, payload, existingDoc = null) {
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

export async function savePeriodSnapshot(groupId, period, payload) {
  const ref = periodDocRef(groupId, period);
  const existing = await getDoc(ref);
  const currentData = existing.exists() ? existing.data() : null;
  const data = buildMonthClosePayload(period, payload, currentData);
  await setDoc(ref, data, { merge: true });
}

export async function saveMonthlyReportSnapshot(groupId, period, payload) {
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

export async function getPeriod(groupId, period) {
  const snap = await getDoc(periodDocRef(groupId, period));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

export async function listPeriods(groupId) {
  const colRef = collection(db, "groups", groupId, "periods");
  const q = query(colRef, orderBy("period", "desc"));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}
