export const EMAIL_TO_MEMBER_ID = {
  "hungtran00.nt@gmail.com": "hung",
  "huynhthanhthao14062001@gmail.com": "thao",
  "thanhthuyhuynh1712@gmail.com": "thuy",
  "huynhnhatthinh.2003@gmail.com": "thinh",
};

export function resolveMemberIdFromEmail(email) {
  const normalized = String(email || "").trim().toLowerCase();
  return EMAIL_TO_MEMBER_ID[normalized] || null;
}
