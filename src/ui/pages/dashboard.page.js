import { logout } from "../../services/auth.service";
import { state } from "../../core/state";
import { renderMatrixTable } from "../components/matrixTable";
import { t, formatVND } from "../../config/i18n";
import { EMAIL_TO_MEMBER_ID } from "../../config/members.map";

import { watchExpensesByRange } from "../../services/expense.service";
import { watchPaymentsByRange } from "../../services/payment.service";
import { watchRentByPeriod } from "../../services/rent.service";

// ===== Helpers: period =====
function currentPeriod() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`; // YYYY-MM
}

function clampPct(x) {
  if (!Number.isFinite(x)) return 0;
  return Math.max(0, Math.min(100, x));
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
  const base = [
    { id: "hung", name: "Hưng" },
    { id: "thao", name: "Thảo" },
    { id: "thinh", name: "Thịnh" },
    { id: "thuy", name: "Thùy" },
  ];

  const ms = state.members || [];
  if (!ms.length) return base;

  // Nếu members có memberId đúng, ưu tiên lấy displayName/email để hiển thị đẹp
  return base.map((x) => {
    const m = ms.find((z) => z.memberId === x.id);
    if (!m) return x;
    return {
      id: x.id, // ✅ GIỮ ID CHUẨN để khớp payerId/debts
      name: m.displayName || m.email || x.name,
    };
  });
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

function roundVND(n) {
  return Math.round(Number(n || 0));
}

function settleDebts(balances) {
  const eps = 0.5;
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
let _unsubRent = null;

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
  if (_unsubRent) {
    _unsubRent();
    _unsubRent = null;
  }

  const email = state.user?.email || "Unknown";

  const roster = getRoster();
  const myId = EMAIL_TO_MEMBER_ID[state.user?.email || ""] || null;
  const memberIds = roster.map((x) => x.id);

  let period = currentPeriod();
  let liveExpenses = [];
  let livePayments = [];
  let liveRent = null;

  function getMyMemberId() {
    const email = state.user?.email || "";
    return EMAIL_TO_MEMBER_ID[email] || null;
  }

  function computeMyRentSummary(rentDoc) {
    const myId = getMyMemberId();
    if (!rentDoc || !myId) return null;

    const payerId = rentDoc.payerId || "hung"; // fallback nếu bạn không lưu payerId
    const shares = rentDoc.shares || {};
    const paid = rentDoc.paid || {};

    // tổng tiền tháng
    const total = Number(rentDoc.total || 0);

    // nếu là người trả chủ nhà (Hưng)
    if (myId === payerId) {
      const myShare = Number(shares[payerId] || 0);

      // chỉ thu từ 3 người còn lại (không tính phần Hưng)
      const expectedFromOthers = Math.max(0, total - myShare);

      const collectedFromOthers = Object.entries(paid).reduce(
        (sum, [id, val]) => {
          if (id === payerId) return sum; // ✅ bỏ qua Hưng
          return sum + Number(val || 0);
        },
        0,
      );

      const remainToCollect = Math.max(
        0,
        expectedFromOthers - collectedFromOthers,
      );

      return {
        mode: "payer",
        total,
        myShare,
        expectedFromOthers,
        collectedFromOthers,
        remainToCollect,
      };
    }

    // người bình thường: phải đóng - đã chuyển
    const mustPay = Number(shares[myId] || 0);
    const alreadyPaid = Number(paid[myId] || 0);
    const remain = Math.max(0, mustPay - alreadyPaid);

    return {
      mode: "member",
      mustPay,
      alreadyPaid,
      remain,
    };
  }

  let onlyMine = true;
  let personFilter = "all";
  let gotExpenses = false;
  let gotPayments = false;

  function renderLoadingView() {
    app.innerHTML = `
    <div class="container py-4" style="max-width: 980px;">
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
      </div>

      <div class="d-flex align-items-center gap-3">
        <div class="spinner-border" role="status"></div>
        <div>
          <div class="fw-semibold">Đang tải dữ liệu tháng ${period}...</div>
          <div class="text-secondary small">Sẽ tự cập nhật khi dữ liệu về</div>
        </div>
      </div>
    </div>
  `;

    document.getElementById("btnLogout").onclick = async () => logout();

    document.getElementById("periodPicker").onchange = (e) => {
      period = e.target.value || currentPeriod();

      // ✅ reset cờ loading khi đổi tháng
      gotExpenses = false;
      gotPayments = false;

      startWatch();
      renderLoadingView();
    };
  }

  function renderView(settle, settleMatrix, rentSum) {
    // ====== áp filter cho danh sách settle ======
    let filtered = [...(settle || [])];

    if (myId && onlyMine) {
      filtered = filtered.filter((s) => s.fromId === myId || s.toId === myId);
    }
    if (personFilter !== "all") {
      filtered = filtered.filter(
        (s) => s.fromId === personFilter || s.toId === personFilter,
      );
    }

    // ====== 2 hộp: của tôi (dựa trên settle gốc, KHÔNG bị filter theo người) ======
    const myPayList = myId
      ? (settle || []).filter((s) => s.fromId === myId)
      : [];
    const myReceiveList = myId
      ? (settle || []).filter((s) => s.toId === myId)
      : [];

    const sum = (arr) => arr.reduce((a, x) => a + Number(x.amount || 0), 0);

    const myPayTotal = sum(myPayList);
    const myReceiveTotal = sum(myReceiveList);

    const renderMiniList = (arr, emptyText) => {
      if (!arr.length)
        return `<div class="text-secondary small">${emptyText}</div>`;
      return `
      <ul class="list-group list-group-flush">
        ${arr
          .slice(0, 5)
          .map((s) => {
            const from = s.fromId;
            const to = s.toId;
            const amount = Number(s.amount || 0);
            return `
              <li class="list-group-item d-flex justify-content-between align-items-center">
                <div class="small">
                  <div class="fw-semibold">${nameOf(from, roster)} → ${nameOf(to, roster)}</div>
                  <div class="text-secondary">${formatVND(amount)}</div>
                </div>
                <button class="btn btn-outline-secondary btn-sm" data-copy="${from}|${to}|${amount}">
                  Copy
                </button>
              </li>
            `;
          })
          .join("")}
      </ul>
    `;
    };

    const renderSettleList = (arr) => {
      if (!arr.length)
        return `<li class="list-group-item text-secondary">Không có khoản nợ nào.</li>`;

      return arr
        .map((s) => {
          const from = s.fromId;
          const to = s.toId;
          const amount = Number(s.amount || 0);
          return `
          <li class="list-group-item d-flex justify-content-between align-items-center">
            <div>
              <div>${nameOf(from, roster)} → <b>${nameOf(to, roster)}</b></div>
              <div class="small text-secondary">${formatVND(amount)}</div>
            </div>
            <button class="btn btn-outline-secondary btn-sm" data-copy="${from}|${to}|${amount}">
              Copy
            </button>
          </li>
        `;
        })
        .join("");
    };

    let rentBoxHtml = "";
    if (rentSum) {
      if (rentSum.mode === "payer") {
        const pct = clampPct(
          rentSum.expectedFromOthers <= 0
            ? 100
            : (rentSum.collectedFromOthers / rentSum.expectedFromOthers) * 100,
        );

        const badge =
          rentSum.remainToCollect <= 0
            ? `<span class="badge bg-success">ĐÃ THU ĐỦ</span>`
            : `<span class="badge bg-warning text-dark">CÒN THIẾU ${formatVND(rentSum.remainToCollect)}</span>`;

        rentBoxHtml = `
      <div class="card mb-3">
        <div class="card-header d-flex justify-content-between align-items-center">
          <b>Tiền nhà tháng này</b>
          <div class="d-flex align-items-center gap-2">
            ${badge}
            <a class="btn btn-outline-secondary btn-sm" href="#/rent">Mở</a>
          </div>
        </div>

        <div class="card-body">
          <div class="text-secondary small mb-2">Bạn là người trả.</div>

          <div class="row g-3">
            <div class="col-12 col-md-4">
              <div class="text-secondary small">Phần của bạn</div>
              <div class="fw-semibold fs-5">${formatVND(rentSum.myShare)}</div>
            </div>

            <div class="col-12 col-md-8">
              <div class="d-flex justify-content-between small text-secondary">
                <span>Tiến độ thu tiền</span>
                <span>${Math.round(pct)}%</span>
              </div>

              <div class="progress" style="height: 10px;">
                <div class="progress-bar ${rentSum.remainToCollect <= 0 ? "bg-success" : "bg-warning"}"
                     role="progressbar"
                     style="width:${pct}%"
                     aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100"></div>
              </div>

              <div class="row mt-3 text-center">
                <div class="col">
                  <div class="text-secondary small">Cần thu</div>
                  <div class="fw-semibold">${formatVND(rentSum.expectedFromOthers)}</div>
                </div>
                <div class="col">
                  <div class="text-secondary small">Đã thu</div>
                  <div class="fw-semibold text-success">${formatVND(rentSum.collectedFromOthers)}</div>
                </div>
                <div class="col">
                  <div class="text-secondary small">Còn thiếu</div>
                  <div class="fw-semibold ${rentSum.remainToCollect <= 0 ? "text-success" : "text-danger"}">
                    ${formatVND(rentSum.remainToCollect)}
                  </div>
                </div>
              </div>
            </div>
          </div>

        </div>
      </div>
    `;
      } else {
        const pct = clampPct(
          rentSum.mustPay <= 0
            ? 100
            : (rentSum.alreadyPaid / rentSum.mustPay) * 100,
        );

        const badge =
          rentSum.remain <= 0
            ? `<span class="badge bg-success">ĐÃ XONG</span>`
            : `<span class="badge bg-danger">CÒN THIẾU ${formatVND(rentSum.remain)}</span>`;

        rentBoxHtml = `
      <div class="card mb-3">
        <div class="card-header d-flex justify-content-between align-items-center">
          <b>Tiền nhà tháng này</b>
          <div class="d-flex align-items-center gap-2">
            ${badge}
            <a class="btn btn-outline-secondary btn-sm" href="#/rent">Mở</a>
          </div>
        </div>

        <div class="card-body">
          <div class="d-flex justify-content-between small text-secondary">
            <span>Tiến độ đóng tiền</span>
            <span>${Math.round(pct)}%</span>
          </div>

          <div class="progress" style="height: 10px;">
            <div class="progress-bar ${rentSum.remain <= 0 ? "bg-success" : "bg-danger"}"
                 role="progressbar"
                 style="width:${pct}%"
                 aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100"></div>
          </div>

          <div class="row mt-3 text-center">
            <div class="col">
              <div class="text-secondary small">Bạn cần trả</div>
              <div class="fw-semibold">${formatVND(rentSum.mustPay)}</div>
            </div>
            <div class="col">
              <div class="text-secondary small">Đã chuyển</div>
              <div class="fw-semibold text-success">${formatVND(rentSum.alreadyPaid)}</div>
            </div>
            <div class="col">
              <div class="text-secondary small">Còn thiếu</div>
              <div class="fw-semibold ${rentSum.remain <= 0 ? "text-success" : "text-danger"}">
                ${formatVND(rentSum.remain)}
              </div>
            </div>
          </div>

        </div>
      </div>
    `;
      }
    }
    app.innerHTML = `
    <div class="container py-4" style="max-width: 980px;">
      <div class="d-flex justify-content-between align-items-center mb-3">
        <div>
          <h1 class="h4 mb-1">${t("dashboard")}</h1>
          <div class="text-secondary small">${t("loggedInAs")}: ${email}</div>
          <div class="text-secondary small">${t("group")}: ${state.groupId}</div>
        </div>

        <div class="d-flex gap-2">
          <a class="btn btn-outline-primary btn-sm" href="#/expenses">Chi tiêu</a>
          <a class="btn btn-outline-secondary btn-sm" href="#/rent">Tiền nhà</a>
          <button id="btnLogout" class="btn btn-outline-danger btn-sm">${t("logout")}</button>
        </div>
      </div>

      <div class="row g-2 align-items-end mb-3">
        <div class="col-6 col-md-4">
          <label class="form-label small mb-1">Chọn tháng</label>
          <input id="periodPicker" type="month" class="form-control" value="${period}" />
        </div>

        <div class="col-6 col-md-4">
          <label class="form-label small mb-1">Lọc nhanh</label>
          <div class="form-check mt-2">
            <input class="form-check-input" type="checkbox" id="onlyMine" ${onlyMine ? "checked" : ""} ${myId ? "" : "disabled"}>
            <label class="form-check-label" for="onlyMine">Chỉ liên quan tới tôi</label>
          </div>
          ${!myId ? `<div class="small text-warning">Không xác định được “bạn là ai” (email chưa map memberId).</div>` : ""}
        </div>

        <div class="col-12 col-md-4">
          <label class="form-label small mb-1">Lọc theo người</label>
          <select id="personFilter" class="form-select">
            <option value="all" ${personFilter === "all" ? "selected" : ""}>Tất cả</option>
            ${roster
              .map(
                (m) =>
                  `<option value="${m.id}" ${personFilter === m.id ? "selected" : ""}>${m.name}</option>`,
              )
              .join("")}
          </select>
        </div>
      </div>

      ${rentBoxHtml}

      <div class="row g-2 mb-3">
        <div class="col-12 col-md-6">
          <div class="card h-100">
            <div class="card-header d-flex justify-content-between">
              <b>Bạn cần trả</b>
              <span class="fw-semibold">${formatVND(myPayTotal)}</span>
            </div>
            <div class="card-body p-0">
              ${renderMiniList(myPayList, "Không có khoản cần trả.")}
            </div>
          </div>
        </div>

        <div class="col-12 col-md-6">
          <div class="card h-100">
            <div class="card-header d-flex justify-content-between">
              <b>Bạn sẽ nhận</b>
              <span class="fw-semibold">${formatVND(myReceiveTotal)}</span>
            </div>
            <div class="card-body p-0">
              ${renderMiniList(myReceiveList, "Không có khoản cần nhận.")}
            </div>
          </div>
        </div>
      </div>

      <div class="card">
        <div class="card-header d-flex justify-content-between align-items-center">
          <b>Kết quả cấn trừ (ai trả ai)</b>
          <span class="small text-secondary">${filtered.length} dòng</span>
        </div>
        <ul class="list-group list-group-flush">
          ${renderSettleList(filtered)}
        </ul>
      </div>

    </div>
  `;

    // ====== bind ======
    document.getElementById("btnLogout").onclick = async () => logout();

    document.getElementById("periodPicker").onchange = (e) => {
      period = e.target.value || currentPeriod();
      gotExpenses = false;
      gotPayments = false;
      startWatch();
      renderLoadingView();
    };

    document.getElementById("onlyMine")?.addEventListener("change", (e) => {
      onlyMine = !!e.target.checked;
      recomputeAndRender();
    });

    document.getElementById("personFilter")?.addEventListener("change", (e) => {
      personFilter = e.target.value || "all";
      recomputeAndRender();
    });

    // copy buttons
    app.querySelectorAll("[data-copy]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const [fromId, toId, amountStr] = btn
          .getAttribute("data-copy")
          .split("|");
        const amount = Number(amountStr || 0);

        const text = `${nameOf(fromId, roster)} chuyển ${formatVND(amount)} cho ${nameOf(toId, roster)} (tháng ${period})`;
        try {
          await navigator.clipboard.writeText(text);
          const old = btn.textContent;
          btn.textContent = "Đã copy";
          setTimeout(() => (btn.textContent = old), 900);
        } catch {
          // fallback
          window.prompt("Copy nội dung này:", text);
        }
      });
    });
  }

  function recomputeAndRender() {
    if (!gotExpenses || !gotPayments) {
      renderLoadingView();
      return;
    }
    const gross = buildGrossMatrix(memberIds, liveExpenses);
    let balances = computeNetBalances(memberIds, gross);
    balances = applyPaymentsToBalances(balances, livePayments);
    for (const k of Object.keys(balances)) {
      balances[k] = roundVND(balances[k]);
    }
    const settle = settleDebts(balances);
    const settleMatrix = buildSettleMatrix(memberIds, settle);
    const rentSum = computeMyRentSummary(liveRent); // ✅ THÊM
    renderView(settle, settleMatrix, rentSum);
  }

  function startWatch() {
    if (_unsubExpenses) _unsubExpenses();
    if (_unsubPayments) _unsubPayments();
    if (_unsubRent) _unsubRent();

    const { start, end } = getMonthRange(period);
    const groupId = state.groupId;

    _unsubExpenses = watchExpensesByRange(groupId, start, end, (items) => {
      if (!document.body.contains(app)) return;

      liveExpenses = items;
      gotExpenses = true;

      recomputeAndRender();
    });

    _unsubPayments = watchPaymentsByRange(groupId, start, end, (items) => {
      if (!document.body.contains(app)) return;

      livePayments = items;
      gotPayments = true;

      recomputeAndRender();
    });

    _unsubRent = watchRentByPeriod(groupId, period, (doc) => {
      if (!document.body.contains(app)) return;
      liveRent = doc;
      recomputeAndRender(); // để rentBox update realtime
    });
  }

  // ✅ auto cleanup when leaving expenses page
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
      if (_unsubRent) {
        _unsubRent();
        _unsubRent = null;
      } // ✅ THÊM

      window.removeEventListener("hashchange", onHashChange);
    }
  };

  window.addEventListener("hashchange", onHashChange);

  startWatch();
  renderLoadingView();
}
