import type { Unsubscribe } from "firebase/firestore";
import { fetchExpensesBefore } from "./expense.service";
import { fetchPaymentsBefore } from "./payment.service";
import {
  getMonthRange,
  watchMonthExpenses,
  watchMonthPayments,
} from "./month-ops.service";
import { watchRentByPeriod } from "./rent.service";

type MonthConsumer = {
  onUpdate?: (payload: LiveMonthSnapshot) => void;
};

export type LiveMonthSnapshot = {
  expenses: Record<string, unknown>[];
  payments: Record<string, unknown>[];
  rent: Record<string, unknown> | null;
  expensesReady: boolean;
  paymentsReady: boolean;
  rentReady: boolean;
  groupId: string;
  period: string;
};

type HistoricalPayload = {
  expensesBefore: Record<string, unknown>[];
  paymentsBefore: Record<string, unknown>[];
  beforeDate: string;
};

const monthConsumers = new Map<string, MonthConsumer>();
const historicalCache = new Map<string, HistoricalPayload>();

let activeKey = "";
let activeGroupId = "";
let activePeriod = "";
let expenses: Record<string, unknown>[] = [];
let payments: Record<string, unknown>[] = [];
let rent: Record<string, unknown> | null = null;
let expensesReady = false;
let paymentsReady = false;
let rentReady = false;

let unsubExpenses: Unsubscribe | null = null;
let unsubPayments: Unsubscribe | null = null;
let unsubRent: Unsubscribe | null = null;

function hubKey(groupId: string, period: string): string {
  return `${groupId}::${period}`;
}

function notifyConsumers(): void {
  for (const consumer of monthConsumers.values()) {
    consumer.onUpdate?.({
      expenses,
      payments,
      rent,
      expensesReady,
      paymentsReady,
      rentReady,
      groupId: activeGroupId,
      period: activePeriod,
    });
  }
}

function stopWatchers(): void {
  unsubExpenses?.();
  unsubPayments?.();
  unsubRent?.();
  unsubExpenses = null;
  unsubPayments = null;
  unsubRent = null;
}

function startWatchers(groupId: string, period: string): void {
  stopWatchers();
  expenses = [];
  payments = [];
  rent = null;
  expensesReady = false;
  paymentsReady = false;
  rentReady = false;

  unsubExpenses = watchMonthExpenses(groupId, period, (items) => {
    expenses = items;
    expensesReady = true;
    notifyConsumers();
  });

  unsubPayments = watchMonthPayments(groupId, period, (items) => {
    payments = items;
    paymentsReady = true;
    notifyConsumers();
  });

  unsubRent = watchRentByPeriod(groupId, period, (docData) => {
    rent = docData;
    rentReady = true;
    notifyConsumers();
  });
}

function ensureHub(groupId: string, period: string): void {
  const nextKey = hubKey(groupId, period);
  if (nextKey === activeKey) return;

  activeKey = nextKey;
  activeGroupId = groupId;
  activePeriod = period;
  startWatchers(groupId, period);
}

export function subscribeLiveMonthData({
  consumerId,
  groupId,
  period,
  onUpdate,
}: {
  consumerId?: string;
  groupId?: string;
  period?: string;
  onUpdate?: (payload: LiveMonthSnapshot) => void;
} = {}): () => void {
  if (!consumerId || !groupId || !period) {
    return () => {};
  }

  ensureHub(groupId, period);

  monthConsumers.set(consumerId, { onUpdate });

  onUpdate?.({
    expenses,
    payments,
    rent,
    expensesReady,
    paymentsReady,
    rentReady,
    groupId: activeGroupId,
    period: activePeriod,
  });

  return () => {
    monthConsumers.delete(consumerId);
    if (!monthConsumers.size) {
      stopWatchers();
      activeKey = "";
      activeGroupId = "";
      activePeriod = "";
    }
  };
}

export async function fetchHistoricalBefore(
  groupId: string,
  period: string,
): Promise<HistoricalPayload> {
  const cacheKey = hubKey(groupId, period);
  if (historicalCache.has(cacheKey)) {
    return historicalCache.get(cacheKey)!;
  }

  const { start } = getMonthRange(period);
  const [expensesBefore, paymentsBefore] = await Promise.all([
    fetchExpensesBefore(groupId, start),
    fetchPaymentsBefore(groupId, start),
  ]);

  const payload = { expensesBefore, paymentsBefore, beforeDate: start };
  historicalCache.set(cacheKey, payload);
  return payload;
}

export function clearHistoricalCache(groupId?: string, period?: string): void {
  if (groupId && period) {
    historicalCache.delete(hubKey(groupId, period));
    return;
  }
  historicalCache.clear();
}

export function getLiveMonthSnapshot(): LiveMonthSnapshot {
  return {
    expenses,
    payments,
    rent,
    expensesReady,
    paymentsReady,
    rentReady,
    groupId: activeGroupId,
    period: activePeriod,
  };
}

export function disposeLiveDataHub(): void {
  monthConsumers.clear();
  stopWatchers();
  activeKey = "";
  activeGroupId = "";
  activePeriod = "";
  historicalCache.clear();
}
