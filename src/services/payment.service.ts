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

export async function addPayment(
  groupId: string,
  payload: Record<string, unknown>,
): Promise<string> {
  const firestore = requireDb();
  const colRef = collection(firestore, "groups", groupId, "payments");
  const data = {
    ...payload,
    createdAt: serverTimestamp(),
  };
  const res = await addDoc(colRef, data);
  clearHistoricalCache();
  return res.id;
}

export async function removePayment(groupId: string, paymentId: string): Promise<void> {
  const firestore = requireDb();
  const ref = doc(firestore, "groups", groupId, "payments", paymentId);
  await deleteDoc(ref);
  clearHistoricalCache();
}

export async function fetchPaymentsBefore(
  groupId: string,
  beforeDate: string,
): Promise<Array<Record<string, unknown> & { id: string }>> {
  const firestore = requireDb();
  const colRef = collection(firestore, "groups", groupId, "payments");
  const q = query(
    colRef,
    where("date", "<", beforeDate),
    orderBy("date", "desc"),
    orderBy("createdAt", "desc"),
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export function watchPaymentsByRange(
  groupId: string,
  start: string,
  end: string,
  cb: (items: Array<Record<string, unknown> & { id: string }>) => void,
): Unsubscribe {
  const firestore = requireDb();
  const ref = collection(firestore, "groups", groupId, "payments");

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

export async function updatePayment(
  groupId: string,
  paymentId: string,
  patch: Record<string, unknown>,
): Promise<void> {
  const firestore = requireDb();
  const ref = doc(firestore, "groups", groupId, "payments", paymentId);
  await updateDoc(ref, {
    ...patch,
    updatedAt: serverTimestamp(),
  });
  clearHistoricalCache();
}
