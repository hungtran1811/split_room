// src/services/rent.service.js
import { db } from "../config/firebase";
import {
  doc,
  setDoc,
  updateDoc,
  serverTimestamp,
  onSnapshot,
  getDoc,
  collection,
  query,
  where,
  orderBy,
  limit,
  getDocs,
  documentId,
} from "firebase/firestore";
/**
 * Doc id = period (VD: "2026-02") để upsert dễ
 * Path: groups/{groupId}/rents/{period}
 */
export async function upsertRentByPeriod(groupId, period, payload) {
  const ref = doc(db, "groups", groupId, "rents", period);
  await setDoc(
    ref,
    {
      ...payload,
      period,
      updatedAt: serverTimestamp(),
      createdAt: payload?.createdAt || serverTimestamp(),
    },
    { merge: true },
  );
  return period;
}

export async function updateRentByPeriod(groupId, period, patch) {
  const ref = doc(db, "groups", groupId, "rents", period);
  await updateDoc(ref, { ...patch, updatedAt: serverTimestamp() });
}

export function watchRentByPeriod(groupId, period, cb) {
  const ref = doc(db, "groups", groupId, "rents", period);
  return onSnapshot(ref, (snap) => {
    cb(snap.exists() ? { id: snap.id, ...snap.data() } : null);
  });
}

export async function getRentByPeriod(groupId, period) {
  const ref = doc(db, "groups", groupId, "rents", period);
  const snap = await getDoc(ref);
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

export async function getLatestRentBefore(groupId, period) {
  const colRef = collection(db, "groups", groupId, "rents");

  const q = query(
    colRef,
    where(documentId(), "<", period),
    orderBy(documentId(), "desc"),
    limit(1),
  );

  const snap = await getDocs(q);
  if (snap.empty) return null;

  const d = snap.docs[0];
  return { id: d.id, ...d.data() };
}
