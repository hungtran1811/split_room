import { logout } from "../../services/auth.service";
import { state } from "../../core/state";
import { t, formatVND } from "../../config/i18n";
import { ROSTER } from "../../config/roster";
import { EMAIL_TO_MEMBER_ID } from "../../config/members.map";
import {
  getCurrentUserLabel,
  getMemberLabelById,
} from "../../core/display-name";
import { watchExpensesByRange } from "../../services/expense.service";
import { watchPaymentsByRange } from "../../services/payment.service";
import { watchRentByPeriod } from "../../services/rent.service";
import { mountPrimaryNav } from "../layout/navbar";
import { buildGrossMatrix } from "../../engine/grossMatrix";
import { computeNetBalances } from "../../engine/netBalance";
import { settleDebts } from "../../engine/settle";

let unsubscribeExpenses = null;
let unsubscribePayments = null;
let unsubscribeRent = null;

function byId(id) {
  return document.getElementById(id);
}

function currentPeriod() {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}

function clampPercent(value) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, value));
}

function getMonthRange(period) {
  const [year, month] = period.split("-").map(Number);
  const start = `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-01`;
  const next = new Date(year, month - 1, 1);
  next.setMonth(next.getMonth() + 1);
  const endYear = next.getFullYear();
  const endMonth = String(next.getMonth() + 1).padStart(2, "0");
  return {
    start,
    end: `${endYear}-${endMonth}-01`,
  };
}

function getRoster() {
  return ROSTER.map((member) => ({
    id: member.id,
    name: getMemberLabelById(member.id),
  }));
}

function nameOf(memberId) {
  return getMemberLabelById(memberId);
}

function getMyMemberId() {
  return (
    state.memberProfile?.memberId ||
    EMAIL_TO_MEMBER_ID[state.user?.email || ""] ||
    null
  );
}

function applyPaymentsToBalances(balances, payments) {
  const next = { ...balances };

  for (const payment of payments || []) {
    const amount = Number(payment.amount || 0);
    if (!payment.fromId || !payment.toId || amount <= 0) continue;
    next[payment.fromId] = (next[payment.fromId] || 0) + amount;
    next[payment.toId] = (next[payment.toId] || 0) - amount;
  }

  return next;
}

function roundVnd(value) {
  return Math.round(Number(value || 0));
}

function rentSummaryForMember(rentDoc, myId) {
  if (!rentDoc || !myId) return null;

  const payerId = rentDoc.payerId || "hung";
  const shares = rentDoc.shares || {};
  const paid = rentDoc.paid || {};
  const total = Number(rentDoc.total || 0);

  if (myId === payerId) {
    const myShare = Number(shares[payerId] || 0);
    const expectedFromOthers = Math.max(0, total - myShare);
    const collectedFromOthers = Object.entries(paid).reduce(
      (sum, [memberId, value]) =>
        memberId === payerId ? sum : sum + Number(value || 0),
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

function monthStatusCards({ expenses, payments, rent }) {
  const rentStatus = !rent
    ? {
        badge: "bg-secondary",
        text: "Chưa có tiền nhà",
        detail: "Tháng này chưa tạo bản ghi tiền nhà.",
      }
    : {
        badge: "bg-success",
        text: "Đã có tiền nhà",
        detail: `Tổng ${formatVND(rent.total || 0)}`,
      };

  return [
    {
      title: "Chi tiêu",
      badge: expenses.length ? "bg-primary" : "bg-secondary",
      text: expenses.length ? `${expenses.length} khoản` : "Chưa có",
      detail: expenses.length
        ? "Đã có dữ liệu chi tiêu."
        : "Tháng này chưa có khoản chi nào.",
      href: "#/expenses",
      cta: "Mở",
    },
    {
      title: "Thanh toán",
      badge: payments.length ? "bg-info text-dark" : "bg-secondary",
      text: payments.length ? `${payments.length} giao dịch` : "Chưa có",
      detail: payments.length
        ? "Đã ghi nhận thanh toán."
        : "Chưa có giao dịch thanh toán.",
      href: "#/payments",
      cta: "Mở",
    },
    {
      title: "Tiền nhà",
      badge: rentStatus.badge,
      text: rentStatus.text,
      detail: rentStatus.detail,
      href: "#/rent",
      cta: "Mở",
    },
  ];
}

function renderRentCard(rentSummary) {
  if (!rentSummary) {
    return `
      <div class="card mb-3">
        <div class="card-header d-flex justify-content-between align-items-center">
          <b>Tiền nhà tháng này</b>
          <a class="btn btn-outline-secondary btn-sm" href="#/rent">Mở</a>
        </div>
        <div class="card-body">
          <div class="text-secondary">Chưa có bản ghi tiền nhà cho tháng này.</div>
        </div>
      </div>
    `;
  }

  if (rentSummary.mode === "payer") {
    const percent = clampPercent(
      rentSummary.expectedFromOthers <= 0
        ? 100
        : (rentSummary.collectedFromOthers / rentSummary.expectedFromOthers) *
            100,
    );

    return `
      <div class="card mb-3">
        <div class="card-header d-flex justify-content-between align-items-center">
          <b>Tiền nhà tháng này</b>
          <a class="btn btn-outline-secondary btn-sm" href="#/rent">Mở</a>
        </div>
        <div class="card-body">
          <div class="text-secondary small mb-2">Bạn là người trả nhà.</div>
          <div class="row g-3">
            <div class="col-12 col-md-4">
              <div class="text-secondary small">Phần của bạn</div>
              <div class="fw-semibold fs-5">${formatVND(rentSummary.myShare)}</div>
            </div>
            <div class="col-12 col-md-8">
              <div class="d-flex justify-content-between small text-secondary">
                <span>Tiến độ thu tiền</span>
                <span>${Math.round(percent)}%</span>
              </div>
              <div class="progress" style="height: 10px;">
                <div class="progress-bar ${
                  rentSummary.remainToCollect <= 0 ? "bg-success" : "bg-warning"
                }" style="width:${percent}%"></div>
              </div>
              <div class="row mt-3 text-center">
                <div class="col">
                  <div class="text-secondary small">Cần thu</div>
                  <div class="fw-semibold">${formatVND(rentSummary.expectedFromOthers)}</div>
                </div>
                <div class="col">
                  <div class="text-secondary small">Đã thu</div>
                  <div class="fw-semibold text-success">${formatVND(rentSummary.collectedFromOthers)}</div>
                </div>
                <div class="col">
                  <div class="text-secondary small">Còn thiếu</div>
                  <div class="fw-semibold ${
                    rentSummary.remainToCollect <= 0
                      ? "text-success"
                      : "text-danger"
                  }">
                    ${formatVND(rentSummary.remainToCollect)}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  const percent = clampPercent(
    rentSummary.mustPay <= 0
      ? 100
      : (rentSummary.alreadyPaid / rentSummary.mustPay) * 100,
  );

  return `
    <div class="card mb-3">
      <div class="card-header d-flex justify-content-between align-items-center">
        <b>Tiền nhà tháng này</b>
        <a class="btn btn-outline-secondary btn-sm" href="#/rent">Mở</a>
      </div>
      <div class="card-body">
        <div class="d-flex justify-content-between small text-secondary">
          <span>Tiến độ đóng tiền</span>
          <span>${Math.round(percent)}%</span>
        </div>
        <div class="progress" style="height: 10px;">
          <div class="progress-bar ${
            rentSummary.remain <= 0 ? "bg-success" : "bg-danger"
          }" style="width:${percent}%"></div>
        </div>
        <div class="row mt-3 text-center">
          <div class="col">
            <div class="text-secondary small">Bạn cần trả</div>
            <div class="fw-semibold">${formatVND(rentSummary.mustPay)}</div>
          </div>
          <div class="col">
            <div class="text-secondary small">Đã chuyển</div>
            <div class="fw-semibold text-success">${formatVND(rentSummary.alreadyPaid)}</div>
          </div>
          <div class="col">
            <div class="text-secondary small">Còn thiếu</div>
            <div class="fw-semibold ${
              rentSummary.remain <= 0 ? "text-success" : "text-danger"
            }">
              ${formatVND(rentSummary.remain)}
            </div>
          </div>
        </div>
      </div>
    </div>
  `;
}

function renderTransactionList(list, emptyText) {
  if (!list.length) {
    return `<div class="text-secondary small">${emptyText}</div>`;
  }

  return `
    <ul class="list-group list-group-flush">
      ${list
        .slice(0, 5)
        .map(
          (item) => `
        <li class="list-group-item d-flex justify-content-between align-items-center">
          <div class="small">
            <div class="fw-semibold">${nameOf(item.fromId)} -> ${nameOf(item.toId)}</div>
            <div class="text-secondary">${formatVND(item.amount)}</div>
          </div>
          <button class="btn btn-outline-secondary btn-sm" data-copy="${item.fromId}|${item.toId}|${item.amount}">
            Copy
          </button>
        </li>
      `,
        )
        .join("")}
    </ul>
  `;
}

function renderSettleList(list) {
  if (!list.length) {
    return `<li class="list-group-item text-secondary">Không có khoản nợ nào.</li>`;
  }

  return list
    .map(
      (item) => `
    <li class="list-group-item d-flex justify-content-between align-items-center">
      <div>
        <div>${nameOf(item.fromId)} -> <b>${nameOf(item.toId)}</b></div>
        <div class="small text-secondary">${formatVND(item.amount)}</div>
      </div>
      <button class="btn btn-outline-secondary btn-sm" data-copy="${item.fromId}|${item.toId}|${item.amount}">
        Copy
      </button>
    </li>
  `,
    )
    .join("");
}

export function renderDashboardPage() {
  const app = document.querySelector("#app");
  const roster = getRoster();
  const memberIds = roster.map((member) => member.id);
  const myId = getMyMemberId();
  const currentUserLabel = getCurrentUserLabel(state);

  if (unsubscribeExpenses) unsubscribeExpenses();
  if (unsubscribePayments) unsubscribePayments();
  if (unsubscribeRent) unsubscribeRent();
  unsubscribeExpenses = null;
  unsubscribePayments = null;
  unsubscribeRent = null;

  let period = currentPeriod();
  let liveExpenses = [];
  let livePayments = [];
  let liveRent = null;
  let expensesReady = false;
  let paymentsReady = false;
  let onlyMine = true;
  let personFilter = "all";

  function renderLoading() {
    app.innerHTML = `
      <div class="app-shell" data-page="dashboard">
        <div class="app-shell__container">
          <div class="app-shell__header">
            <div class="app-shell__title-block">
              <h1 class="app-shell__title">${t("dashboard")}</h1>
              <div class="app-shell__meta">${t("loggedInAs")}: ${currentUserLabel}</div>
              <div class="app-shell__meta">${t("group")}: ${state.groupId}</div>
            </div>
            <div id="primaryNavHost" class="app-shell__nav-host"></div>
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
            <div class="text-secondary small">Sẽ tự động cập nhật khi dữ liệu thay đổi.</div>
          </div>
        </div>
        </div>
      </div>
    `;

    mountPrimaryNav({
      active: "dashboard",
      isOwner: state.isOwner,
      includeLogout: true,
      onLogout: async () => logout(),
    });
    byId("periodPicker").onchange = (event) => {
      period = event.target.value || currentPeriod();
      expensesReady = false;
      paymentsReady = false;
      startWatch();
      renderLoading();
    };
  }

  function recomputeAndRender() {
    if (!expensesReady || !paymentsReady) {
      renderLoading();
      return;
    }

    const gross = buildGrossMatrix(memberIds, liveExpenses);
    let balances = computeNetBalances(memberIds, gross);
    balances = applyPaymentsToBalances(balances, livePayments);

    for (const memberId of Object.keys(balances)) {
      balances[memberId] = roundVnd(balances[memberId]);
    }

    const settle = settleDebts(balances).map((item) => ({
      fromId: item.fromId || item.from || item.debtorId,
      toId: item.toId || item.to || item.creditorId,
      amount: Number(item.amount || item.amt || 0),
    }));

    const filtered = settle.filter((item) => {
      if (myId && onlyMine && item.fromId !== myId && item.toId !== myId) {
        return false;
      }
      if (
        personFilter !== "all" &&
        item.fromId !== personFilter &&
        item.toId !== personFilter
      ) {
        return false;
      }
      return true;
    });

    const myPayList = myId
      ? settle.filter((item) => item.fromId === myId)
      : [];
    const myReceiveList = myId
      ? settle.filter((item) => item.toId === myId)
      : [];
    const myPayTotal = myPayList.reduce(
      (sum, item) => sum + Number(item.amount || 0),
      0,
    );
    const myReceiveTotal = myReceiveList.reduce(
      (sum, item) => sum + Number(item.amount || 0),
      0,
    );
    const rentSummary = rentSummaryForMember(liveRent, myId);
    const statusCards = monthStatusCards({
      expenses: liveExpenses,
      payments: livePayments,
      rent: liveRent,
    });

    app.innerHTML = `
      <div class="app-shell" data-page="dashboard">
        <div class="app-shell__container">
          <div class="app-shell__header">
            <div class="app-shell__title-block">
              <h1 class="app-shell__title">${t("dashboard")}</h1>
              <div class="app-shell__meta">${t("loggedInAs")}: ${currentUserLabel}</div>
              <div class="app-shell__meta">${t("group")}: ${state.groupId}</div>
            </div>
            <div id="primaryNavHost" class="app-shell__nav-host"></div>
          </div>

        <div class="row g-2 align-items-end mb-3">
          <div class="col-6 col-md-4">
            <label class="form-label small mb-1">Chọn tháng</label>
            <input id="periodPicker" type="month" class="form-control" value="${period}" />
          </div>
          <div class="col-6 col-md-4">
            <label class="form-label small mb-1">Lọc nhanh</label>
            <div class="form-check mt-2">
              <input class="form-check-input" type="checkbox" id="onlyMine" ${
                onlyMine ? "checked" : ""
              } ${myId ? "" : "disabled"}>
              <label class="form-check-label" for="onlyMine">Chỉ liên quan tới tôi</label>
            </div>
            ${
              !myId
                ? `<div class="small text-warning">Chưa xác định được memberId của tài khoản này.</div>`
                : ""
            }
          </div>
          <div class="col-12 col-md-4">
            <label class="form-label small mb-1">Lọc theo người</label>
            <select id="personFilter" class="form-select">
              <option value="all" ${
                personFilter === "all" ? "selected" : ""
              }>Tất cả</option>
              ${roster
                .map(
                  (member) => `
                <option value="${member.id}" ${
                  personFilter === member.id ? "selected" : ""
                }>${member.name}</option>
              `,
                )
                .join("")}
            </select>
          </div>
        </div>

        <div class="row g-2 mb-3">
          ${statusCards
            .map(
              (item) => `
            <div class="col-12 col-md-4">
              <div class="card h-100">
                <div class="card-body">
                  <div class="d-flex justify-content-between align-items-start mb-2">
                    <div class="fw-semibold">${item.title}</div>
                    <span class="badge ${item.badge}">${item.text}</span>
                  </div>
                  <div class="text-secondary small mb-3">${item.detail}</div>
                  <a class="btn btn-outline-secondary btn-sm" href="${item.href}">${item.cta}</a>
                </div>
              </div>
            </div>
          `,
            )
            .join("")}
        </div>

        ${renderRentCard(rentSummary)}

        <div class="row g-2 mb-3">
          <div class="col-12 col-md-6">
            <div class="card h-100">
              <div class="card-header d-flex justify-content-between">
                <b>Bạn cần trả</b>
                <span class="fw-semibold">${formatVND(myPayTotal)}</span>
              </div>
              <div class="card-body p-0">
                ${renderTransactionList(
                  myPayList,
                  "Không có khoản cần trả.",
                )}
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
                ${renderTransactionList(
                  myReceiveList,
                  "Không có khoản cần nhận.",
                )}
              </div>
            </div>
          </div>
        </div>

        <div class="card">
          <div class="card-header d-flex justify-content-between align-items-center">
            <b>Kết quả cân trừ (ai trả ai)</b>
            <span class="small text-secondary">${filtered.length} dòng</span>
          </div>
          <ul class="list-group list-group-flush">
            ${renderSettleList(filtered)}
          </ul>
        </div>
        </div>
      </div>
    `;

    mountPrimaryNav({
      active: "dashboard",
      isOwner: state.isOwner,
      includeLogout: true,
      onLogout: async () => logout(),
    });
    byId("periodPicker").onchange = (event) => {
      period = event.target.value || currentPeriod();
      expensesReady = false;
      paymentsReady = false;
      startWatch();
      renderLoading();
    };
    byId("onlyMine")?.addEventListener("change", (event) => {
      onlyMine = !!event.target.checked;
      recomputeAndRender();
    });
    byId("personFilter")?.addEventListener("change", (event) => {
      personFilter = event.target.value || "all";
      recomputeAndRender();
    });

    app.querySelectorAll("[data-copy]").forEach((button) => {
      button.addEventListener("click", async () => {
        const [fromId, toId, amountString] = button
          .getAttribute("data-copy")
          .split("|");
        const amount = Number(amountString || 0);
        const text = `${nameOf(fromId)} chuyển ${formatVND(amount)} cho ${nameOf(toId)} (tháng ${period})`;

        try {
          await navigator.clipboard.writeText(text);
          const oldText = button.textContent;
          button.textContent = "Đã copy";
          setTimeout(() => {
            button.textContent = oldText;
          }, 900);
        } catch {
          window.prompt("Copy nội dung này:", text);
        }
      });
    });
  }

  function startWatch() {
    if (unsubscribeExpenses) unsubscribeExpenses();
    if (unsubscribePayments) unsubscribePayments();
    if (unsubscribeRent) unsubscribeRent();

    const { start, end } = getMonthRange(period);
    const groupId = state.groupId;

    unsubscribeExpenses = watchExpensesByRange(groupId, start, end, (items) => {
      if (!document.body.contains(app)) return;
      liveExpenses = items;
      expensesReady = true;
      recomputeAndRender();
    });

    unsubscribePayments = watchPaymentsByRange(groupId, start, end, (items) => {
      if (!document.body.contains(app)) return;
      livePayments = items;
      paymentsReady = true;
      recomputeAndRender();
    });

    unsubscribeRent = watchRentByPeriod(groupId, period, (doc) => {
      if (!document.body.contains(app)) return;
      liveRent = doc;
      recomputeAndRender();
    });
  }

  const onHashChange = () => {
    if (!location.hash.startsWith("#/dashboard")) {
      if (unsubscribeExpenses) unsubscribeExpenses();
      if (unsubscribePayments) unsubscribePayments();
      if (unsubscribeRent) unsubscribeRent();
      unsubscribeExpenses = null;
      unsubscribePayments = null;
      unsubscribeRent = null;
      window.removeEventListener("hashchange", onHashChange);
    }
  };

  window.addEventListener("hashchange", onHashChange);
  startWatch();
  renderLoading();
}

