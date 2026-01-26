// src/config/roster.js
export const ROSTER = [
  { id: "hung", name: "Hưng" },
  { id: "thao", name: "Thảo" },
  { id: "thinh", name: "Thịnh" },
  { id: "thuy", name: "Thùy" },
];

export const ROSTER_IDS = ROSTER.map((m) => m.id);

export function nameOf(id) {
  return ROSTER.find((m) => m.id === id)?.name || id;
}
