export const ROSTER = [
  { id: "hung", name: "Hưng" },
  { id: "thao", name: "Thảo" },
  { id: "thinh", name: "Thịnh" },
  { id: "thuy", name: "Thùy" },
] as const;

export type RosterId = (typeof ROSTER)[number]["id"];

export const ROSTER_IDS = ROSTER.map((member) => member.id);

export function nameOf(id: string): string {
  return ROSTER.find((member) => member.id === id)?.name || id;
}
