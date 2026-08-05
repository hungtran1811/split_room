import {
  collection,
  doc,
  documentId,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  where,
  type Firestore,
  type Unsubscribe,
} from "firebase/firestore";
import { db } from "../config/firebase";
import { wrapFirestoreError } from "../core/errors";
import { sanitizeRentPayload } from "../domain/rent/compute";

const PERIOD_FALLBACK_SCAN_LIMIT = 12;

function requireDb(): Firestore {
  if (!db) {
    throw new Error("Firestore chưa được cấu hình.");
  }
  return db;
}

function rentDocRef(groupId: string, period: string) {
  return doc(requireDb(), "groups", groupId, "rents", period);
}

function periodDocRef(groupId: string, period: string) {
  return doc(requireDb(), "groups", groupId, "periods", period);
}

function isPermissionDenied(error: unknown): boolean {
  const code = String((error as { code?: string })?.code || "");
  return code.includes("permission-denied");
}

function normalizeRentDoc(period: string, data: Record<string, unknown> | null | undefined) {
  if (!data) return null;

  return {
    id: period,
    period: (data.period as string) || period,
    ...data,
  };
}

function normalizePeriodRentDoc(period: string, data: Record<string, unknown> | null | undefined) {
  const rent = data?.rent;
  if (!rent || typeof rent !== "object") return null;

  const rentObj = rent as Record<string, unknown>;
  return {
    id: period,
    period: (rentObj.period as string) || (data?.period as string) || period,
    ...rentObj,
  };
}

async function readRentDoc(groupId: string, period: string) {
  try {
    const snap = await getDoc(rentDocRef(groupId, period));
    return snap.exists() ? normalizeRentDoc(period, snap.data()) : null;
  } catch (error) {
    if (isPermissionDenied(error)) return null;
    throw error;
  }
}

async function readRentFromPeriodDoc(groupId: string, period: string) {
  try {
    const snap = await getDoc(periodDocRef(groupId, period));
    return snap.exists() ? normalizePeriodRentDoc(period, snap.data()) : null;
  } catch (error) {
    if (isPermissionDenied(error)) return null;
    throw error;
  }
}

function buildRentPayload(
  period: string,
  payload: Record<string, unknown>,
  existingRent: Record<string, unknown> | null = null,
) {
  return {
    ...sanitizeRentPayload(period, payload as any, existingRent as any),
    updatedAt: serverTimestamp(),
    createdAt:
      existingRent?.createdAt || payload?.createdAt || serverTimestamp(),
  };
}

function wrapRentError(error: unknown, period: string, path: string) {
  console.error(`[rent] write failed for ${path}`, error);
  return wrapFirestoreError(
    error,
    `Không thể lưu tiền nhà tháng ${period}. Hãy kiểm tra dữ liệu và Firestore rules.`,
  );
}

export async function upsertRentByPeriod(
  groupId: string,
  period: string,
  payload: Record<string, unknown>,
): Promise<string> {
  const existingRent = await getRentByPeriod(groupId, period);
  const nextPayload = buildRentPayload(period, payload, existingRent);

  try {
    await setDoc(rentDocRef(groupId, period), nextPayload, { merge: true });
    return period;
  } catch (error) {
    throw wrapRentError(error, period, `groups/${groupId}/rents/${period}`);
  }
}

export function watchRentByPeriod(
  groupId: string,
  period: string,
  callback: (docData: Record<string, unknown> | null) => void,
): Unsubscribe {
  let emitted = false;

  return onSnapshot(
    rentDocRef(groupId, period),
    async (snap) => {
      if (snap.exists()) {
        emitted = true;
        callback(normalizeRentDoc(period, snap.data()));
        return;
      }

      if (!emitted) {
        const fallback = await readRentFromPeriodDoc(groupId, period);
        emitted = true;
        callback(fallback);
        return;
      }

      callback(null);
    },
    (error) => {
      if (isPermissionDenied(error)) {
        callback(null);
        return;
      }

      console.error(`[rent] watch failed for rents/${period}`, error);
    },
  );
}

export async function getRentByPeriod(
  groupId: string,
  period: string,
): Promise<Record<string, unknown> | null> {
  const direct = await readRentDoc(groupId, period);
  if (direct) return direct;

  return readRentFromPeriodDoc(groupId, period);
}

export async function getLatestRentBefore(
  groupId: string,
  period: string,
): Promise<Record<string, unknown> | null> {
  const firestore = requireDb();

  try {
    const rentsRef = collection(firestore, "groups", groupId, "rents");
    const rentQuery = query(
      rentsRef,
      where(documentId(), "<", period),
      orderBy(documentId(), "desc"),
      limit(1),
    );

    const rentSnap = await getDocs(rentQuery);
    if (!rentSnap.empty) {
      const first = rentSnap.docs[0];
      return normalizeRentDoc(first.id, first.data());
    }
  } catch (error) {
    if (!isPermissionDenied(error)) {
      throw error;
    }
  }

  try {
    const periodsRef = collection(firestore, "groups", groupId, "periods");
    const periodQuery = query(
      periodsRef,
      where(documentId(), "<", period),
      orderBy(documentId(), "desc"),
      limit(PERIOD_FALLBACK_SCAN_LIMIT),
    );

    const periodSnap = await getDocs(periodQuery);
    for (const snap of periodSnap.docs) {
      const normalized = normalizePeriodRentDoc(snap.id, snap.data());
      if (normalized) return normalized;
    }
  } catch (error) {
    if (!isPermissionDenied(error)) {
      throw error;
    }
  }

  return null;
}
