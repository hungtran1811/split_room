export const EMAIL_TO_MEMBER_ID: Record<string, string> = {
  "hungtran00.nt@gmail.com": "hung",
  "huynhthanhthao14062001@gmail.com": "thao",
  "thanhthuyhuynh1712@gmail.com": "thuy",
  "huynhnhatthinh.2003@gmail.com": "thinh",
};

export function resolveMemberIdFromEmail(email: string | null | undefined): string | null {
  const normalized = String(email || "").trim().toLowerCase();
  return EMAIL_TO_MEMBER_ID[normalized] || null;
}
