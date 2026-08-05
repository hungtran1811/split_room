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
  onSnapshot,
  where,
  type Firestore,
  type Unsubscribe,
} from "firebase/firestore";
import { db } from "../config/firebase";
import { clearHistoricalCache } from "./live-data-hub";

function requireDb(): Firestore {
  if (!db) {
    throw new Error("Firestore chưa được cấu hình.");
  }
  return db;
}

export async function addExpense(
  groupId: string,
  payload: Record<string, unknown>,
): Promise<string> {
  const firestore = requireDb();
  const colRef = collection(firestore, "groups", groupId, "expenses");
  const data = {
    ...payload,
    createdAt: serverTimestamp(),
  };
  const res = await addDoc(colRef, data);
  clearHistoricalCache();
  return res.id;
}

export async function removeExpense(groupId: string, expenseId: string): Promise<void> {
  const firestore = requireDb();
  const ref = doc(firestore, "groups", groupId, "expenses", expenseId);
  await deleteDoc(ref);
  clearHistoricalCache();
}

export async function fetchExpensesBefore(
  groupId: string,
  beforeDate: string,
): Promise<Array<Record<string, unknown> & { id: string }>> {
  const firestore = requireDb();
  const colRef = collection(firestore, "groups", groupId, "expenses");
  const q = query(
    colRef,
    where("date", "<", beforeDate),
    orderBy("date", "desc"),
    orderBy("createdAt", "desc"),
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export function watchExpensesByRange(
  groupId: string,
  startDate: string,
  endDate: string,
  onChange: (items: Array<Record<string, unknown> & { id: string }>) => void,
): Unsubscribe {
  const firestore = requireDb();
  const colRef = collection(firestore, "groups", groupId, "expenses");

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

export async function updateExpense(
  groupId: string,
  expenseId: string,
  patch: Record<string, unknown>,
): Promise<void> {
  const firestore = requireDb();
  const ref = doc(firestore, "groups", groupId, "expenses", expenseId);
  await updateDoc(ref, {
    ...patch,
    updatedAt: serverTimestamp(),
  });
  clearHistoricalCache();
}
