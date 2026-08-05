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
import { getMonthRange } from "../core/period";
import { clearHistoricalCache } from "./live-data-hub";

function requireDb(): Firestore {
  if (!db) {
    throw new Error("Firestore chưa được cấu hình.");
  }
  return db;
}

type ExpenseRow = Record<string, unknown> & { id: string };

type AllExpensesCache = {
  groupId: string;
  fetchedAt: number;
  items: ExpenseRow[];
};

const ALL_EXPENSES_TTL_MS = 5 * 60 * 1000;
let allExpensesCache: AllExpensesCache | null = null;

function invalidateExpenseReadCaches(groupId?: string): void {
  if (!groupId || allExpensesCache?.groupId === groupId) {
    allExpensesCache = null;
  }
  clearHistoricalCache();
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
  invalidateExpenseReadCaches(groupId);
  return res.id;
}

export async function removeExpense(groupId: string, expenseId: string): Promise<void> {
  const firestore = requireDb();
  const ref = doc(firestore, "groups", groupId, "expenses", expenseId);
  await deleteDoc(ref);
  invalidateExpenseReadCaches(groupId);
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

export async function fetchAllExpenses(
  groupId: string,
  options: { force?: boolean } = {},
): Promise<ExpenseRow[]> {
  const now = Date.now();
  if (
    !options.force &&
    allExpensesCache &&
    allExpensesCache.groupId === groupId &&
    now - allExpensesCache.fetchedAt < ALL_EXPENSES_TTL_MS
  ) {
    return allExpensesCache.items;
  }

  const firestore = requireDb();
  const colRef = collection(firestore, "groups", groupId, "expenses");
  const q = query(colRef, orderBy("date", "desc"));
  const snap = await getDocs(q);
  const items = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  allExpensesCache = { groupId, fetchedAt: now, items };
  return items;
}

export async function fetchExpensesByPeriod(
  groupId: string,
  period: string,
): Promise<ExpenseRow[]> {
  // Tái dùng cache all-time khi có để tránh query tháng trước riêng.
  const all = await fetchAllExpenses(groupId);
  const { start, end } = getMonthRange(period);
  return all.filter((item) => {
    const date = String(item.date || "");
    return date >= start && date < end;
  });
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
  invalidateExpenseReadCaches(groupId);
}
