import {
  canOperateMonth,
  isAdminProfile,
  isOwnerProfile,
  normalizeMemberRole,
} from "./roles";

const PERIOD_STORAGE_KEY = "splitroom:selected-period";
const PERIOD_PATTERN = /^\d{4}-\d{2}$/;
const periodListeners = new Set();
let storageListenerBound = false;

export const state = {
  user: null,
  groupId: null,
  members: [],
  memberProfile: null,
  isAdmin: false,
  isOwner: false,
  canOperateMonth: false,
  selectedPeriod: "",
};

export function currentPeriod() {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}

export function normalizePeriod(value) {
  const normalized = String(value || "").trim();
  return PERIOD_PATTERN.test(normalized) ? normalized : currentPeriod();
}

function emitPeriodChange(period) {
  periodListeners.forEach((listener) => {
    try {
      listener(period);
    } catch (error) {
      console.error("selectedPeriod listener failed", error);
    }
  });
}

function readStoredPeriod() {
  try {
    return normalizePeriod(window.localStorage.getItem(PERIOD_STORAGE_KEY));
  } catch {
    return currentPeriod();
  }
}

function persistSelectedPeriod(period) {
  try {
    window.localStorage.setItem(PERIOD_STORAGE_KEY, period);
  } catch {
    // Ignore storage write failures and keep runtime state only.
  }
}

function bindStorageListener() {
  if (storageListenerBound || typeof window === "undefined") return;

  window.addEventListener("storage", (event) => {
    if (event.key !== PERIOD_STORAGE_KEY) return;
    const nextPeriod = normalizePeriod(event.newValue);
    if (nextPeriod === state.selectedPeriod) return;
    state.selectedPeriod = nextPeriod;
    emitPeriodChange(nextPeriod);
  });

  storageListenerBound = true;
}

export function initSelectedPeriod() {
  state.selectedPeriod = readStoredPeriod();
  bindStorageListener();
}

export function getSelectedPeriod() {
  if (!state.selectedPeriod) {
    state.selectedPeriod = currentPeriod();
  }

  return state.selectedPeriod;
}

export function setSelectedPeriod(
  period,
  { persist = true, emit = true } = {},
) {
  const nextPeriod = normalizePeriod(period);
  const changed = nextPeriod !== state.selectedPeriod;
  state.selectedPeriod = nextPeriod;

  if (persist) {
    persistSelectedPeriod(nextPeriod);
  }

  if (changed && emit) {
    emitPeriodChange(nextPeriod);
  }

  return nextPeriod;
}

export function subscribeSelectedPeriod(listener) {
  periodListeners.add(listener);
  return () => {
    periodListeners.delete(listener);
  };
}

export function setUser(user) {
  state.user = user;
}

export function setGroup(groupId) {
  state.groupId = groupId;
}

export function setMembers(members) {
  state.members = (members || []).map((member) => ({
    ...member,
    role: normalizeMemberRole(member),
  }));
}

export function setMemberProfile(profile) {
  if (!profile) {
    state.memberProfile = null;
    state.isAdmin = false;
    state.isOwner = false;
    state.canOperateMonth = false;
    return;
  }

  state.memberProfile = {
    ...profile,
    role: normalizeMemberRole(profile),
  };
  state.isOwner = isOwnerProfile(state.memberProfile);
  state.canOperateMonth = canOperateMonth(state.memberProfile);
  state.isAdmin = isAdminProfile(state.memberProfile);
}
