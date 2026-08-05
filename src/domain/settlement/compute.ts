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
