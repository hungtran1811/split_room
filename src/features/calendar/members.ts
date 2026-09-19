import type { MemberProfile } from "../../core/roles";

export function memberUid(member: MemberProfile): string {
  return String(member.uid || member.id || "");
}

export function memberKey(member: MemberProfile): string {
  return String(member.memberId || member.uid || member.id || "");
}

export function findMemberByUid(members: MemberProfile[], uid: string): MemberProfile | undefined {
  return members.find(
    (member) => member.uid === uid || member.id === uid || String(member.id) === uid,
  );
}
