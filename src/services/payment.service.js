import { db } from "../config/firebase";
import {
  collection,
  addDoc,
  getDocs,
  query,
  orderBy,
  deleteDoc,
  doc,
  serverTimestamp,
  updateDoc,
} from "firebase/firestore";
import { onSnapshot, where } from "firebase/firestore";

export async function addPayment(groupId, payload) {
  const colRef = collection(db, "groups", groupId, "payments");
  const data = {
    ...payload,
    createdAt: serverTimestamp(),
  };
  const res = await addDoc(colRef, data);
  return res.id;
}

export async function listPayments(groupId) {
  const colRef = collection(db, "groups", groupId, "payments");
  const q = query(
    colRef,
    orderBy("date", "desc"),
    orderBy("createdAt", "desc"),
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function removePayment(groupId, paymentId) {
  const ref = doc(db, "groups", groupId, "payments", paymentId);
  await deleteDoc(ref);
}

export function watchPayments(groupId, onChange) {
  const colRef = collection(db, "groups", groupId, "payments");
  const q = query(
    colRef,
    orderBy("date", "desc"),
    orderBy("createdAt", "desc"),
  );

  return onSnapshot(q, (snap) => {
    const items = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    onChange(items);
  });
}

export function watchPaymentsByRange(groupId, start, end, cb) {
  const ref = collection(db, "groups", groupId, "payments");

  const q = query(
    ref,
    where("date", ">=", start),
    where("date", "<", end),
    orderBy("date", "asc"),
    orderBy("createdAt", "asc"),
  );

  return onSnapshot(q, (snap) => {
    const items = snap.docs.map((d) => ({
      id: d.id,
      ...d.data(),
    }));
    cb(items);
  });
}

export async function updatePayment(groupId, paymentId, patch) {
  const ref = doc(db, "groups", groupId, "payments", paymentId);
  await updateDoc(ref, {
    ...patch,
    updatedAt: serverTimestamp(),
  });
}
