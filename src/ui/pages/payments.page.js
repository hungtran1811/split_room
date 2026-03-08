import { logout } from "../../services/auth.service";
import { getSelectedPeriod, state } from "../../core/state";
import { ROSTER, nameOf } from "../../config/roster";
import { getCurrentUserLabel, getUserLabel } from "../../core/display-name";
import { formatVND } from "../../config/i18n";
import { parseVndInput } from "../../core/money";
import { mapFirestoreError } from "../../core/errors";
import { buildMonthlySettlementView } from "../../domain/matrix/compute";
import { watchExpenses } from "../../services/expense.service";
import {
  watchMonthExpenses,
  watchMonthPayments,
} from "../../services/month-ops.service";
import {
  addPayment,
  removePayment,
  updatePayment,
  watchPayments,
} from "../../services/payment.service";
import { openConfirmModal } from "../components/confirmModal";
import { openPaymentEditModal } from "../components/paymentEditModal";
import { renderMatrixTable } from "../components/matrixTable";
import { openPaymentModal } from "../components/paymentModal";
import { showToast } from "../components/toast";
import { renderMonthField } from "../components/filterBar";
import { renderAppShell } from "../layout/app-shell";
import { mountPrimaryNav } from "../layout/navbar";
import { renderMoneyStatCard } from "../components/moneyStatCard";
import { renderSectionHeader } from "../components/sectionHeader";

function todayYmd() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
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

function formatPeriodLabel(period) {
  const [year, month] = String(period || "").split("-");
  if (!year || !month) return period || "-";
  return `Tháng ${Number(month)} năm ${year}`;
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

function renderSummaryCards(summary) {
  return `
    <section class="money-grid money-grid--4">
      ${renderMoneyStatCard({
        label: "Khoản chi",
        value: `${summary.expenseCount}`,
        hint: "Toàn bộ khoản chi đã ghi nhận",
        tone: "neutral",
      })}
      ${renderMoneyStatCard({
        label: "Thanh toán",
        value: `${summary.paymentCount}`,
        hint: "Toàn bộ payment đã ghi nhận",
        tone: summary.paymentCount ? "positive" : "neutral",
      })}
      ${renderMoneyStatCard({
        label: "Còn cấn trừ",
        value: `${summary.settlementCount}`,
        hint: summary.settlementCount ? "Dòng còn nợ hiện tại" : "Đã cân bằng",
        tone: summary.settlementCount ? "danger" : "positive",
      })}
      ${renderMoneyStatCard({
        label: "Tổng đã thanh toán",
        value: formatVND(summary.paymentTotal),
        hint: "Toàn bộ lịch sử thanh toán",
        tone: summary.paymentTotal ? "warning" : "neutral",
      })}
    </section>
  `;
}

function renderBalancesList(balances) {
  const items = Object.entries(balances || {});
  if (!items.length) {
    return `
      <div class="empty-state">
        <div class="empty-state__title">Chưa có số dư</div>
        <div class="empty-state__text">
          Tháng này chưa phát sinh chi tiêu hoặc thanh toán.
        </div>
      </div>
    `;
  }

  return `
    <div class="stack-list">
      ${items
        .map(([memberId, balance]) => {
          const absolute = Math.abs(Number(balance || 0));
          const label =
            balance > 0
              ? "Được nhận"
              : balance < 0
                ? "Phải trả"
                : "Cân bằng";

          return `
            <div class="action-list__item">
              <div class="action-list__head">
                <div>
                  <div class="action-list__title">${nameOf(memberId)}</div>
                  <div class="action-list__meta">${label}</div>
                </div>
                <div class="fw-semibold">${formatVND(absolute)}</div>
              </div>
            </div>
          `;
        })
        .join("")}
    </div>
  `;
}

function renderSettlementList(items, canOperateMonth) {
  if (!items.length) {
    return `
      <div class="empty-state">
        <div class="empty-state__title">Không còn khoản nào cần thanh toán</div>
        <div class="empty-state__text">
          Nếu tính trên toàn bộ dữ liệu hiện có, các khoản nợ đã được cân bằng.
        </div>
      </div>
    `;
  }

  return `
    <div class="stack-list">
      ${items
        .map(
          (item) => `
            <article class="money-card money-card--danger money-card--lg">
              <div class="action-list__head">
                <div>
                  <div class="money-card__label">Cần thanh toán theo cấn trừ</div>
                  <div class="action-list__title">${nameOf(item.fromId)} -> ${nameOf(item.toId)}</div>
                </div>
                <div class="money-card__value">${formatVND(item.amount)}</div>
              </div>
              ${
                canOperateMonth
                  ? `
                    <div class="d-flex flex-wrap gap-2 mt-3">
                      <button class="btn ui-action-pill ui-action-pill--primary section-cta" data-pay-full="${item.fromId}|${item.toId}|${item.amount}">
                        Trả đủ
                      </button>
                      <button class="btn ui-action-pill ui-action-pill--secondary section-cta" data-pay-part="${item.fromId}|${item.toId}|${item.amount}">
                        Trả một phần
                      </button>
                    </div>
                  `
                  : `
                    <div class="money-card__hint mt-2">
                      Chỉ người vận hành tháng mới ghi nhận được thanh toán từ dòng cấn trừ.
                    </div>
                  `
              }
            </article>
          `,
        )
        .join("")}
    </div>
  `;
}

function renderPaymentsHistory(payments, canOperate) {
  if (!payments.length) {
    return `
      <div class="empty-state">
        <div class="empty-state__title">Chưa có thanh toán nào</div>
        <div class="empty-state__text">
          Lịch sử thanh toán toàn bộ sẽ xuất hiện ở đây.
        </div>
      </div>
    `;
  }

  return `
    <div class="stack-list">
      ${sortPayments(payments)
        .map(
          (payment) => `
            <article class="action-list__item">
              <div class="action-list__head">
                <div>
                  <div class="action-list__title">${payment.date} • ${nameOf(payment.fromId)} -> ${nameOf(payment.toId)}</div>
                  <div class="action-list__meta">${formatVND(payment.amount)}</div>
                  <div class="action-list__meta">${payment.note || "Không có ghi chú"}</div>
                  <div class="action-list__meta">Người tạo: ${creatorLabel(payment.createdBy)}</div>
                </div>
                ${
                  canOperate
                    ? `
                      <div class="d-flex flex-wrap gap-2">
                        <button class="btn ui-action-pill ui-action-pill--secondary section-cta" data-edit-payment="${payment.id}">
                          Sửa ngày / ghi chú
                        </button>
                        <button class="btn ui-action-pill ui-action-pill--danger section-cta" data-delete-payment="${payment.id}">
                          Xóa
                        </button>
                      </div>
                    `
                    : ""
                }
              </div>
            </article>
          `,
        )
        .join("")}
    </div>
  `;
}

function renderLoading() {
  return `
    <div class="card">
      <div class="card-body d-flex align-items-center gap-3">
        <div class="spinner-border" role="status" aria-label="Loading"></div>
        <div>
          <div class="fw-semibold">Đang tải dữ liệu thanh toán...</div>
          <div class="text-secondary small">Vui lòng chờ trong giây lát</div>
        </div>
      </div>
    </div>
  `;
}

function renderVerificationLoading() {
  return `
    <div class="card">
      <div class="card-body d-flex align-items-center gap-3">
        <div class="spinner-border" role="status" aria-label="Loading"></div>
        <div>
          <div class="fw-semibold">Đang tải ma trận đối chiếu tháng...</div>
          <div class="text-secondary small">Vui lòng chờ trong giây lát</div>
        </div>
      </div>
    </div>
  `;
}

function renderVerificationPanels(period, expenses, payments, settlement, ready) {
  if (!ready) {
    return renderVerificationLoading();
  }

  if (!expenses.length && !payments.length) {
    return `
      <div class="empty-state">
        <div class="empty-state__title">Tháng này chưa có dữ liệu đối chiếu</div>
        <div class="empty-state__text">
          Chưa có khoản chi hoặc thanh toán nào trong ${formatPeriodLabel(period).toLowerCase()} để tạo ma trận đối chiếu.
        </div>
      </div>
    `;
  }

  return `
    <section class="card">
      <div class="card-body section-card__body">
        ${renderSectionHeader({
          title: "Ma trận nợ gốc",
          subtitle: "Bảng nợ phát sinh từ các khoản chi trong tháng đã chọn.",
        })}
        ${renderMatrixTable({
          members: ROSTER,
          matrix: settlement.grossMatrix,
          title: "Ma trận nợ gốc từ chi tiêu",
        })}
      </div>
    </section>

    <section class="card">
      <div class="card-body section-card__body">
        ${renderSectionHeader({
          title: "Số dư sau khi áp payment",
          subtitle: "Số dư của riêng tháng này sau khi đã trừ các payment ghi nhận trong tháng.",
        })}
        ${renderBalancesList(settlement.balances)}
      </div>
    </section>

    <section class="card">
      <div class="card-body section-card__body">
        ${renderSectionHeader({
          title: "Ma trận sau cấn trừ",
          subtitle: "Bảng đối chiếu để kiểm tra kết quả cấn trừ của riêng tháng đang chọn.",
        })}
        ${renderMatrixTable({
          members: ROSTER,
          matrix: settlement.settleMatrix,
          title: "Ma trận sau cấn trừ",
        })}
      </div>
    </section>
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
  const currentUserLabel = getCurrentUserLabel(state);
  let verificationPeriod = getSelectedPeriod();
  let paymentHistoryOpen = false;

  let liveExpenses = [];
  let livePayments = [];
  let monthExpenses = [];
  let monthPayments = [];
  let expensesReady = false;
  let paymentsReady = false;
  let monthExpensesReady = false;
  let monthPaymentsReady = false;
  let unsubscribeExpenses = null;
  let unsubscribePayments = null;
  let unsubscribeMonthExpenses = null;
  let unsubscribeMonthPayments = null;

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
    const verificationReady = monthExpensesReady && monthPaymentsReady;
    const settlement = buildMonthlySettlementView({
      roster: ROSTER,
      expenses: liveExpenses,
      payments: livePayments,
    });
    const verificationSettlement = buildMonthlySettlementView({
      roster: ROSTER,
      expenses: monthExpenses,
      payments: monthPayments,
    });
    const summary = paymentSummary(settlement);

    app.innerHTML = renderAppShell({
      pageId: "payments",
      title: "Thanh toán",
      subtitle: "Cấn trừ toàn bộ lịch sử",
      meta: [`Đăng nhập: ${currentUserLabel}`, `Nhóm: ${groupId}`],
      showPeriodFilter: false,
      content: `
        ${
          aliasMode
            ? `
              <div class="info-banner">
                <span class="fw-semibold">Phần đối chiếu cấn trừ đã được gộp vào Thanh toán.</span>
                <span>Liên kết cũ <code>#/matrix</code> hiện mở thẳng phần đối chiếu ở đây.</span>
              </div>
            `
            : ""
        }

        <div class="info-banner">
          <span class="fw-semibold">Thanh toán đang tính trên toàn bộ dữ liệu hiện có.</span>
          <span>Danh sách dưới đây cộng dồn từ các tháng trước tới nay để bạn dễ giải thích số cấn trừ còn lại.</span>
        </div>

        ${
          ready
            ? `
              ${renderSummaryCards(summary)}

              <section class="card section-card">
                <div class="card-body section-card__body">
                  ${renderSectionHeader({
                    title: "Các khoản cần thanh toán theo cấn trừ",
                    subtitle:
                      "Mọi payment mới chỉ được ghi nhận từ các dòng cấn trừ còn lại tính trên toàn bộ dữ liệu hiện có.",
                  })}
                  ${renderSettlementList(settlement.settlementPlan, canOperate)}
                </div>
              </section>

              <details class="card section-card section-toggle" id="paymentHistory" ${paymentHistoryOpen ? "open" : ""}>
                <summary class="card-header section-toggle__summary">
                  <div>
                    <div class="section-toggle__title">Lịch sử thanh toán</div>
                    <div class="section-toggle__subtitle">Ẩn mặc định, mở ra khi cần kiểm tra hoặc chỉnh ngày / ghi chú.</div>
                  </div>
                  <span class="filter-pill filter-pill--neutral">${livePayments.length} giao dịch</span>
                </summary>
                <div class="card-body section-card__body">
                  ${renderPaymentsHistory(livePayments, canOperate)}
                </div>
              </details>

              <details class="card section-card section-toggle" id="paymentsVerification" ${openVerification ? "open" : ""}>
                <summary class="card-header section-toggle__summary">
                  <div>
                    <div class="section-toggle__title">Xem ma trận đối chiếu theo tháng</div>
                    <div class="section-toggle__subtitle">Đang đối chiếu ${formatPeriodLabel(verificationPeriod).toLowerCase()}.</div>
                  </div>
                  <span class="filter-pill filter-pill--neutral">${formatPeriodLabel(verificationPeriod)}</span>
                </summary>
                <div class="card-body section-card__body">
                  ${renderSectionHeader({
                    title: "Đối chiếu theo tháng",
                    subtitle:
                      "Chọn một tháng để mọi người tự kiểm tra nợ gốc, payment trong tháng và kết quả cấn trừ của riêng tháng đó.",
                  })}
                  <div class="verification-period-field">
                    ${renderMonthField({
                      id: "verificationPeriodPicker",
                      label: "Đối chiếu tháng",
                      value: verificationPeriod,
                      hint: `Bạn đang xem ${formatPeriodLabel(verificationPeriod).toLowerCase()}`,
                    })}
                  </div>
                  ${renderVerificationPanels(
                    verificationPeriod,
                    monthExpenses,
                    monthPayments,
                    verificationSettlement,
                    verificationReady,
                  )}
                </div>
              </details>
            `
            : renderLoading()
        }
      `,
    });

    mountPrimaryNav({
      active: "payments",
      isOwner: state.isOwner,
      includeLogout: true,
      onLogout: async () => {
        await logout();
      },
      userLabel: currentUserLabel,
    });

    if (!ready) return;

    app.querySelector("#paymentHistory")?.addEventListener("toggle", (event) => {
      paymentHistoryOpen = event.currentTarget.open;
    });

    app
      .querySelector("#verificationPeriodPicker")
      ?.addEventListener("change", (event) => {
        const nextPeriod = String(event.target.value || "").trim();
        if (!nextPeriod || nextPeriod === verificationPeriod) return;
        verificationPeriod = nextPeriod;
        startVerificationWatch();
      });

    bindSettlementButtons(settlement.settlementPlan);
    bindHistoryActions();
  }

  function bindHistoryActions() {
    if (!canOperate) return;

    app.querySelectorAll("[data-edit-payment]").forEach((button) => {
      button.addEventListener("click", () => {
        const payment = livePayments.find(
          (item) => item.id === button.getAttribute("data-edit-payment"),
        );
        if (!payment) return;

        openPaymentEditModal({
          date: payment.date || "",
          note: payment.note || "",
          onSubmit: async ({ date, note }) => {
            try {
              await updatePayment(groupId, payment.id, { date, note });
              showToast({
                title: "Thành công",
                message: "Đã cập nhật ngày và ghi chú thanh toán.",
                variant: "success",
              });
            } catch (error) {
              throw new Error(
                mapFirestoreError(error, "Không thể cập nhật thanh toán."),
              );
            }
          },
        });
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
          meta: `${payment.date} • ${nameOf(payment.fromId)} -> ${nameOf(payment.toId)} • ${formatVND(payment.amount)}`,
          okText: "Xóa",
          danger: true,
          onConfirm: async () => {
            try {
              await removePayment(groupId, payment.id);
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
          date: todayYmd(),
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

    unsubscribeExpenses = watchExpenses(groupId, (items) => {
      liveExpenses = items;
      expensesReady = true;
      render();
    });

    unsubscribePayments = watchPayments(groupId, (items) => {
      livePayments = items;
      paymentsReady = true;
      render();
    });
  }

  function startVerificationWatch() {
    monthExpensesReady = false;
    monthPaymentsReady = false;
    unsubscribeMonthExpenses?.();
    unsubscribeMonthPayments?.();
    render();

    unsubscribeMonthExpenses = watchMonthExpenses(
      groupId,
      verificationPeriod,
      (items) => {
        monthExpenses = items;
        monthExpensesReady = true;
        render();
      },
    );

    unsubscribeMonthPayments = watchMonthPayments(
      groupId,
      verificationPeriod,
      (items) => {
        monthPayments = items;
        monthPaymentsReady = true;
        render();
      },
    );
  }

  render();
  startWatch();
  startVerificationWatch();

  const onHashChange = () => {
    const isPaymentsRoute = location.hash.startsWith("#/payments");
    const isMatrixRoute = aliasMode && location.hash.startsWith("#/matrix");
    if (!isPaymentsRoute && !isMatrixRoute) {
      unsubscribeExpenses?.();
      unsubscribePayments?.();
      unsubscribeMonthExpenses?.();
      unsubscribeMonthPayments?.();
      window.removeEventListener("hashchange", onHashChange);
    }
  };

  window.addEventListener("hashchange", onHashChange);
}
