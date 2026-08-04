import { sumValues } from "./compute";

export function validateShares(total, shares) {
  const sum = sumValues(shares);
  if (sum !== total) {
    return `Tổng phần chia (${sum}) phải bằng tổng tiền (${total}).`;
  }
  return "";
}

export function clampPaidToShares(paid, shares) {
  return Object.fromEntries(
    Object.entries(paid || {}).map(([memberId, amount]) => {
      const share = Number(shares?.[memberId] || 0);
      const next = Math.min(Math.max(Number(amount || 0), 0), share);
      return [memberId, next];
    }),
  );
}
