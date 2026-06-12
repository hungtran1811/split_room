import { fetchExpensesBefore } from "./expense.service";
import { fetchPaymentsBefore } from "./payment.service";
import {
  getMonthRange,
  watchMonthExpenses,
  watchMonthPayments,
} from "./month-ops.service";
import { watchRentByPeriod } from "./rent.service";

const monthConsumers = new Map();
const historicalCache = new Map();

let activeKey = "";
let activeGroupId = "";
let activePeriod = "";
let expenses = [];
let payments = [];
let rent = null;
let expensesReady = false;
let paymentsReady = false;
let rentReady = false;

let unsubExpenses = null;
let unsubPayments = null;
let unsubRent = null;

function hubKey(groupId, period) {
  return `${groupId}::${period}`;
}

function notifyConsumers() {
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

function stopWatchers() {
  unsubExpenses?.();
  unsubPayments?.();
  unsubRent?.();
  unsubExpenses = null;
  unsubPayments = null;
  unsubRent = null;
}

function startWatchers(groupId, period) {
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

function ensureHub(groupId, period) {
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
} = {}) {
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

export async function fetchHistoricalBefore(groupId, period) {
  const cacheKey = hubKey(groupId, period);
  if (historicalCache.has(cacheKey)) {
    return historicalCache.get(cacheKey);
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

export function clearHistoricalCache(groupId, period) {
  if (groupId && period) {
    historicalCache.delete(hubKey(groupId, period));
    return;
  }
  historicalCache.clear();
}

export function disposeLiveDataHub() {
  monthConsumers.clear();
  stopWatchers();
  activeKey = "";
  activeGroupId = "";
  activePeriod = "";
  historicalCache.clear();
}
