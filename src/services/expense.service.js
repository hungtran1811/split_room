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

export async function addExpense(groupId, payload) {
  const colRef = collection(db, "groups", groupId, "expenses");
  const data = {
    ...payload,
    createdAt: serverTimestamp(),
  };
  const res = await addDoc(colRef, data);
  return res.id;
}

export async function listExpenses(groupId) {
  const colRef = collection(db, "groups", groupId, "expenses");
  // date dạng YYYY-MM-DD thì orderBy string OK
  const q = query(
    colRef,
    orderBy("date", "desc"),
    orderBy("createdAt", "desc"),
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function removeExpense(groupId, expenseId) {
  const ref = doc(db, "groups", groupId, "expenses", expenseId);
  await deleteDoc(ref);
}

export function watchExpenses(groupId, onChange) {
  const colRef = collection(db, "groups", groupId, "expenses");
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

export function watchExpensesByRange(groupId, startDate, endDate, onChange) {
  const colRef = collection(db, "groups", groupId, "expenses");

  // where + orderBy(date) => có thể cần index (Firestore sẽ báo link tạo)
  const q = query(
    colRef,
    where("date", ">=", startDate),
    where("date", "<", endDate),
    orderBy("date", "desc"),
    orderBy("createdAt", "desc"),
  );

  return onSnapshot(q, (snap) => {
    const items = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    onChange(items);
  });
}

export async function updateExpense(groupId, expenseId, patch) {
  const ref = doc(db, "groups", groupId, "expenses", expenseId);
  await updateDoc(ref, {
    ...patch,
    updatedAt: serverTimestamp(),
  });
}
