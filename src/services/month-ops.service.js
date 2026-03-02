import {
  collection,
  getDocs,
  orderBy,
  query,
  where,
} from "firebase/firestore";
import { db } from "../config/firebase";
import { wrapFirestoreError } from "../core/errors";
import { watchExpensesByRange } from "./expense.service";
import { watchPaymentsByRange } from "./payment.service";

export function getMonthRange(period) {
  const [year, month] = String(period || "").split("-").map(Number);
  const start = `${String(year).padStart(4, "0")}-${String(month).padStart(
    2,
    "0",
  )}-01`;
  const next = new Date(year, month - 1, 1);
  next.setMonth(next.getMonth() + 1);

  return {
    start,
    end: `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(
      2,
      "0",
    )}-01`,
  };
}

function normalizeDocs(snapshot) {
  return snapshot.docs.map((docSnap) => ({
    id: docSnap.id,
    ...docSnap.data(),
  }));
}

function expensesQuery(groupId, period) {
  const { start, end } = getMonthRange(period);
  return query(
    collection(db, "groups", groupId, "expenses"),
    where("date", ">=", start),
    where("date", "<", end),
    orderBy("date", "desc"),
    orderBy("createdAt", "desc"),
  );
}

function paymentsQuery(groupId, period) {
  const { start, end } = getMonthRange(period);
  return query(
    collection(db, "groups", groupId, "payments"),
    where("date", ">=", start),
    where("date", "<", end),
    orderBy("date", "asc"),
    orderBy("createdAt", "asc"),
  );
}

export function watchMonthExpenses(groupId, period, cb) {
  const { start, end } = getMonthRange(period);
  return watchExpensesByRange(groupId, start, end, cb);
}

export function watchMonthPayments(groupId, period, cb) {
  const { start, end } = getMonthRange(period);
  return watchPaymentsByRange(groupId, start, end, cb);
}

export async function loadMonthOps(groupId, period) {
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
