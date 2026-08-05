import { settleDebts } from "./settle";

export type SettlementPlanItem = {
  fromId: string;
  toId: string;
  amount: number;
};

export function computeSettlementPlan(
  balances: Record<string, number>,
): SettlementPlanItem[] {
  return settleDebts(balances).map((item) => ({
    fromId: item.from,
    toId: item.to,
    amount: Number(item.amount || 0),
  }));
}

export function filterSettlementForMember<T extends { fromId?: string; toId?: string }>(
  plan: T[],
  memberId: string,
): T[] {
  const me = String(memberId || "").trim();
  if (!me) return [];
  return plan.filter((item) => item.fromId === me || item.toId === me);
}

export function filterPaymentsForMember<T extends { fromId?: string; toId?: string }>(
  payments: T[],
  memberId: string,
): T[] {
  return filterSettlementForMember(payments, memberId);
}

export function filterBalancesForMember(
  balances: Record<string, number>,
  memberId: string,
): Record<string, number> {
  const me = String(memberId || "").trim();
  if (!me || balances[me] === undefined) return {};
  return { [me]: Number(balances[me] || 0) };
}
