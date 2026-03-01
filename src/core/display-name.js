import { EMAIL_TO_MEMBER_ID } from "../config/members.map";
import { ROSTER, nameOf } from "../config/roster";

const KNOWN_MEMBER_IDS = new Set(ROSTER.map((member) => member.id));

function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

function normalizeMemberId(memberId) {
  return String(memberId || "").trim();
}

export function getMemberLabelById(memberId) {
  const normalizedMemberId = normalizeMemberId(memberId);

  if (!normalizedMemberId) return "Người dùng";
  if (KNOWN_MEMBER_IDS.has(normalizedMemberId)) {
    return nameOf(normalizedMemberId);
  }

  return normalizedMemberId;
}

export function getUserLabel({ memberId, email, displayName } = {}) {
  const normalizedEmail = normalizeEmail(email);
  const resolvedMemberId =
    normalizeMemberId(memberId) || EMAIL_TO_MEMBER_ID[normalizedEmail] || "";

  if (resolvedMemberId) {
    return getMemberLabelById(resolvedMemberId);
  }

  const normalizedDisplayName = String(displayName || "").trim();
  if (normalizedDisplayName) return normalizedDisplayName;
  if (normalizedEmail) return normalizedEmail;
  return "Người dùng";
}

export function getCurrentUserLabel(appState) {
  return getUserLabel({
    memberId: appState?.memberProfile?.memberId,
    email: appState?.user?.email,
    displayName: appState?.user?.displayName,
  });
}
