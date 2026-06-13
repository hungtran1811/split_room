import { LEGACY_OWNER_UID, OWNER_MEMBER_ID } from "../config/constants";
import { resolveMemberIdFromEmail } from "../config/members.map";

export function normalizeMemberRole(profile) {
  if (!profile) return "member";

  if (
    profile.uid === LEGACY_OWNER_UID ||
    profile.id === LEGACY_OWNER_UID ||
    profile.memberId === OWNER_MEMBER_ID
  ) {
    return "owner";
  }

  if (
    profile.role === "owner" ||
    profile.role === "admin" ||
    profile.role === "member"
  ) {
    return profile.role;
  }

  return "member";
}

export function isOwnerProfile(profile) {
  return normalizeMemberRole(profile) === "owner";
}

export function canOperateMonth(profile) {
  const role = normalizeMemberRole(profile);
  return role === "owner" || role === "admin";
}

export function canAddExpense(profile, email = "") {
  const memberId = profile?.memberId || resolveMemberIdFromEmail(email);
  if (!memberId) return false;

  const role = normalizeMemberRole(
    profile || {
      memberId,
      role: "member",
    },
  );
  return role === "owner" || role === "admin" || role === "member";
}

export function isAdminProfile(profile) {
  return canOperateMonth(profile);
}
