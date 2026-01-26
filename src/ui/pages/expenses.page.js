import { state } from "../../core/state";
import { ROSTER, ROSTER_IDS, nameOf } from "../../config/roster";
import { formatVND } from "../../config/i18n";
import { isAdmin } from "../../core/roles";
import { openPaymentModal } from "../components/paymentModal";
import { showToast } from "../components/toast";
import { openConfirmModal } from "../components/confirmModal";

import {
  addExpense,
  removeExpense,
  watchExpensesByRange,
} from "../../services/expense.service";
import {
  addPayment,
  removePayment,
  watchPaymentsByRange,
} from "../../services/payment.service";

import { buildGrossMatrix } from "../../engine/grossMatrix";
import { computeNetBalances } from "../../engine/netBalance";
import { settleDebts } from "../../engine/settle";
import { renderMatrixTable } from "../components/matrixTable";

function $(id) {
  return document.getElementById(id);
}

// Nhập VNĐ: chấp nhận 10000, 10.000, 10,5, 10.000,5
function parseVndInput(s) {
  if (s === null || s === undefined) return 0;
  let x = String(s).trim();
  if (!x) return 0;

  // bỏ ký tự tiền tệ
  x = x.replace(/[₫đ\s]/gi, "");

  // nếu có cả "." và "," -> "." là ngăn cách nghìn, "," là thập phân
  if (x.includes(".") && x.includes(",")) {
    x = x.replaceAll(".", "").replace(",", ".");
  } else {
    // nếu chỉ có "," -> coi là thập phân
    if (x.includes(",")) x = x.replace(",", ".");
    // nếu chỉ có "." -> có thể là thập phân hoặc nghìn; mặc định: nếu nhiều dấu "." -> nghìn
    const dots = (x.match(/\./g) || []).length;
    if (dots >= 2) x = x.replaceAll(".", "");
  }

  const n = Number(x);
  return Number.isFinite(n) ? n : 0;
}

function getMonthRange(period) {
  // period: "YYYY-MM"
  const [y, m] = period.split("-").map(Number);
  const start = `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-01`;

  // end = first day of next month
  const d = new Date(y, m - 1, 1);
  d.setMonth(d.getMonth() + 1);
  const endY = d.getFullYear();
  const endM = String(d.getMonth() + 1).padStart(2, "0");
  const end = `${endY}-${endM}-01`;
  return { start, end };
}

function currentPeriod() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

function todayYmd() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

let _unsubExpenses = null;
let _unsubPayments = null;

const live = {
  expenses: [],
  payments: [],
};

export async function renderExpensesPage() {
  const app = document.querySelector("#app");
  if (!state.user) return;
  const admin = isAdmin(state.user);
  const payLocks = new Set(); // chống double submit

  // ====== UI: 1 cột dọc, rõ ràng, không “chốt sổ” rối
  app.innerHTML = `
    <div class="container py-4" style="max-width: 980px;">
      <div class="d-flex justify-content-between align-items-center mb-3">
        <div>
          <h1 class="h4 mb-1">Chi tiêu & Cấn trừ</h1>
          <div class="text-secondary small">Nhóm: <b>${state.groupId || "-"}</b></div>
        </div>
        <a class="btn btn-outline-secondary btn-sm" href="#/dashboard">← Về Tổng quan</a>
      </div>

      <div class="row g-2 align-items-end">
        <div class="col-6 col-md-4">
          <label class="form-label small mb-1">Chọn tháng</label>
          <input id="periodPicker" type="month" class="form-control" />
        </div>
        <div class="col-12">
          <div class="small text-secondary mt-2">
            Dữ liệu chi tiêu & thanh toán sẽ lọc theo tháng bạn chọn.
          </div>
        </div>
      </div>

      <hr class="my-3"/>

      <!-- FORM THÊM CHI -->
      <div class="card mb-3">
        <div class="card-header">Thêm khoản chi</div>
        <div class="card-body">
          <div class="row g-3">
            <div class="col-md-4">
              <label class="form-label">Ngày</label>
              <input id="exDate" type="date" class="form-control" value="${todayYmd()}"/>
            </div>

            <div class="col-md-4">
              <label class="form-label">Số tiền (VNĐ)</label>
              <input id="exAmount" class="form-control" placeholder="VD: 10000 hoặc 10.000,5"/>
              <div class="form-text">Giữ số lẻ nếu có. Nhập 10.000 hoặc 10000 đều được.</div>
            </div>

            <div class="col-md-4">
              <label class="form-label">Người trả</label>
              <select id="exPayer" class="form-select">
                ${ROSTER.map((m) => `<option value="${m.id}">${m.name}</option>`).join("")}
              </select>
            </div>

            <div class="col-12">
              <label class="form-label mb-2">Người tham gia (tick)</label>
              <div class="row g-2">
                ${ROSTER.map(
                  (m) => `
                  <div class="col-6 col-md-3">
                    <div class="form-check">
                      <input class="form-check-input exPart" type="checkbox" id="p_${m.id}" data-id="${m.id}" checked>
                      <label class="form-check-label" for="p_${m.id}">${m.name}</label>
                    </div>
                  </div>
                `,
                ).join("")}
              </div>
              <div class="form-text">
                Nếu người trả cũng tham gia, cứ tick bình thường. Engine sẽ tự tính “phần người trả”.
              </div>
            </div>

            <div class="col-12">
              <div class="d-flex align-items-center gap-3">
                <div class="form-check">
                  <input class="form-check-input" type="checkbox" id="exEqual" checked>
                  <label class="form-check-label" for="exEqual">Chia đều</label>
                </div>
                <div class="small text-secondary">
                  (Bỏ tick để tuỳ chỉnh số tiền nợ cho từng người)
                </div>
              </div>
            </div>

            <div class="col-12">
              <div class="card">
                <div class="card-header">Phân bổ nợ (ai nợ người trả bao nhiêu)</div>
                <div class="card-body">
                  <div id="debtsBox" class="row g-3"></div>
                  <div class="mt-2 small">
                    <div>👉 Tổng nợ của người khác: <b id="sumDebts">0 ₫</b></div>
                    <div>👉 Phần của người trả (tự tính): <b id="payerShare">0 ₫</b></div>
                  </div>
                </div>
              </div>
            </div>

            <div class="col-12">
              <label class="form-label">Ghi chú (tuỳ chọn)</label>
              <input id="exNote" class="form-control" placeholder="VD: Ăn uống, Đi chợ, ..."/>
            </div>

            <div class="col-12 d-flex gap-2">
              <button id="btnSaveExpense" class="btn btn-primary">Lưu chi tiêu</button>
              <button id="btnResetExpense" class="btn btn-outline-secondary">Nhập lại</button>
              <div id="msg" class="small text-danger align-self-center"></div>
            </div>
          </div>
        </div>
      </div>

      <!-- DANH SÁCH CHI -->
      <div class="card mb-3">
        <div class="card-header d-flex justify-content-between align-items-center">
          <div>Danh sách chi tiêu</div>
          <button id="btnToggleExpenses" class="btn btn-outline-secondary btn-sm" type="button">
            Ẩn
          </button>
        </div>
        <div class="card-body" id="expensesListWrap">
          <div id="expensesList" class="small text-secondary">Đang tải...</div>
        </div>
      </div>


      <!-- TỔNG KẾT NỢ (1 cột, rõ ràng) -->
      <div id="engineResult" class="mb-3"></div>

      <!-- LỊCH SỬ THANH TOÁN -->
      <div class="card">
        <div class="card-header">Lịch sử thanh toán</div>
        <div class="card-body">
          <div id="paymentsList" class="text-secondary small">Đang tải...</div>
        </div>
      </div>
    </div>
  `;

  // Toggle danh sách chi tiêu (ẩn/hiện)
  let expensesCollapsed = false;

  const btnToggle = document.getElementById("btnToggleExpenses");
  const wrap = document.getElementById("expensesListWrap");

  btnToggle?.addEventListener("click", () => {
    expensesCollapsed = !expensesCollapsed;
    if (expensesCollapsed) {
      wrap.style.display = "none";
      btnToggle.textContent = "Hiện";
    } else {
      wrap.style.display = "block";
      btnToggle.textContent = "Ẩn";
    }
  });

  // ====== Render debts inputs
  function renderDebtsInputs() {
    const payerId = $("exPayer").value;
    const amount = parseVndInput($("exAmount").value);
    const isEqual = $("exEqual").checked;

    const participantIds = [...document.querySelectorAll(".exPart")]
      .filter((c) => c.checked)
      .map((c) => c.dataset.id);

    const nParticipants = participantIds.length || 0;
    const box = $("debtsBox");
    box.innerHTML = "";

    // Debtors = participants excluding payer
    const debtorIds = participantIds.filter((id) => id !== payerId);

    // Equal split: mỗi người tham gia 1 phần bằng nhau
    const eachShare = nParticipants > 0 ? amount / nParticipants : 0;

    for (const id of ROSTER_IDS) {
      if (id === payerId) continue;
      const active = debtorIds.includes(id);
      const val = isEqual && active ? eachShare : 0;

      box.innerHTML += `
        <div class="col-12 col-md-6">
          <label class="form-label">${nameOf(id)} nợ ${nameOf(payerId)}</label>
          <input
            class="form-control debtInput"
            data-id="${id}"
            ${active ? "" : "disabled"}
            value="${active ? String(val) : "0"}"
            placeholder="0"
          />
          <div class="form-text">${active ? "Đang tham gia" : "Không tham gia"}</div>
        </div>
      `;
    }

    recalcTotals();
  }

  function recalcTotals() {
    const amount = parseVndInput($("exAmount").value);
    const payerId = $("exPayer").value;

    const debts = getDebtsFromInputs(payerId);
    const sum = Object.values(debts).reduce((a, b) => a + b, 0);
    const payerShare = amount - sum;

    $("sumDebts").textContent = formatVND(sum);
    $("payerShare").textContent = formatVND(payerShare);
  }

  function getDebtsFromInputs(payerId) {
    const obj = {};
    for (const el of document.querySelectorAll(".debtInput")) {
      const id = el.dataset.id;
      if (id === payerId) continue;
      if (el.disabled) continue;
      const v = parseVndInput(el.value);
      if (v > 0) obj[id] = v;
    }
    return obj;
  }

  function setMsg(text = "") {
    $("msg").textContent = text;
  }

  // listeners
  $("exPayer").addEventListener("change", renderDebtsInputs);
  $("exAmount").addEventListener("input", () => {
    if ($("exEqual").checked) renderDebtsInputs();
    else recalcTotals();
  });
  $("exEqual").addEventListener("change", renderDebtsInputs);
  document
    .querySelectorAll(".exPart")
    .forEach((c) => c.addEventListener("change", renderDebtsInputs));
  document.addEventListener("input", (e) => {
    if (e.target?.classList?.contains("debtInput")) recalcTotals();
  });

  $("btnResetExpense").onclick = () => {
    $("exDate").value = todayYmd();
    $("exAmount").value = "";
    $("exNote").value = "";
    document.querySelectorAll(".exPart").forEach((c) => (c.checked = true));
    $("exEqual").checked = true;
    setMsg("");
    renderDebtsInputs();
  };

  $("btnSaveExpense").onclick = async () => {
    setMsg("");
    const groupId = state.groupId;
    if (!groupId) return setMsg("Thiếu groupId. Hãy đăng nhập lại.");

    const date = $("exDate").value || todayYmd();
    const amount = parseVndInput($("exAmount").value);
    const payerId = $("exPayer").value;
    const note = $("exNote").value.trim();

    if (!amount || amount <= 0) return setMsg("Số tiền phải > 0.");
    if (!payerId) return setMsg("Chọn người trả.");

    const participantIds = [...document.querySelectorAll(".exPart")]
      .filter((c) => c.checked)
      .map((c) => c.dataset.id);

    if (participantIds.length === 0)
      return setMsg("Phải tick ít nhất 1 người tham gia.");

    const debts = getDebtsFromInputs(payerId);

    if (debts[payerId])
      return setMsg("Người trả không được nằm trong danh sách nợ.");

    const sumDebts = Object.values(debts).reduce((a, b) => a + b, 0);
    if (sumDebts - amount > 0.000001)
      return setMsg("Tổng nợ của người khác không được lớn hơn tổng tiền.");

    try {
      await addExpense(groupId, {
        date,
        amount,
        payerId,
        participants: participantIds,
        debts,
        note,
        createdBy: state.user.uid,
      });

      $("exAmount").value = "";
      $("exNote").value = "";
      setMsg("");
    } catch (e) {
      console.error(e);
      setMsg(e?.message || "Lưu thất bại.");
    }
  };

  function renderExpensesList(expenses) {
    const wrap = $("expensesList");
    if (!expenses.length) {
      wrap.innerHTML = `<div class="text-secondary">Chưa có chi tiêu.</div>`;
      return;
    }

    wrap.innerHTML = `
      <div class="list-group">
        ${expenses
          .map(
            (e) => `
          <div class="list-group-item">
            <div class="d-flex justify-content-between align-items-start">
              <div>
                <div class="fw-semibold">${e.date} • ${formatVND(e.amount)}</div>
                <div class="text-secondary">Người trả: <b>${nameOf(e.payerId)}</b>${e.note ? ` • ${e.note}` : ""}</div>
                <div class="small text-secondary mt-1">
                  Nợ: ${
                    Object.entries(e.debts || {}).length
                      ? Object.entries(e.debts)
                          .map(([id, v]) => `${nameOf(id)} ${formatVND(v)}`)
                          .join(" • ")
                      : "Không có"
                  }
                </div>
              </div>
              ${admin ? `<button class="btn btn-outline-danger btn-sm" data-del="${e.id}">Xoá</button>` : ``}
            </div>
          </div>
        `,
          )
          .join("")}
      </div>
    `;

    wrap.querySelectorAll("[data-del]").forEach((btn) => {
      btn.onclick = async () => {
        const id = btn.getAttribute("data-del");
        const e = expenses.find((x) => x.id === id);

        openConfirmModal({
          title: "Xóa khoản chi",
          message: "Bạn chắc chắn muốn xóa khoản chi này?",
          meta: e
            ? `${e.date} • ${formatVND(e.amount)} • Người trả: ${nameOf(e.payerId)}`
            : "",
          okText: "Xóa",
          danger: true,
          onConfirm: async () => {
            try {
              await removeExpense(state.groupId, id);
              showToast({
                title: "Thành công",
                message: "Đã xóa khoản chi.",
                variant: "success",
              });
            } catch (err) {
              // createPayment đã có toast fail, còn xóa thì thêm tại đây
              showToast({
                title: "Thất bại",
                message: err?.message || "Không thể xóa khoản chi.",
                variant: "danger",
              });
              throw err;
            }
          },
        });
      };
    });
  }

  function renderPaymentsList(payments) {
    const wrap = $("paymentsList");
    if (!payments.length) {
      wrap.innerHTML = `<div class="text-secondary">Chưa có thanh toán.</div>`;
      return;
    }

    wrap.innerHTML = `
      <div class="list-group">
        ${payments
          .map(
            (p) => `
          <div class="list-group-item">
            <div class="d-flex justify-content-between align-items-start">
              <div>
                <div class="fw-semibold">${p.date} • ${nameOf(p.fromId)} → ${nameOf(p.toId)} • ${formatVND(p.amount)}</div>
                <div class="text-secondary small">${p.note ? p.note : ""}</div>
              </div>
              <button class="btn btn-outline-danger btn-sm" data-delpay="${p.id}">Xoá</button>
            </div>
          </div>
        `,
          )
          .join("")}
      </div>
    `;

    wrap.querySelectorAll("[data-delpay]").forEach((btn) => {
      btn.onclick = async () => {
        const id = btn.getAttribute("data-delpay");
        const p = payments.find((x) => x.id === id);

        openConfirmModal({
          title: "Xóa thanh toán",
          message: "Bạn chắc chắn muốn xóa thanh toán này?",
          meta: p
            ? `${p.date} • ${nameOf(p.fromId)} → ${nameOf(p.toId)} • ${formatVND(p.amount)}`
            : "",
          okText: "Xóa",
          danger: true,
          onConfirm: async () => {
            try {
              await removePayment(state.groupId, id);
              showToast({
                title: "Thành công",
                message: "Đã xóa thanh toán.",
                variant: "success",
              });
            } catch (err) {
              showToast({
                title: "Thất bại",
                message: err?.message || "Không thể xóa thanh toán.",
                variant: "danger",
              });
              throw err;
            }
          },
        });
      };
    });
  }

  // Áp thanh toán vào balances để phản ánh tiền đã trả
  function applyPaymentsToBalances(balances, payments) {
    const out = { ...balances };

    for (const p of payments) {
      const from = p.fromId;
      const to = p.toId;
      const amt = Number(p.amount || 0);

      if (!from || !to || !Number.isFinite(amt) || amt <= 0) continue;

      // Người trả: bớt nợ => balance tăng
      out[from] = (out[from] ?? 0) + amt;

      // Người nhận: bớt phải thu => balance giảm
      out[to] = (out[to] ?? 0) - amt;
    }

    return out;
  }

  // build ma trận "còn phải trả" từ kết quả cấn trừ
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
      if (!m[from]) continue;
      m[from][to] += amt;
    }

    return m;
  }

  function renderEngineFromData(expenses, payments) {
    const memberIds = ROSTER_IDS;

    // 1) Ma trận nợ gốc chỉ từ chi tiêu
    const gross = buildGrossMatrix(memberIds, expenses);

    // 2) Nợ ròng từ ma trận gốc
    let balances = computeNetBalances(memberIds, gross);

    // 3) Trừ thanh toán vào balances (tiền thực tế đã trả)
    balances = applyPaymentsToBalances(balances, payments || []);

    // 4) Cấn trừ từ balances đã trừ payment
    const settle = settleDebts(balances);

    // 5) Ma trận sau cấn trừ (để kiểm chứng) -> build từ settle list
    const settleMatrix = buildSettleMatrix(memberIds, settle);

    // UI blocks
    const grossHtml = renderMatrixTable({
      members: ROSTER,
      matrix: gross,
      title: "Ma trận nợ gốc (từ chi tiêu)",
    });

    const balancesHtml = `
      <ul class="list-group">
        ${Object.entries(balances)
          .map(([id, b]) => {
            const label = b > 0 ? "Được nhận" : b < 0 ? "Phải trả" : "Cân bằng";
            return `
              <li class="list-group-item d-flex justify-content-between">
                <span>${nameOf(id)}</span>
                <span class="fw-semibold">${label}: ${formatVND(Math.abs(b))}</span>
              </li>
            `;
          })
          .join("")}
      </ul>
    `;

    const settleHtml = `
      <ul class="list-group">
        ${
          settle.length
            ? settle
                .map((s) => {
                  const fromId = s.fromId ?? s.from ?? s.debtorId;
                  const toId = s.toId ?? s.to ?? s.creditorId;
                  const amount = Number(s.amount ?? s.amt ?? 0);

                  return `
                    <li class="list-group-item d-flex justify-content-between align-items-center">
                      <div>
                        <div class="fw-semibold">${nameOf(fromId)} → ${nameOf(toId)}: ${formatVND(amount)}</div>
                        <div class="small text-secondary">Chuyển khoản theo danh sách này để hết nợ nhanh nhất.</div>
                      </div>
                      
                      ${
                        admin
                          ? `
                          <div class="d-flex gap-2">
                            <button class="btn btn-outline-success btn-sm" data-payfull="${fromId}|${toId}|${amount}">Đã trả đủ</button>
                            <button class="btn btn-outline-primary btn-sm" data-paypart="${fromId}|${toId}|${amount}">Trả...</button>
                          </div>
                        `
                          : `<div class="small text-secondary">Chỉ quản trị viên mới được ghi nhận thanh toán.</div>`
                      }
                    </li>
                  `;
                })
                .join("")
            : `<li class="list-group-item text-secondary">Không có khoản nợ nào</li>`
        }
      </ul>
    `;

    const afterHtml = renderMatrixTable({
      members: ROSTER,
      matrix: settleMatrix,
      title: "Ma trận sau cấn trừ (kiểm chứng)",
    });

    // Render: 1 cột, theo flow dễ đọc
    $("engineResult").innerHTML = `
      <div class="card">
        <div class="card-header">
          <b>Tổng kết nợ</b>
          <div class="small text-secondary">Xem theo thứ tự: Nợ gốc → Nợ ròng → Cấn trừ</div>
        </div>
        <div class="card-body">

          <div class="mb-3">
            <div class="fw-semibold mb-2">1) Nợ thô (trước cấn trừ)</div>
            ${grossHtml}
          </div>

          <div class="mb-3">
            <div class="fw-semibold mb-2">2) Nợ ròng của từng người</div>
            ${balancesHtml}
          </div>

          <div class="mb-3">
            <div class="fw-semibold mb-2">3) Kết quả cấn trừ (ai trả ai)</div>
            ${settleHtml}
          </div>

          <details class="mt-2">
            <summary class="small text-secondary">Xem ma trận sau cấn trừ (kiểm chứng)</summary>
            <div class="mt-2">${afterHtml}</div>
          </details>

        </div>
      </div>
    `;

    bindPaymentButtons();
  }

  function bindPaymentButtons() {
    if (!isAdmin(state.user)) return;

    // helper: lock theo giao dịch
    const lockKey = (fromId, toId) => `${fromId}__${toId}`;
    const withLock = async (key, fn) => {
      if (payLocks.has(key)) return;
      payLocks.add(key);
      try {
        await fn();
      } finally {
        payLocks.delete(key);
      }
    };

    // trả đủ (KHÓA số tiền)
    document.querySelectorAll("[data-payfull]").forEach((btn) => {
      btn.onclick = async () => {
        const [fromId, toId, amountStr] = btn
          .getAttribute("data-payfull")
          .split("|");
        const amount = Number(amountStr);
        const key = lockKey(fromId, toId);

        await withLock(key, async () => {
          openPaymentModal({
            title: "Trả đủ theo cấn trừ",
            fromName: nameOf(fromId),
            toName: nameOf(toId),
            amount, // default = đúng settle
            maxAmount: amount, // phòng trường hợp dev đổi lock
            lockAmount: true, // ✅ khóa input
            defaultNote: "Trả đủ theo cấn trừ",
            parseVndInput,
            onSubmit: async ({ amount: amt, note }) => {
              await createPayment(
                fromId,
                toId,
                amt,
                note || "Trả đủ theo cấn trừ",
              );
              showToast({
                title: "Thành công",
                message: "Đã ghi nhận thanh toán.",
                variant: "success",
              });
            },
          });
        });
      };
    });

    // trả một phần (GIỚI HẠN <= max)
    document.querySelectorAll("[data-paypart]").forEach((btn) => {
      btn.onclick = async () => {
        const [fromId, toId, amountStr] = btn
          .getAttribute("data-paypart")
          .split("|");
        const max = Number(amountStr);
        const key = lockKey(fromId, toId);

        await withLock(key, async () => {
          openPaymentModal({
            title: "Trả một phần",
            fromName: nameOf(fromId),
            toName: nameOf(toId),
            amount: max, // gợi ý = max hiện tại
            maxAmount: max, // ✅ chặn vượt
            lockAmount: false,
            defaultNote: "Trả một phần",
            parseVndInput,
            onSubmit: async ({ amount: amt, note }) => {
              await createPayment(fromId, toId, amt, note || "Trả một phần");
              showToast({
                title: "Thành công",
                message: "Đã ghi nhận thanh toán.",
                variant: "success",
              });
            },
          });
        });
      };
    });
  }

  async function createPayment(fromId, toId, amount, note) {
    const groupId = state.groupId;
    const date = todayYmd();

    try {
      await addPayment(groupId, {
        date,
        fromId,
        toId,
        amount,
        note,
        createdBy: state.user.uid,
      });
    } catch (e) {
      console.error(e);

      const code = e?.code || "";
      let msg = e?.message || "Không thể ghi nhận thanh toán.";

      if (code.includes("permission-denied"))
        msg = "Bạn không có quyền ghi nhận thanh toán (chỉ admin).";
      else if (code.includes("unavailable"))
        msg = "Mất kết nối mạng hoặc Firestore đang bận. Thử lại.";
      else if (code.includes("failed-precondition"))
        msg = "Thiếu index hoặc điều kiện truy vấn chưa đúng.";
      else if (code.includes("invalid-argument"))
        msg = "Dữ liệu gửi lên không hợp lệ.";

      showToast({ title: "Thất bại", message: msg, variant: "danger" });
      throw e;
    }
  }

  function renderAllFromLive() {
    renderExpensesList(live.expenses);
    renderPaymentsList(live.payments);
    renderEngineFromData(live.expenses, live.payments);
  }

  // ====== Init
  renderDebtsInputs();

  // month watch
  let selectedPeriod = currentPeriod();
  const periodPicker = $("periodPicker");
  if (periodPicker) periodPicker.value = selectedPeriod;

  function startWatchForPeriod() {
    if (_unsubExpenses) _unsubExpenses();
    if (_unsubPayments) _unsubPayments();

    const groupId = state.groupId;
    const { start, end } = getMonthRange(selectedPeriod);

    _unsubExpenses = watchExpensesByRange(groupId, start, end, (items) => {
      live.expenses = items;
      renderAllFromLive();
    });

    _unsubPayments = watchPaymentsByRange(groupId, start, end, (items) => {
      live.payments = items;
      renderAllFromLive();
    });
  }

  periodPicker?.addEventListener("change", (e) => {
    selectedPeriod = e.target.value || currentPeriod();
    startWatchForPeriod();
  });

  startWatchForPeriod();
}
