import { members, expenses, payments } from "./demo.mock";
import { buildGrossMatrix } from "./grossMatrix";
import { applyPaymentsToGross } from "./applyPayments";
import { computeNetBalances } from "./netBalance";
import { settleDebts } from "./settle";

export function runEngineDemo() {
  const memberIds = members.map((m) => m.id);

  const gross = buildGrossMatrix(memberIds, expenses);
  const grossAfterPay = applyPaymentsToGross(gross, payments);

  const balances = computeNetBalances(memberIds, grossAfterPay);
  const settle = settleDebts(balances);

  return {
    members,
    expenses,
    payments,
    gross,
    grossAfterPay,
    balances,
    settle,
  };
}
