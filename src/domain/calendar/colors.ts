const PALETTE = [
  { bg: "#dbeafe", border: "#2563eb", text: "#1e3a8a" },
  { bg: "#fce7f3", border: "#db2777", text: "#9d174d" },
  { bg: "#dcfce7", border: "#16a34a", text: "#166534" },
  { bg: "#ffedd5", border: "#ea580c", text: "#9a3412" },
  { bg: "#ede9fe", border: "#7c3aed", text: "#5b21b6" },
  { bg: "#e0f2fe", border: "#0284c7", text: "#075985" },
] as const;

const MEMBER_INDEX: Record<string, number> = {
  hung: 0,
  thao: 1,
  thinh: 2,
  thuy: 3,
};

function hashKey(value: string): number {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) | 0;
  }
  return Math.abs(hash);
}

export type MemberColor = (typeof PALETTE)[number];

export function colorForMember(memberKey: string): MemberColor {
  const key = String(memberKey || "");
  if (key in MEMBER_INDEX) return PALETTE[MEMBER_INDEX[key]];
  return PALETTE[hashKey(key) % PALETTE.length];
}
