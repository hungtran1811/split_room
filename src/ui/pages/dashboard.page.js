import { logout } from "../../services/auth.service";
import { state } from "../../core/state";
import { renderMatrixTable } from "../components/matrixTable";
import { t, formatVND } from "../../config/i18n";

import { watchExpensesByRange } from "../../services/expense.service";
import { watchPaymentsByRange } from "../../services/payment.service";

// ===== Helpers: period =====
function currentPeriod() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`; // YYYY-MM
}

function getMonthRange(period) {
  const [y, m] = period.split("-").map(Number);
  const start = `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-01`;

  const d = new Date(y, m - 1, 1);
  d.setMonth(d.getMonth() + 1);
  const endY = d.getFullYear();
  const endM = String(d.getMonth() + 1).padStart(2, "0");
  const end = `${endY}-${endM}-01`;
  return { start, end };
}

// ===== Helpers: roster & name =====
function getRoster() {
  // ưu tiên members từ Firestore (phase 2)
  const ms = state.members || [];
  if (ms.length) {
    return ms.map((m) => ({
      id: m.id, // bạn đang lưu id member trong doc member
      name: m.displayName || m.email || m.id,
    }));
  }

  // fallback nếu chưa load members
  return [
    { id: "hung", name: "Hưng" },
    { id: "thao", name: "Thảo" },
    { id: "thinh", name: "Thịnh" },
    { id: "thuy", name: "Thùy" },
  ];
}

function nameOf(id, roster) {
  return roster.find((x) => x.id === id)?.name || id || "—";
}

// ===== Engine minimal (same logic bạn đang dùng ở Expenses) =====
function buildGrossMatrix(memberIds, expenses) {
  const m = {};
  for (const a of memberIds) {
    m[a] = {};
    for (const b of memberIds) m[a][b] = 0;
  }

  for (const e of expenses || []) {
    const payer = e.payerId;
    const debts = e.debts || {};
    for (const [debtor, amount] of Object.entries(debts)) {
      const amt = Number(amount || 0);
      if (!payer || !debtor || !Number.isFinite(amt) || amt <= 0) continue;
      if (!m[debtor] || m[debtor][payer] == null) continue;
      m[debtor][payer] += amt;
    }
  }
  return m;
}

function computeNetBalances(memberIds, gross) {
  // balance = incoming - outgoing
  const balances = {};
  for (const id of memberIds) balances[id] = 0;

  for (const debtor of memberIds) {
    for (const creditor of memberIds) {
      const v = Number(gross?.[debtor]?.[creditor] || 0);
      if (!Number.isFinite(v) || v === 0) continue;

      // debtor outgoing
      balances[debtor] -= v;
      // creditor incoming
      balances[creditor] += v;
    }
  }
  return balances;
}

function applyPaymentsToBalances(balances, payments) {
  const out = { ...balances };

  for (const p of payments || []) {
    const from = p.fromId;
    const to = p.toId;
    const amt = Number(p.amount || 0);
    if (!from || !to || !Number.isFinite(amt) || amt <= 0) continue;

    // người trả: bớt nợ => balance tăng
    out[from] = (out[from] ?? 0) + amt;
    // người nhận: bớt phải thu => balance giảm
    out[to] = (out[to] ?? 0) - amt;
  }
  return out;
}

function settleDebts(balances) {
  const eps = 0.0000001;
  const debtors = [];
  const creditors = [];

  for (const [id, b] of Object.entries(balances || {})) {
    if (b < -eps)
      debtors.push({ id, amt: -b }); // phải trả
    else if (b > eps) creditors.push({ id, amt: b }); // được nhận
  }

  debtors.sort((a, b) => b.amt - a.amt);
  creditors.sort((a, b) => b.amt - a.amt);

  const res = [];
  let i = 0,
    j = 0;

  while (i < debtors.length && j < creditors.length) {
    const d = debtors[i];
    const c = creditors[j];
    const x = Math.min(d.amt, c.amt);

    if (x > eps) {
      res.push({ fromId: d.id, toId: c.id, amount: x });
      d.amt -= x;
      c.amt -= x;
    }

    if (d.amt <= eps) i++;
    if (c.amt <= eps) j++;
  }

  return res;
}

function buildSettleMatrix(memberIds, settle) {
  const m = {};
  for (const a of memberIds) {
    m[a] = {};
    for (const b of memberIds) m[a][b] = 0;
  }

  for (const s of settle || []) {
    const from = s.fromId ?? s.from ?? s.debtorId;
    const to = s.toId ?? s.to ?? s.creditorId;
    const amt = Number(s.amount ?? s.amt ?? 0);
    if (!from || !to || !Number.isFinite(amt) || amt <= 0) continue;
    if (!m[from] || m[from][to] == null) continue;
    m[from][to] += amt;
  }

  return m;
}

// ===== realtime unsub holders =====
let _unsubExpenses = null;
let _unsubPayments = null;

export function renderDashboardPage() {
  const app = document.querySelector("#app");
  // ✅ stop watchers from previous render (tránh callback bắn vào DOM cũ)
  if (_unsubExpenses) {
    _unsubExpenses();
    _unsubExpenses = null;
  }
  if (_unsubPayments) {
    _unsubPayments();
    _unsubPayments = null;
  }

  const email = state.user?.email || "Unknown";

  const roster = getRoster();
  const memberIds = roster.map((x) => x.id);

  let period = currentPeriod();
  let liveExpenses = [];
  let livePayments = [];

  function renderView(settle, settleMatrix) {
    const matrixHtml = renderMatrixTable({
      members: roster.map((x) => ({ id: x.id, name: x.name })),
      matrix: settleMatrix,
      title: "Ma trận còn phải trả (sau cấn trừ)",
    });

    const settleHtml =
      settle.length > 0
        ? settle
            .map((s) => {
              const from = s.fromId ?? s.from ?? s.debtorId;
              const to = s.toId ?? s.to ?? s.creditorId;
              return `
                <li class="list-group-item d-flex justify-content-between">
                  <span>${nameOf(from, roster)} → <b>${nameOf(to, roster)}</b></span>
                  <span class="fw-semibold">${formatVND(s.amount)}</span>
                </li>
              `;
            })
            .join("")
        : `<li class="list-group-item text-secondary">Không có khoản nợ nào.</li>`;

    app.innerHTML = `
      <div class="container py-4">
        <div class="d-flex justify-content-between align-items-center mb-3">
          <div>
            <h1 class="h4 mb-1">${t("dashboard")}</h1>
            <div class="text-secondary small">${t("loggedInAs")}: ${email}</div>
            <div class="text-secondary small">${t("group")}: ${state.groupId}</div>
          </div>

          <div class="d-flex gap-2">
            <a class="btn btn-outline-primary btn-sm" href="#/expenses">Chi tiêu</a>
            <button id="btnLogout" class="btn btn-outline-danger btn-sm">${t("logout")}</button>
          </div>
        </div>

        <div class="row g-2 align-items-end mb-3">
          <div class="col-6 col-md-4">
            <label class="form-label small mb-1">Chọn tháng</label>
            <input id="periodPicker" type="month" class="form-control" value="${period}" />
          </div>
          <div class="col-6 col-md-8">
            <div class="small text-secondary">
              Dashboard này chỉ hiển thị: <b>Ma trận còn phải trả</b> và <b>Kết quả cấn trừ</b>.
            </div>
          </div>
        </div>

        <div class="card mb-3">
          <div class="card-header">Ma trận</div>
          <div class="card-body">
            ${matrixHtml}
          </div>
        </div>

        <div class="card">
          <div class="card-header">Kết quả cấn trừ (ai trả ai)</div>
          <ul class="list-group list-group-flush">
            ${settleHtml}
          </ul>
        </div>
      </div>
    `;

    document.getElementById("btnLogout").onclick = async () => {
      await logout();
    };

    document.getElementById("periodPicker").onchange = (e) => {
      period = e.target.value || currentPeriod();
      startWatch();
    };
  }

  function recomputeAndRender() {
    const gross = buildGrossMatrix(memberIds, liveExpenses);
    let balances = computeNetBalances(memberIds, gross);
    balances = applyPaymentsToBalances(balances, livePayments);
    const settle = settleDebts(balances);
    const settleMatrix = buildSettleMatrix(memberIds, settle);
    renderView(settle, settleMatrix);
  }

  function startWatch() {
    if (_unsubExpenses) _unsubExpenses();
    if (_unsubPayments) _unsubPayments();

    const { start, end } = getMonthRange(period);
    const groupId = state.groupId;

    _unsubExpenses = watchExpensesByRange(groupId, start, end, (items) => {
      // ✅ chỉ xử lý khi đang ở dashboard
      if (!location.hash.startsWith("#/dashboard")) return;

      liveExpenses = items;
      recomputeAndRender();
    });

    _unsubPayments = watchPaymentsByRange(groupId, start, end, (items) => {
      // ✅ chỉ xử lý khi đang ở dashboard
      if (!location.hash.startsWith("#/dashboard")) return;

      livePayments = items;
      recomputeAndRender();
    });
  }

  // init
  startWatch();
  // ✅ auto cleanup when leaving expenses page
  // ✅ auto cleanup when leaving dashboard page
  const onHashChange = () => {
    if (!location.hash.startsWith("#/dashboard")) {
      if (_unsubExpenses) {
        _unsubExpenses();
        _unsubExpenses = null;
      }
      if (_unsubPayments) {
        _unsubPayments();
        _unsubPayments = null;
      }
      window.removeEventListener("hashchange", onHashChange);
    }
  };

  window.addEventListener("hashchange", onHashChange);

  recomputeAndRender();
}
