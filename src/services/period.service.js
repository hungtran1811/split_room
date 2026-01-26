import { db } from "../config/firebase";
import {
  doc,
  setDoc,
  getDoc,
  collection,
  getDocs,
  query,
  orderBy,
  serverTimestamp,
} from "firebase/firestore";

export async function savePeriodSnapshot(groupId, period, payload) {
  // doc id: YYYY-MM (vd: 2026-01)
  const ref = doc(db, "groups", groupId, "periods", period);

  const data = {
    period,
    lockedSoft: true, // chốt mềm
    lockedAt: serverTimestamp(),
    lockedBy: payload.lockedBy,
    stats: payload.stats,
    snapshot: payload.snapshot,
    updatedAt: serverTimestamp(), // lần cập nhật snapshot gần nhất
  };

  // merge true: chốt lại tháng đó sẽ overwrite snapshot + updatedAt
  await setDoc(ref, data, { merge: true });
}

export async function getPeriod(groupId, period) {
  const ref = doc(db, "groups", groupId, "periods", period);
  const snap = await getDoc(ref);
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

export async function listPeriods(groupId) {
  const colRef = collection(db, "groups", groupId, "periods");
  const q = query(colRef, orderBy("period", "desc"));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}
