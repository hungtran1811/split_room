import { settleDebts } from "../../engine/settle";

export function computeSettlementPlan(balances) {
  return settleDebts(balances).map((item) => ({
    fromId: item.fromId || item.from || item.debtorId,
    toId: item.toId || item.to || item.creditorId,
    amount: Number(item.amount || item.amt || 0),
  }));
}
