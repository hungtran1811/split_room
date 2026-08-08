import { nameOf, ROSTER_IDS } from "../../config/roster";

export const NICKNAME_MAX_LENGTH = 24;

export function isRosterMemberId(memberId: string): boolean {
  return ROSTER_IDS.includes(memberId as (typeof ROSTER_IDS)[number]);
}

export function sanitizeNickname(raw: string): string {
  return String(raw || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, NICKNAME_MAX_LENGTH);
}

export function resolveMemberLabel(
  memberId: string,
  nicknames: Record<string, string> = {},
): string {
  const nickname = sanitizeNickname(nicknames[memberId] || "");
  return nickname || nameOf(memberId);
}
