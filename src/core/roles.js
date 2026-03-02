import { LEGACY_OWNER_UID, OWNER_MEMBER_ID } from "../config/constants";

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

export function isAdminProfile(profile) {
  return canOperateMonth(profile);
}
