import { ROSTER } from "../../config/roster";
import { getMonthRange, lastDayOfPeriod } from "../../core/period";
import { buildMonthlySettlementView } from "../../domain/matrix/compute";
import { toWholeVnd } from "../../domain/money/whole-vnd";

const PERIOD_KEY_REGEX = /^\d{4}-\d{2}$/;

export function payableSettlementAmount(amount: unknown): number {
  return Math.max(0, toWholeVnd(amount));
}

export function settlementActionValue(
  item: { fromId?: string; toId?: string; amount?: number },
  debtPeriod = "",
): string {
  const period = debtPeriod ? `|${debtPeriod}` : "";
  return `${item.fromId}|${item.toId}|${payableSettlementAmount(item.amount)}${period}`;
}

export function parseSettlementAction(value: string, viewingPeriod = "") {
  const parts = String(value || "").split("|");
  const [fromId, toId, amountString, debtPeriod] = parts;

  return {
    fromId: fromId || "",
    toId: toId || "",
    amount: payableSettlementAmount(amountString),
    debtPeriod: debtPeriod || viewingPeriod || "",
  };
}

export function paymentDateBoundsForPeriod(period: string) {
  const { start, end } = getMonthRange(period);
  const lastDay = lastDayOfPeriod(period);
  return {
    minDate: start,
    maxDate: lastDay,
    exclusiveEnd: end,
  };
}

export function isPaymentDateInPeriod(date: string, period: string): boolean {
  const { minDate, exclusiveEnd } = paymentDateBoundsForPeriod(period);
  const value = String(date || "");
  return value >= minDate && value < exclusiveEnd;
}

function todayYmd(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function defaultPaymentDateForPeriod(period: string): string {
  const today = todayYmd();
  if (today.startsWith(`${period}-`)) return today;
  return lastDayOfPeriod(period);
}

function sumAmount(items: Array<{ amount?: number }> = []): number {
  return items.reduce((sum, item) => sum + Number(item?.amount || 0), 0);
}

function inDateRange(date: unknown, start: string, end: string): boolean {
  const value = String(date || "");
  return value >= start && value < end;
}

function beforeDate(date: unknown, start: string): boolean {
  return String(date || "") < start;
}

function filterMonth<T extends { date?: string }>(items: T[], period: string): T[] {
  const { start, end } = getMonthRange(period);
  return (items || []).filter((item) => inDateRange(item.date, start, end));
}

export function filterBeforeMonth<T extends { date?: string }>(
  items: T[],
  period: string,
): T[] {
  const { start } = getMonthRange(period);
  return (items || []).filter((item) => beforeDate(item.date, start));
}

function toPeriodKey(date: unknown): string | null {
  const key = String(date || "").slice(0, 7);
  return PERIOD_KEY_REGEX.test(key) ? key : null;
}

function collectPreviousPeriodKeys(
  allExpenses: Array<{ date?: string }>,
  allPayments: Array<{ date?: string }>,
  period: string,
): string[] {
  const { start } = getMonthRange(period);
  const keys = new Set<string>();

  for (const item of allExpenses || []) {
    const date = String(item?.date || "");
    if (date >= start) continue;
    const key = toPeriodKey(date);
    if (key) keys.add(key);
  }

  for (const item of allPayments || []) {
    const date = String(item?.date || "");
    if (date >= start) continue;
    const key = toPeriodKey(date);
    if (key) keys.add(key);
  }

  return [...keys].sort();
}

function settlementPairKey(item: { fromId?: string; toId?: string }): string {
  return `${item?.fromId || ""}|${item?.toId || ""}`;
}

export function buildPreviousDebtByMonth(
  allExpenses: Array<Record<string, unknown>>,
  allPayments: Array<Record<string, unknown>>,
  period: string,
) {
  const keys = collectPreviousPeriodKeys(allExpenses, allPayments, period);
  const timeline: Array<{
    period: string;
    monthExpenseTotal: number;
    monthPaymentTotal: number;
    carryTotal: number;
    carryCount: number;
    carryPlan: Array<{ fromId: string; toId: string; amount: number }>;
  }> = [];

  let cumulativeExpenses: Array<Record<string, unknown>> = [];
  let cumulativePayments: Array<Record<string, unknown>> = [];

  for (const key of keys) {
    const expenses = filterMonth(allExpenses, key);
    const payments = filterMonth(allPayments, key);

    cumulativeExpenses = cumulativeExpenses.concat(expenses);
    cumulativePayments = cumulativePayments.concat(payments);

    const endOfMonthSettlement = buildMonthlySettlementView({
      roster: [...ROSTER],
      expenses: cumulativeExpenses as Array<{
        payerId?: string;
        debts?: Record<string, number>;
      }>,
      payments: cumulativePayments as Array<{
        amount?: number;
        fromId?: string;
        toId?: string;
      }>,
    });

    if (endOfMonthSettlement.settlementPlan.length > 0) {
      timeline.push({
        period: key,
        monthExpenseTotal: sumAmount(expenses as Array<{ amount?: number }>),
        monthPaymentTotal: sumAmount(payments as Array<{ amount?: number }>),
        carryTotal: sumAmount(endOfMonthSettlement.settlementPlan),
        carryCount: endOfMonthSettlement.settlementPlan.length,
        carryPlan: endOfMonthSettlement.settlementPlan.map((item) => ({
          ...item,
          amount: payableSettlementAmount(item.amount),
        })),
      });
    }
  }

  const previousExpenses = filterBeforeMonth(allExpenses, period);
  const previousPayments = filterBeforeMonth(allPayments, period);
  const remainingPreviousPlan = buildMonthlySettlementView({
    roster: [...ROSTER],
    expenses: previousExpenses as Array<{
      payerId?: string;
      debts?: Record<string, number>;
    }>,
    payments: previousPayments as Array<{
      amount?: number;
      fromId?: string;
      toId?: string;
    }>,
  }).settlementPlan;
  const remainingByPair = new Map(
    remainingPreviousPlan.map((item) => [
      settlementPairKey(item),
      payableSettlementAmount(item.amount),
    ]),
  );

  return timeline
    .map((entry) => {
      const carryPlan: Array<{ fromId: string; toId: string; amount: number }> = [];

      for (const item of entry.carryPlan) {
        const pairKey = settlementPairKey(item);
        const available = remainingByPair.get(pairKey) || 0;
        const amount = Math.min(available, payableSettlementAmount(item.amount));

        if (amount > 0) {
          carryPlan.push({
            ...item,
            amount,
          });
          remainingByPair.set(pairKey, available - amount);
        }
      }

      if (!carryPlan.length) return null;

      return {
        ...entry,
        carryPlan,
        carryTotal: sumAmount(carryPlan),
        carryCount: carryPlan.length,
      };
    })
    .filter(Boolean);
}
