import type { MemberProfile } from "../../core/roles";

export function memberUid(member: MemberProfile): string {
  return String(member.uid || member.id || "");
}

export function memberKey(member: MemberProfile): string {
  return String(member.memberId || member.uid || member.id || "");
}

export function memberMatchesUid(member: MemberProfile, uid: string): boolean {
  const target = String(uid || "");
  if (!target) return false;
  return member.uid === target || member.id === target || memberUid(member) === target;
}

export function findMemberByUid(members: MemberProfile[], uid: string): MemberProfile | undefined {
  return members.find((member) => memberMatchesUid(member, uid));
}

export function resolveCalendarMemberLabel(
  members: MemberProfile[],
  key: string,
  labelOf: (key: string) => string,
): string {
  const knownLabel = labelOf(key);
  if (knownLabel && knownLabel !== key) return knownLabel;
  const member = members.find((item) => memberKey(item) === key || memberMatchesUid(item, key));
  return String(member?.displayName || "Thành viên");
}
