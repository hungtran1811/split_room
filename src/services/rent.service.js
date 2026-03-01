import { db } from "../config/firebase";
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
} from "firebase/firestore";
import { wrapFirestoreError } from "../core/errors";
import { sanitizeRentPayload } from "../domain/rent/compute";

const PERIOD_FALLBACK_SCAN_LIMIT = 12;

function rentDocRef(groupId, period) {
  return doc(db, "groups", groupId, "rents", period);
}

function periodDocRef(groupId, period) {
  return doc(db, "groups", groupId, "periods", period);
}

function isPermissionDenied(error) {
  const code = error?.code || "";
  return code.includes("permission-denied");
}

function normalizeRentDoc(period, data) {
  if (!data) return null;

  return {
    id: period,
    period: data.period || period,
    ...data,
  };
}

function normalizePeriodRentDoc(period, data) {
  const rent = data?.rent;
  if (!rent || typeof rent !== "object") return null;

  return {
    id: period,
    period: rent.period || data?.period || period,
    ...rent,
  };
}

async function readRentDoc(groupId, period) {
  try {
    const snap = await getDoc(rentDocRef(groupId, period));
    return snap.exists() ? normalizeRentDoc(period, snap.data()) : null;
  } catch (error) {
    if (isPermissionDenied(error)) return null;
    throw error;
  }
}

async function readRentFromPeriodDoc(groupId, period) {
  try {
    const snap = await getDoc(periodDocRef(groupId, period));
    return snap.exists() ? normalizePeriodRentDoc(period, snap.data()) : null;
  } catch (error) {
    if (isPermissionDenied(error)) return null;
    throw error;
  }
}

function buildRentPayload(period, payload, existingRent = null) {
  return {
    ...sanitizeRentPayload(period, payload, existingRent),
    updatedAt: serverTimestamp(),
    createdAt:
      existingRent?.createdAt || payload?.createdAt || serverTimestamp(),
  };
}

function wrapRentError(error, period, path) {
  console.error(`[rent] write failed for ${path}`, error);
  return wrapFirestoreError(
    error,
    `Không thể lưu tiền nhà tháng ${period}. Hãy kiểm tra dữ liệu và Firestore rules.`,
  );
}

export async function upsertRentByPeriod(groupId, period, payload) {
  const existingRent = await getRentByPeriod(groupId, period);
  const nextPayload = buildRentPayload(period, payload, existingRent);

  try {
    await setDoc(rentDocRef(groupId, period), nextPayload, { merge: true });
    return period;
  } catch (error) {
    throw wrapRentError(error, period, `groups/${groupId}/rents/${period}`);
  }
}

export async function updateRentByPeriod(groupId, period, patch) {
  const existingRent = await getRentByPeriod(groupId, period);
  const nextPayload = buildRentPayload(
    period,
    { ...(existingRent || {}), ...patch },
    existingRent,
  );

  try {
    await setDoc(rentDocRef(groupId, period), nextPayload, { merge: true });
  } catch (error) {
    throw wrapRentError(error, period, `groups/${groupId}/rents/${period}`);
  }
}

export function watchRentByPeriod(groupId, period, callback) {
  let directValue = undefined;
  let fallbackValue = undefined;

  const emit = () => {
    if (directValue && typeof directValue === "object") {
      callback(directValue);
      return;
    }

    if (fallbackValue && typeof fallbackValue === "object") {
      callback(fallbackValue);
      return;
    }

    if (directValue !== undefined || fallbackValue !== undefined) {
      callback(null);
    }
  };

  const unsubDirect = onSnapshot(
    rentDocRef(groupId, period),
    (snap) => {
      directValue = snap.exists() ? normalizeRentDoc(period, snap.data()) : null;
      emit();
    },
    (error) => {
      if (isPermissionDenied(error)) {
        directValue = null;
        emit();
        return;
      }

      console.error(`[rent] watch failed for rents/${period}`, error);
    },
  );

  const unsubFallback = onSnapshot(
    periodDocRef(groupId, period),
    (snap) => {
      fallbackValue = snap.exists()
        ? normalizePeriodRentDoc(period, snap.data())
        : null;
      emit();
    },
    (error) => {
      if (isPermissionDenied(error)) {
        fallbackValue = null;
        emit();
        return;
      }

      console.error(`[rent] watch failed for periods/${period}`, error);
    },
  );

  return () => {
    unsubDirect();
    unsubFallback();
  };
}

export async function getRentByPeriod(groupId, period) {
  const direct = await readRentDoc(groupId, period);
  if (direct) return direct;

  return readRentFromPeriodDoc(groupId, period);
}

export async function getLatestRentBefore(groupId, period) {
  try {
    const rentsRef = collection(db, "groups", groupId, "rents");
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
    const periodsRef = collection(db, "groups", groupId, "periods");
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
