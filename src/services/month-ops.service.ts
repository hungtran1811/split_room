import {
  collection,
  getDocs,
  orderBy,
  query,
  where,
  type Firestore,
  type QuerySnapshot,
  type DocumentData,
  type Unsubscribe,
} from "firebase/firestore";
import { db } from "../config/firebase";
import { wrapFirestoreError } from "../core/errors";
import { getMonthRange, lastDayOfPeriod } from "../core/period";
import { watchExpensesByRange } from "./expense.service";
import { watchPaymentsByRange } from "./payment.service";

export { getMonthRange, lastDayOfPeriod };

function requireDb(): Firestore {
  if (!db) {
    throw new Error("Firestore chưa được cấu hình.");
  }
  return db;
}

function normalizeDocs(snapshot: QuerySnapshot<DocumentData>) {
  return snapshot.docs.map((docSnap) => ({
    id: docSnap.id,
    ...docSnap.data(),
  }));
}

function expensesQuery(groupId: string, period: string) {
  const firestore = requireDb();
  const { start, end } = getMonthRange(period);
  return query(
    collection(firestore, "groups", groupId, "expenses"),
    where("date", ">=", start),
    where("date", "<", end),
    orderBy("date", "desc"),
    orderBy("createdAt", "desc"),
  );
}

function paymentsQuery(groupId: string, period: string) {
  const firestore = requireDb();
  const { start, end } = getMonthRange(period);
  return query(
    collection(firestore, "groups", groupId, "payments"),
    where("date", ">=", start),
    where("date", "<", end),
    orderBy("date", "asc"),
    orderBy("createdAt", "asc"),
  );
}

export function watchMonthExpenses(
  groupId: string,
  period: string,
  cb: (items: Array<Record<string, unknown> & { id: string }>) => void,
): Unsubscribe {
  const { start, end } = getMonthRange(period);
  return watchExpensesByRange(groupId, start, end, cb);
}

export function watchMonthPayments(
  groupId: string,
  period: string,
  cb: (items: Array<Record<string, unknown> & { id: string }>) => void,
): Unsubscribe {
  const { start, end } = getMonthRange(period);
  return watchPaymentsByRange(groupId, start, end, cb);
}

export async function loadMonthOps(groupId: string, period: string) {
  try {
    const [expensesSnapshot, paymentsSnapshot] = await Promise.all([
      getDocs(expensesQuery(groupId, period)),
      getDocs(paymentsQuery(groupId, period)),
    ]);

    return {
      expenses: normalizeDocs(expensesSnapshot),
      payments: normalizeDocs(paymentsSnapshot),
    };
  } catch (error) {
    throw wrapFirestoreError(
      error,
      `Khong the tai du lieu van hanh thang ${period}.`,
    );
  }
}
