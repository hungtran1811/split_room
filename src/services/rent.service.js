// src/services/rent.service.js
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
  updateDoc,
  where,
} from "firebase/firestore";

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
    ...payload,
    period,
    updatedAt: serverTimestamp(),
    createdAt: existingRent?.createdAt || payload?.createdAt || serverTimestamp(),
  };
}

function buildPeriodPayload(period, payload, existingRent = null) {
  return {
    period,
    updatedAt: serverTimestamp(),
    rent: buildRentPayload(period, payload, existingRent),
  };
}

function toUserFacingRentError(error, period) {
  const code = error?.code || "";

  if (code.includes("permission-denied")) {
    const wrapped = new Error(
      `Khong co quyen luu tien nha thang ${period}. Hay kiem tra Firestore rules cho rents/periods.`,
    );
    wrapped.code = error.code;
    wrapped.cause = error;
    return wrapped;
  }

  if (code.includes("failed-precondition")) {
    const wrapped = new Error(
      `Firestore dang thieu index hoac dieu kien ghi du lieu cho thang ${period}.`,
    );
    wrapped.code = error.code;
    wrapped.cause = error;
    return wrapped;
  }

  return error;
}

/**
 * Doc id = period (VD: "2026-02")
 * Preferred path: groups/{groupId}/rents/{period}
 * Fallback path when rules for rents are missing: groups/{groupId}/periods/{period}.rent
 */
export async function upsertRentByPeriod(groupId, period, payload) {
  const existingRent = await getRentByPeriod(groupId, period);
  const rentPayload = buildRentPayload(period, payload, existingRent);

  try {
    await setDoc(rentDocRef(groupId, period), rentPayload, { merge: true });
    return period;
  } catch (error) {
    if (!isPermissionDenied(error)) {
      throw toUserFacingRentError(error, period);
    }

    console.warn(
      `[rent] direct write denied at groups/${groupId}/rents/${period}, trying periods fallback`,
      error,
    );
  }

  try {
    await setDoc(
      periodDocRef(groupId, period),
      buildPeriodPayload(period, payload, existingRent),
      { merge: true },
    );
    return period;
  } catch (error) {
    console.error(
      `[rent] fallback write denied at groups/${groupId}/periods/${period}`,
      error,
    );
    throw toUserFacingRentError(error, period);
  }
}

export async function updateRentByPeriod(groupId, period, patch) {
  const directRef = rentDocRef(groupId, period);

  try {
    await updateDoc(directRef, { ...patch, updatedAt: serverTimestamp() });
    return;
  } catch (error) {
    if (!isPermissionDenied(error)) {
      throw toUserFacingRentError(error, period);
    }
  }

  const existingRent = await getRentByPeriod(groupId, period);
  try {
    await setDoc(
      periodDocRef(groupId, period),
      buildPeriodPayload(
        period,
        { ...(existingRent || {}), ...patch },
        existingRent,
      ),
      { merge: true },
    );
  } catch (error) {
    throw toUserFacingRentError(error, period);
  }
}

export function watchRentByPeriod(groupId, period, cb) {
  let directValue = undefined;
  let fallbackValue = undefined;

  const emit = () => {
    if (directValue && typeof directValue === "object") {
      cb(directValue);
      return;
    }

    if (fallbackValue && typeof fallbackValue === "object") {
      cb(fallbackValue);
      return;
    }

    if (directValue !== undefined || fallbackValue !== undefined) {
      cb(null);
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

  return await readRentFromPeriodDoc(groupId, period);
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
    for (const docSnap of periodSnap.docs) {
      const normalized = normalizePeriodRentDoc(docSnap.id, docSnap.data());
      if (normalized) return normalized;
    }
  } catch (error) {
    if (!isPermissionDenied(error)) {
      throw error;
    }
  }

  return null;
}
