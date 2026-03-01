export function normalizeMemberRole(profile) {
  if (!profile) return "member";

  if (profile.role === "admin" || profile.role === "member") {
    return profile.role;
  }

  // Compatibility bootstrap for legacy member docs without role.
  return profile.memberId === "hung" ? "admin" : "member";
}

export function isAdminProfile(profile) {
  return normalizeMemberRole(profile) === "admin";
}
