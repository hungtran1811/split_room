export type MemberRole = "owner" | "admin" | "member";

export type MemberProfile = {
  id?: string;
  uid?: string;
  email?: string;
  displayName?: string;
  photoURL?: string;
  memberId?: string;
  role?: string;
  [key: string]: unknown;
};

export function normalizeMemberRole(profile: MemberProfile | null | undefined): MemberRole {
  if (!profile) return "member";

  if (
    profile.role === "owner" ||
    profile.role === "admin" ||
    profile.role === "member"
  ) {
    return profile.role;
  }

  return "member";
}

export function isOwnerProfile(profile: MemberProfile | null | undefined): boolean {
  return normalizeMemberRole(profile) === "owner";
}

export function canOperateMonth(profile: MemberProfile | null | undefined): boolean {
  const role = normalizeMemberRole(profile);
  return role === "owner" || role === "admin";
}

export function canAddExpense(
  profile: MemberProfile | null | undefined,
  email = "",
): boolean {
  const memberId =
    profile?.memberId ||
    (email ? String(email).trim().toLowerCase() : "");
  if (!memberId && !profile) return false;

  const role = normalizeMemberRole(
    profile || {
      memberId: String(memberId),
      role: "member",
    },
  );
  return role === "owner" || role === "admin" || role === "member";
}

export function canEditExpense(profile: MemberProfile | null | undefined): boolean {
  return canOperateMonth(profile);
}

export function canDeleteExpense(profile: MemberProfile | null | undefined): boolean {
  return isOwnerProfile(profile);
}

export function canRecordPayment(profile: MemberProfile | null | undefined): boolean {
  return canOperateMonth(profile);
}

export function canEditRent(profile: MemberProfile | null | undefined): boolean {
  return canOperateMonth(profile);
}

export function canViewFullSettlement(profile: MemberProfile | null | undefined): boolean {
  return canOperateMonth(profile);
}

export function isAdminProfile(profile: MemberProfile | null | undefined): boolean {
  return canOperateMonth(profile);
}
