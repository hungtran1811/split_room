export const members = [
  { id: "hung", name: "Hưng" },
  { id: "thao", name: "Thảo" },
  { id: "thuy", name: "Thùy" },
  { id: "thinh", name: "Thịnh" },
];

export const expenses = [
  // Hưng trả 120.000, Thảo nợ 60.000, Thùy nợ 60.000
  {
    id: "e1",
    date: "2026-01-01",
    payerId: "hung",
    debts: { thao: 60000, thuy: 60000 },
  },

  // Thảo trả 200.000, Hưng nợ 100.000, Thịnh nợ 100.000
  {
    id: "e2",
    date: "2026-01-03",
    payerId: "thao",
    debts: { hung: 100000, thinh: 100000 },
  },

  // Thùy trả 90.000, Hưng nợ 30.000, Thảo nợ 30.000, Thịnh nợ 30.000
  {
    id: "e3",
    date: "2026-01-05",
    payerId: "thuy",
    debts: { hung: 30000, thao: 30000, thinh: 30000 },
  },
];

// payments mock (để trống)
export const payments = [];
