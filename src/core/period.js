export function getMonthRange(period) {
  const [year, month] = String(period || "").split("-").map(Number);
  const start = `${String(year).padStart(4, "0")}-${String(month).padStart(
    2,
    "0",
  )}-01`;
  const next = new Date(year, month - 1, 1);
  next.setMonth(next.getMonth() + 1);

  return {
    start,
    end: `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(
      2,
      "0",
    )}-01`,
  };
}

export function lastDayOfPeriod(period) {
  const [year, month] = String(period || "").split("-").map(Number);
  if (!year || !month) return "";
  const day = String(new Date(year, month, 0).getDate()).padStart(2, "0");
  return `${year}-${String(month).padStart(2, "0")}-${day}`;
}
