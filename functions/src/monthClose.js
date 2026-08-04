/**
 * Pure month-close helpers for Admin / Cloud Functions.
 * Settlement algorithms mirror src/domain (whole VND integers).
 */

export const DEFAULT_GROUP_ID = "P102";

export const DEFAULT_ROSTER = [
  { id: "hung", name: "Hưng" },
  { id: "thao", name: "Thảo" },
  { id: "thinh", name: "Thịnh" },
  { id: "thuy", name: "Thùy" },
];

export function previousPeriod(period) {
  const match = String(period || "").match(/^(\d{4})-(\d{2})$/);
  if (!match) {
    throw new Error(`Invalid period: ${period}`);
  }

  let year = Number(match[1]);
  let month = Number(match[2]);
  month -= 1;
  if (month < 1) {
    month = 12;
    year -= 1;
  }

  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}`;
}

export function currentPeriodInTz(date = new Date(), timeZone = "Asia/Ho_Chi_Minh") {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
  }).formatToParts(date);

  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  return `${year}-${month}`;
}

export function getMonthRange(period) {
  const [year, month] = String(period || "").split("-").map(Number);
  const start = `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-01`;
  const next = new Date(year, month - 1, 1);
  next.setMonth(next.getMonth() + 1);
  return {
    start,
    end: `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, "0")}-01`,
  };
}

function toWholeVnd(value) {
  const parsed = Number(value || 0);
  if (!Number.isFinite(parsed)) return 0;
  return Math.round(parsed);
}

function sumNumeric(values = []) {
  return values.reduce((sum, value) => sum + Number(value || 0), 0);
}

function allocateWholeAmounts(entries = [], targetTotal = null) {
  const prepared = entries
    .map((entry, index) => ({
      id: entry?.id,
      amount: Math.max(0, Number(entry?.amount || 0)),
      index,
    }))
    .filter((entry) => entry.id);

  if (!prepared.length) return {};

  const rawTotal = sumNumeric(prepared.map((entry) => entry.amount));
  const desiredTotal =
    targetTotal === null ? toWholeVnd(rawTotal) : Math.max(0, toWholeVnd(targetTotal));

  const allocations = {};
  let floorTotal = 0;

  for (const entry of prepared) {
    const floorValue = Math.floor(entry.amount);
    allocations[entry.id] = floorValue;
    floorTotal += floorValue;
  }

  let remainder = Math.max(0, desiredTotal - floorTotal);
  const ranked = [...prepared].sort((left, right) => {
    const diff =
      right.amount -
      Math.floor(right.amount) -
      (left.amount - Math.floor(left.amount));
    if (Math.abs(diff) > Number.EPSILON) return diff;
    return left.index - right.index;
  });

  for (let index = 0; remainder > 0 && index < ranked.length; index += 1) {
    allocations[ranked[index].id] += 1;
    remainder -= 1;
  }

  return allocations;
}

function normalizeWholeBalances(memberIds = [], balances = {}) {
  const result = Object.fromEntries(memberIds.map((memberId) => [memberId, 0]));
  const positives = [];
  const negatives = [];

  for (const memberId of memberIds) {
    const amount = Number(balances?.[memberId] || 0);
    if (amount > 0) positives.push({ id: memberId, amount });
    else if (amount < 0) negatives.push({ id: memberId, amount: Math.abs(amount) });
  }

  const positiveTotal = sumNumeric(positives.map((entry) => entry.amount));
  const negativeTotal = sumNumeric(negatives.map((entry) => entry.amount));
  const targetTotal = toWholeVnd((positiveTotal + negativeTotal) / 2);
  const positiveAllocations = allocateWholeAmounts(positives, targetTotal);
  const negativeAllocations = allocateWholeAmounts(negatives, targetTotal);

  for (const [memberId, amount] of Object.entries(positiveAllocations)) {
    result[memberId] = amount;
  }
  for (const [memberId, amount] of Object.entries(negativeAllocations)) {
    result[memberId] = -amount;
  }

  return result;
}

function normalizeWholeMatrix(memberIds = [], matrix = {}) {
  const normalized = {};

  for (const debtorId of memberIds) {
    normalized[debtorId] = {};
    for (const creditorId of memberIds) {
      normalized[debtorId][creditorId] = 0;
    }

    const rowEntries = memberIds
      .filter((creditorId) => creditorId !== debtorId)
      .map((creditorId) => ({
        id: creditorId,
        amount: Number(matrix?.[debtorId]?.[creditorId] || 0),
      }))
      .filter((entry) => entry.amount > 0);

    const rowTotal = sumNumeric(rowEntries.map((entry) => entry.amount));
    const allocations = allocateWholeAmounts(rowEntries, rowTotal);

    for (const creditorId of memberIds) {
      if (creditorId === debtorId) continue;
      normalized[debtorId][creditorId] = allocations[creditorId] || 0;
    }
  }

  return normalized;
}

function createZeroMatrix(memberIds) {
  const matrix = {};
  for (const rowId of memberIds) {
    matrix[rowId] = {};
    for (const colId of memberIds) matrix[rowId][colId] = 0;
  }
  return matrix;
}

function buildGrossMatrix(memberIds, expenses = []) {
  const matrix = createZeroMatrix(memberIds);

  for (const expense of expenses) {
    const creditor = expense.payerId;
    const debts = expense.debts || {};

    for (const [debtor, amountRaw] of Object.entries(debts)) {
      const amount = toWholeVnd(amountRaw);
      if (!amount || amount <= 0) continue;
      if (debtor === creditor) continue;
      if (!matrix[debtor] || matrix[debtor][creditor] === undefined) continue;
      matrix[debtor][creditor] += amount;
    }
  }

  return matrix;
}

function computeNetBalances(memberIds, grossMatrix) {
  const balance = {};
  for (const id of memberIds) balance[id] = 0;

  for (const debtor of memberIds) {
    for (const creditor of memberIds) {
      const amt = grossMatrix?.[debtor]?.[creditor] || 0;
      if (!amt) continue;
      balance[debtor] -= amt;
      balance[creditor] += amt;
    }
  }

  for (const id of memberIds) balance[id] = toWholeVnd(balance[id]);
  return balance;
}

function settleDebts(balances) {
  const creditors = [];
  const debtors = [];

  for (const [id, bal] of Object.entries(balances || {})) {
    const amount = toWholeVnd(bal);
    if (amount > 0) creditors.push({ id, amt: amount });
    else if (amount < 0) debtors.push({ id, amt: -amount });
  }

  creditors.sort((a, b) => b.amt - a.amt);
  debtors.sort((a, b) => b.amt - a.amt);

  const result = [];
  let i = 0;
  let j = 0;

  while (i < debtors.length && j < creditors.length) {
    const debtor = debtors[i];
    const creditor = creditors[j];
    const pay = Math.min(debtor.amt, creditor.amt);

    if (pay > 0) {
      result.push({ from: debtor.id, to: creditor.id, amount: pay });
      debtor.amt -= pay;
      creditor.amt -= pay;
    }

    if (debtor.amt <= 0) i += 1;
    if (creditor.amt <= 0) j += 1;
  }

  return result;
}

function applyPaymentsToBalances(balances, payments = []) {
  const next = { ...(balances || {}) };

  for (const payment of payments) {
    const amount = toWholeVnd(payment?.amount || 0);
    const fromId = payment?.fromId;
    const toId = payment?.toId;
    if (!fromId || !toId || amount <= 0) continue;
    next[fromId] = toWholeVnd(Number(next[fromId] || 0) + amount);
    next[toId] = toWholeVnd(Number(next[toId] || 0) - amount);
  }

  return next;
}

function buildRentSummary(rent) {
  if (!rent) return null;

  const payerId = rent.payerId || "hung";
  const shares = { ...(rent.shares || {}) };
  const paid = { ...(rent.paid || {}) };
  const total = toWholeVnd(rent.total || 0);

  const collected = Object.entries(paid).reduce((sum, [memberId, value]) => {
    if (memberId === payerId) return sum;
    return sum + toWholeVnd(value);
  }, 0);

  const remaining = Object.entries(shares).reduce((sum, [memberId, value]) => {
    if (memberId === payerId) return sum;
    const share = toWholeVnd(value);
    const paidValue = toWholeVnd(paid[memberId] || 0);
    return sum + Math.max(share - paidValue, 0);
  }, 0);

  return {
    payerId,
    total,
    collected,
    remaining,
    shares,
    paid,
    note: rent.note || "",
  };
}

function resolveRoster(members = []) {
  const nameById = new Map(
    DEFAULT_ROSTER.map((member) => [member.id, member.name]),
  );

  for (const member of members) {
    const id = member.memberId || member.id;
    if (!id) continue;
    const name = member.displayName || member.name;
    if (name) nameById.set(id, name);
  }

  return DEFAULT_ROSTER.map((member) => ({
    id: member.id,
    name: nameById.get(member.id) || member.name,
  }));
}

function nameOf(memberId, roster) {
  return roster.find((member) => member.id === memberId)?.name || memberId;
}

export function formatVnd(amount) {
  const number = toWholeVnd(amount);
  return `${number.toLocaleString("vi-VN")} đ`;
}

/**
 * Build month-close snapshot from period data.
 */
export function buildCloseSnapshot({
  expenses = [],
  payments = [],
  rent = null,
  members = [],
} = {}) {
  const roster = resolveRoster(members);
  const memberIds = roster.map((member) => member.id);
  const rawGrossMatrix = buildGrossMatrix(memberIds, expenses);
  const grossMatrix = normalizeWholeMatrix(memberIds, rawGrossMatrix);
  const balancesBeforePayments = Object.fromEntries(
    Object.entries(computeNetBalances(memberIds, grossMatrix)).map(
      ([memberId, amount]) => [memberId, toWholeVnd(amount)],
    ),
  );
  const rawBalancesAfterPayments = applyPaymentsToBalances(
    balancesBeforePayments,
    payments,
  );
  const balances = normalizeWholeBalances(memberIds, rawBalancesAfterPayments);
  const settlementPlan = settleDebts(balances).map((item) => ({
    fromId: item.from,
    toId: item.to,
    amount: toWholeVnd(item.amount),
  }));
  const rentSummary = buildRentSummary(rent);

  const memberSummaries = roster.map((member) => {
    const memberId = member.id;
    const rentShare = toWholeVnd(rentSummary?.shares?.[memberId] || 0);
    const rentPaid = toWholeVnd(rentSummary?.paid?.[memberId] || 0);
    const rentRemaining =
      memberId === rentSummary?.payerId
        ? 0
        : Math.max(rentShare - rentPaid, 0);

    return {
      memberId,
      name: member.name,
      netBalance: toWholeVnd(balances?.[memberId] || 0),
      rentShare,
      rentPaid,
      rentRemaining,
    };
  });

  const stats = {
    expenseCount: expenses.length,
    paymentCount: payments.length,
    expenseTotal: toWholeVnd(sumNumeric(expenses.map((item) => item.amount || 0))),
    paymentTotal: toWholeVnd(sumNumeric(payments.map((item) => item.amount || 0))),
    rentTotal: toWholeVnd(rentSummary?.total || 0),
    settlementCount: settlementPlan.length,
  };

  return {
    snapshotType: "month-close",
    stats,
    balances,
    settlementPlan,
    rentSummary,
    memberSummaries,
    snapshot: {
      balances,
      settlementPlan,
      rent: rentSummary,
      members: memberSummaries,
    },
  };
}

function settlementLinesForMember(settlementPlan, memberId, roster) {
  return (settlementPlan || [])
    .filter((item) => item.fromId === memberId || item.toId === memberId)
    .map((item) => {
      const fromName = nameOf(item.fromId, roster);
      const toName = nameOf(item.toId, roster);
      const amount = formatVnd(item.amount);
      if (item.fromId === memberId) {
        return `Bạn cần chuyển ${amount} cho ${toName}`;
      }
      return `${fromName} cần chuyển ${amount} cho bạn`;
    });
}

/**
 * Build in-app notification docs (without Firestore timestamps).
 */
export function buildMemberNotifications(settlementPlan, members = [], period) {
  const roster = resolveRoster(members);
  const notifications = [];

  for (const member of members) {
    const uid = member.uid || member.id;
    const memberId = member.memberId;
    if (!uid || !memberId) continue;

    const lines = settlementLinesForMember(settlementPlan, memberId, roster);
    const title = `Tháng ${period} đã được chốt`;
    const body = lines.length
      ? lines.join(". ") + "."
      : `Bạn không còn khoản cấn trừ trong tháng ${period}.`;

    notifications.push({
      uid,
      memberId,
      type: "month-closed",
      period,
      title,
      body,
      settlement: (settlementPlan || []).filter(
        (item) => item.fromId === memberId || item.toId === memberId,
      ),
      readAt: null,
    });
  }

  return notifications;
}

/**
 * Build mail outbox pending docs (Vietnamese copy).
 */
export function buildMailOutboxItems({
  settlementPlan = [],
  members = [],
  period,
  groupId = DEFAULT_GROUP_ID,
} = {}) {
  const roster = resolveRoster(members);
  const items = [];

  for (const member of members) {
    const email = String(member.email || "").trim();
    const uid = member.uid || member.id;
    const memberId = member.memberId;
    if (!email || !uid || !memberId) continue;

    const lines = settlementLinesForMember(settlementPlan, memberId, roster);
    const name = member.displayName || nameOf(memberId, roster);
    const subject = `[SplitRoom ${groupId}] Đã chốt tháng ${period}`;
    const summary = lines.length
      ? lines.map((line) => `• ${line}`).join("\n")
      : `• Bạn không còn khoản cấn trừ trong tháng ${period}.`;

    const text = [
      `Xin chào ${name},`,
      "",
      `Tháng ${period} của nhóm ${groupId} đã được chốt sổ.`,
      "",
      "Tóm tắt cấn trừ của bạn:",
      summary,
      "",
      "Bạn có thể xem chi tiết trong ứng dụng SplitRoom.",
      "",
      "— SplitRoom",
    ].join("\n");

    const html = `
      <p>Xin chào <strong>${escapeHtml(name)}</strong>,</p>
      <p>Tháng <strong>${escapeHtml(period)}</strong> của nhóm <strong>${escapeHtml(groupId)}</strong> đã được chốt sổ.</p>
      <p>Tóm tắt cấn trừ của bạn:</p>
      <ul>
        ${
          lines.length
            ? lines.map((line) => `<li>${escapeHtml(line)}</li>`).join("")
            : `<li>Bạn không còn khoản cấn trừ trong tháng ${escapeHtml(period)}.</li>`
        }
      </ul>
      <p>Bạn có thể xem chi tiết trong ứng dụng SplitRoom.</p>
      <p>— SplitRoom</p>
    `.trim();

    items.push({
      to: email,
      uid,
      memberId,
      period,
      groupId,
      type: "month-closed",
      subject,
      text,
      html,
      status: "pending",
    });
  }

  return items;
}

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
