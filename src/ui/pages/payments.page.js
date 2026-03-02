import { logout } from "../../services/auth.service";
import { state } from "../../core/state";
import { ROSTER, nameOf } from "../../config/roster";
import { getCurrentUserLabel, getUserLabel } from "../../core/display-name";
import { formatVND } from "../../config/i18n";
import { parseVndInput } from "../../core/money";
import { mapFirestoreError } from "../../core/errors";
import { buildMonthlySettlementView } from "../../domain/matrix/compute";
import {
  watchMonthExpenses,
  watchMonthPayments,
} from "../../services/month-ops.service";
import {
  addPayment,
  removePayment,
  updatePayment,
} from "../../services/payment.service";
import { openConfirmModal } from "../components/confirmModal";
import { renderMatrixTable } from "../components/matrixTable";
import { openPaymentModal } from "../components/paymentModal";
import { showToast } from "../components/toast";
import { mountPrimaryNav } from "../layout/navbar";

function byId(id) {
  return document.getElementById(id);
}

function currentPeriod() {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}

function periodToYmd(period) {
  return `${period}-01`;
}

function creatorLabel(uid) {
  if (!uid) return "-";

  const member = (state.members || []).find(
    (item) => item.uid === uid || item.id === uid,
  );
  if (member) return getUserLabel(member);
  if (state.user?.uid === uid) return getCurrentUserLabel(state);

  return uid;
}

function sortPayments(payments) {
  return [...payments].sort((left, right) => {
    const dateDiff = String(right.date || "").localeCompare(
      String(left.date || ""),
    );
    if (dateDiff !== 0) return dateDiff;

    return String(right.id || "").localeCompare(String(left.id || ""));
  });
}

function renderBalancesList(balances) {
  return `
    <ul class="list-group list-group-flush">
      ${Object.entries(balances)
        .map(([memberId, balance]) => {
          const absolute = Math.abs(Number(balance || 0));
          const label =
            balance > 0
              ? "Được nhận"
              : balance < 0
                ? "Phải trả"
                : "Cân bằng";

          return `
            <li class="list-group-item d-flex justify-content-between align-items-center">
              <span>${nameOf(memberId)}</span>
              <span class="fw-semibold">${label}: ${formatVND(absolute)}</span>
            </li>
          `;
        })
        .join("")}
    </ul>
  `;
}

function renderSettlementList(items, canOperateMonth) {
  if (!items.length) {
    return `
      <div class="text-secondary small">
        Không còn khoản nợ nào cần thanh toán theo cấn trừ trong tháng này.
      </div>
    `;
  }

  return `
    <div class="list-group list-group-flush">
      ${items
        .map(
          (item) => `
            <div class="list-group-item d-flex justify-content-between align-items-center gap-3">
              <div>
                <div class="fw-semibold">${nameOf(item.fromId)} → ${nameOf(item.toId)}</div>
                <div class="small text-secondary">Còn nợ ${formatVND(item.amount)}</div>
              </div>
              ${
                canOperateMonth
                  ? `
                    <div class="d-flex gap-2">
                      <button class="btn btn-outline-success btn-sm" data-pay-full="${item.fromId}|${item.toId}|${item.amount}">
                        Trả đủ
                      </button>
                      <button class="btn btn-outline-primary btn-sm" data-pay-part="${item.fromId}|${item.toId}|${item.amount}">
                        Trả một phần
                      </button>
                    </div>
                  `
                  : '<div class="small text-secondary">Chỉ người vận hành tháng mới ghi nhận được thanh toán.</div>'
              }
            </div>
          `,
        )
        .join("")}
    </div>
  `;
}

function renderEditCard(payment, saving, errorMessage) {
  if (!payment) return "";

  return `
    <div class="card mb-3">
      <div class="card-header">Sửa thanh toán đã ghi nhận</div>
      <div class="card-body">
        <div class="row g-3">
          <div class="col-12 col-md-4">
            <label class="form-label">Ngày</label>
            <input id="editPaymentDate" type="date" class="form-control" value="${payment.date || ""}" />
          </div>
          <div class="col-12 col-md-8">
            <label class="form-label">Ghi chú</label>
            <input
              id="editPaymentNote"
              class="form-control"
              value="${payment.note || ""}"
              placeholder="VD: Trả một phần theo cấn trừ"
            />
          </div>
          <div class="col-12">
            <div class="small text-secondary">
              Bản ghi này chỉ cho sửa ngày và ghi chú.
              Nếu số tiền sai, hãy xóa rồi ghi nhận lại từ dòng cấn trừ tương ứng.
            </div>
          </div>
          <div class="col-12 d-flex gap-2 align-items-center">
            <button id="btnSavePaymentEdit" class="btn btn-primary" ${saving ? "disabled" : ""}>
              ${saving ? "Đang lưu..." : "Cập nhật thanh toán"}
            </button>
            <button id="btnCancelPaymentEdit" class="btn btn-outline-secondary" ${saving ? "disabled" : ""}>
              Hủy
            </button>
            <div id="paymentsMsg" class="small text-danger">${errorMessage || ""}</div>
          </div>
        </div>
      </div>
    </div>
  `;
}

function renderPaymentsHistory(payments, canOperate) {
  if (!payments.length) {
    return '<div class="text-secondary">Chưa có thanh toán nào trong tháng này.</div>';
  }

  return `
    <div class="list-group">
      ${sortPayments(payments)
        .map(
          (payment) => `
            <div class="list-group-item">
              <div class="d-flex justify-content-between align-items-start gap-3">
                <div>
                  <div class="fw-semibold">
                    ${payment.date} • ${nameOf(payment.fromId)} → ${nameOf(payment.toId)} • ${formatVND(payment.amount)}
                  </div>
                  <div class="text-secondary small">${payment.note || "Không có ghi chú"}</div>
                  <div class="text-secondary small">Người tạo: <b>${creatorLabel(payment.createdBy)}</b></div>
                </div>
                ${
                  canOperate
                    ? `
                      <div class="d-flex gap-2">
                        <button class="btn btn-outline-secondary btn-sm" data-edit-payment="${payment.id}">
                          Sửa
                        </button>
                        <button class="btn btn-outline-danger btn-sm" data-delete-payment="${payment.id}">
                          Xóa
                        </button>
                      </div>
                    `
                    : ""
                }
              </div>
            </div>
          `,
        )
        .join("")}
    </div>
  `;
}

export async function renderPaymentsPage(options = {}) {
  if (!state.user || !state.groupId) return;

  const app = document.querySelector("#app");
  const canOperate = state.canOperateMonth;
  const groupId = state.groupId;
  const openVerification = options.openVerification === true;
  const aliasMode = options.aliasMode === true;
  const payLocks = new Set();

  let selectedPeriod = currentPeriod();
  let liveExpenses = [];
  let livePayments = [];
  let expensesReady = false;
  let paymentsReady = false;
  let editingPaymentId = null;
  let savingEdit = false;
  let editError = "";
  let unsubscribeExpenses = null;
  let unsubscribePayments = null;

  function activeEditingPayment() {
    return livePayments.find((item) => item.id === editingPaymentId) || null;
  }

  function paymentSummary(settlement) {
    return {
      expenseCount: liveExpenses.length,
      paymentCount: livePayments.length,
      settlementCount: settlement.settlementPlan.length,
      paymentTotal: livePayments.reduce(
        (sum, payment) => sum + Number(payment.amount || 0),
        0,
      ),
    };
  }

  function render() {
    const ready = expensesReady && paymentsReady;
    const settlement = buildMonthlySettlementView({
      roster: ROSTER,
      expenses: liveExpenses,
      payments: livePayments,
    });
    const summary = paymentSummary(settlement);
    const editingPayment = activeEditingPayment();

    if (editingPaymentId && !editingPayment) {
      editingPaymentId = null;
      editError = "";
    }

    app.innerHTML = `
      <div class="app-shell" data-page="payments">
        <div class="app-shell__container">
          <div class="app-shell__header">
            <div class="app-shell__title-block">
              <h1 class="app-shell__title">Thanh toán</h1>
              <div class="app-shell__meta">Đăng nhập: ${getCurrentUserLabel(state)}</div>
              <div class="app-shell__meta">Nhóm: <b>${groupId}</b></div>
            </div>
            <div id="primaryNavHost" class="app-shell__nav-host"></div>
          </div>

        ${
          aliasMode
            ? `
              <div class="alert alert-info mb-3">
                Phần Cấn trừ đã được gộp vào Thanh toán. Đây là chế độ xem tương thích từ liên kết cũ <code>#/matrix</code>.
              </div>
            `
            : ""
        }

        <div class="row g-2 align-items-end mb-3">
          <div class="col-6 col-md-4">
            <label class="form-label small mb-1">Chọn tháng</label>
            <input id="paymentsPeriod" type="month" class="form-control" value="${selectedPeriod}" />
          </div>
        </div>

        ${
          ready
            ? `
              <div class="row g-2 mb-3">
                <div class="col-6 col-lg-3">
                  <div class="card h-100">
                    <div class="card-body">
                      <div class="text-secondary small">Khoản chi</div>
                      <div class="fw-semibold fs-5">${summary.expenseCount}</div>
                    </div>
                  </div>
                </div>
                <div class="col-6 col-lg-3">
                  <div class="card h-100">
                    <div class="card-body">
                      <div class="text-secondary small">Thanh toán</div>
                      <div class="fw-semibold fs-5">${summary.paymentCount}</div>
                    </div>
                  </div>
                </div>
                <div class="col-6 col-lg-3">
                  <div class="card h-100">
                    <div class="card-body">
                      <div class="text-secondary small">Dòng cấn trừ còn lại</div>
                      <div class="fw-semibold fs-5">${summary.settlementCount}</div>
                    </div>
                  </div>
                </div>
                <div class="col-6 col-lg-3">
                  <div class="card h-100">
                    <div class="card-body">
                      <div class="text-secondary small">Tổng payment tháng</div>
                      <div class="fw-semibold fs-5">${formatVND(summary.paymentTotal)}</div>
                    </div>
                  </div>
                </div>
              </div>

              ${canOperate ? renderEditCard(editingPayment, savingEdit, editError) : ""}

              <div class="card mb-3">
                <div class="card-header">Các khoản cần thanh toán theo cấn trừ</div>
                <div class="card-body">
                  <div class="small text-secondary mb-3">
                    Thanh toán mới chỉ được ghi nhận từ các dòng cấn trừ hiện tại. Trả một phần không được vượt quá số còn nợ.
                  </div>
                  ${renderSettlementList(settlement.settlementPlan, canOperate)}
                </div>
              </div>

              <div class="card mb-3">
                <div class="card-header">Lịch sử thanh toán trong tháng</div>
                <div class="card-body">
                  ${renderPaymentsHistory(livePayments, canOperate)}
                </div>
              </div>

              <details class="card" id="paymentsVerification" ${openVerification ? "open" : ""}>
                <summary class="card-header small text-secondary">
                  Xem ma trận đối chiếu
                </summary>
                <div class="card-body">
                  <div class="card mb-3">
                    <div class="card-header">1) Ma trận nợ gốc</div>
                    <div class="card-body">
                      ${renderMatrixTable({
                        members: ROSTER,
                        matrix: settlement.grossMatrix,
                        title: "Ma trận nợ gốc (từ chi tiêu)",
                      })}
                    </div>
                  </div>

                  <div class="card mb-3">
                    <div class="card-header">2) Số dư sau khi áp payment</div>
                    <div class="card-body">
                      ${renderBalancesList(settlement.balances)}
                    </div>
                  </div>

                  <div class="card">
                    <div class="card-header">3) Ma trận sau cấn trừ</div>
                    <div class="card-body">
                      ${renderMatrixTable({
                        members: ROSTER,
                        matrix: settlement.settleMatrix,
                        title: "Ma trận sau cấn trừ",
                      })}
                    </div>
                  </div>
                </div>
              </details>
            `
            : `
              <div class="d-flex align-items-center gap-3 py-4">
                <div class="spinner-border" role="status" aria-label="Loading"></div>
                <div>
                  <div class="fw-semibold">Đang tải dữ liệu thanh toán tháng ${selectedPeriod}...</div>
                  <div class="text-secondary small">Vui lòng chờ trong giây lát</div>
                </div>
              </div>
            `
        }
        </div>
      </div>
    `;

    mountPrimaryNav({
      active: "payments",
      isOwner: state.isOwner,
      includeLogout: true,
      onLogout: async () => {
        await logout();
      },
    });

    byId("paymentsPeriod")?.addEventListener("change", (event) => {
      selectedPeriod = event.target.value || currentPeriod();
      editingPaymentId = null;
      editError = "";
      startWatch();
      render();
    });

    if (!ready) return;

    bindSettlementButtons(settlement.settlementPlan);
    bindHistoryActions();
    bindEditActions(editingPayment);
  }

  function bindEditActions(editingPayment) {
    if (!canOperate || !editingPayment) return;

    byId("btnSavePaymentEdit")?.addEventListener("click", async () => {
      if (savingEdit) return;

      const date = byId("editPaymentDate")?.value || editingPayment.date || "";
      const note = byId("editPaymentNote")?.value?.trim() || "";
      if (!date) {
        editError = "Ngày thanh toán không được để trống.";
        render();
        return;
      }

      savingEdit = true;
      editError = "";
      render();

      try {
        await updatePayment(groupId, editingPayment.id, {
          date,
          note,
        });
        savingEdit = false;
        editingPaymentId = null;
        showToast({
          title: "Thành công",
          message: "Đã cập nhật ngày và ghi chú thanh toán.",
          variant: "success",
        });
      } catch (error) {
        savingEdit = false;
        editError = mapFirestoreError(error, "Không thể cập nhật thanh toán.");
      } finally {
        render();
      }
    });

    byId("btnCancelPaymentEdit")?.addEventListener("click", () => {
      editingPaymentId = null;
      editError = "";
      render();
    });
  }

  function bindHistoryActions() {
    if (!canOperate) return;

    app.querySelectorAll("[data-edit-payment]").forEach((button) => {
      button.addEventListener("click", () => {
        editingPaymentId = button.getAttribute("data-edit-payment");
        editError = "";
        render();
        window.scrollTo({ top: 0, behavior: "smooth" });
      });
    });

    app.querySelectorAll("[data-delete-payment]").forEach((button) => {
      button.addEventListener("click", () => {
        const payment = livePayments.find(
          (item) => item.id === button.getAttribute("data-delete-payment"),
        );
        if (!payment) return;

        openConfirmModal({
          title: "Xóa thanh toán",
          message: "Bạn chắc chắn muốn xóa thanh toán này?",
          meta: `${payment.date} • ${nameOf(payment.fromId)} → ${nameOf(payment.toId)} • ${formatVND(payment.amount)}`,
          okText: "Xóa",
          danger: true,
          onConfirm: async () => {
            try {
              await removePayment(groupId, payment.id);
              if (editingPaymentId === payment.id) {
                editingPaymentId = null;
                editError = "";
              }
              showToast({
                title: "Thành công",
                message: "Đã xóa thanh toán.",
                variant: "success",
              });
            } catch (error) {
              showToast({
                title: "Thất bại",
                message: mapFirestoreError(
                  error,
                  "Không thể xóa thanh toán.",
                ),
                variant: "danger",
              });
              throw error;
            }
          },
        });
      });
    });
  }

  function bindSettlementButtons(settlementPlan) {
    if (!canOperate || !settlementPlan.length) return;

    const withLock = async (key, action) => {
      if (payLocks.has(key)) return;
      payLocks.add(key);

      try {
        await action();
      } finally {
        payLocks.delete(key);
      }
    };

    async function createPaymentFromSettlement(fromId, toId, amount, note) {
      try {
        await addPayment(groupId, {
          date: periodToYmd(selectedPeriod),
          fromId,
          toId,
          amount,
          note,
          createdBy: state.user.uid,
        });
        showToast({
          title: "Thành công",
          message: "Đã ghi nhận thanh toán.",
          variant: "success",
        });
      } catch (error) {
        showToast({
          title: "Thất bại",
          message: mapFirestoreError(
            error,
            "Không thể ghi nhận thanh toán.",
          ),
          variant: "danger",
        });
        throw error;
      }
    }

    app.querySelectorAll("[data-pay-full]").forEach((button) => {
      button.addEventListener("click", async () => {
        const [fromId, toId, amountString] =
          button.getAttribute("data-pay-full").split("|");
        const amount = Number(amountString || 0);
        const lockKey = `${fromId}_${toId}_full`;

        await withLock(lockKey, async () => {
          openPaymentModal({
            title: "Trả đủ theo cấn trừ",
            fromName: nameOf(fromId),
            toName: nameOf(toId),
            amount,
            maxAmount: amount,
            lockAmount: true,
            defaultNote: "Trả đủ theo cấn trừ",
            parseVndInput,
            onSubmit: async ({ amount: nextAmount, note }) => {
              await createPaymentFromSettlement(
                fromId,
                toId,
                nextAmount,
                note || "Trả đủ theo cấn trừ",
              );
            },
          });
        });
      });
    });

    app.querySelectorAll("[data-pay-part]").forEach((button) => {
      button.addEventListener("click", async () => {
        const [fromId, toId, amountString] =
          button.getAttribute("data-pay-part").split("|");
        const maxAmount = Number(amountString || 0);
        const lockKey = `${fromId}_${toId}_part`;

        await withLock(lockKey, async () => {
          openPaymentModal({
            title: "Trả một phần theo cấn trừ",
            fromName: nameOf(fromId),
            toName: nameOf(toId),
            amount: maxAmount,
            maxAmount,
            lockAmount: false,
            defaultNote: "Trả một phần theo cấn trừ",
            parseVndInput,
            onSubmit: async ({ amount, note }) => {
              await createPaymentFromSettlement(
                fromId,
                toId,
                amount,
                note || "Trả một phần theo cấn trừ",
              );
            },
          });
        });
      });
    });
  }

  function startWatch() {
    expensesReady = false;
    paymentsReady = false;
    unsubscribeExpenses?.();
    unsubscribePayments?.();

    unsubscribeExpenses = watchMonthExpenses(groupId, selectedPeriod, (items) => {
      liveExpenses = items;
      expensesReady = true;
      render();
    });

    unsubscribePayments = watchMonthPayments(groupId, selectedPeriod, (items) => {
      livePayments = items;
      paymentsReady = true;
      render();
    });
  }

  render();
  startWatch();

  const onHashChange = () => {
    const isPaymentsRoute = location.hash.startsWith("#/payments");
    const isMatrixRoute = aliasMode && location.hash.startsWith("#/matrix");
    if (!isPaymentsRoute && !isMatrixRoute) {
      unsubscribeExpenses?.();
      unsubscribePayments?.();
      window.removeEventListener("hashchange", onHashChange);
    }
  };

  window.addEventListener("hashchange", onHashChange);
}
