import { logout } from "../../services/auth.service";
import {
  getSelectedPeriod,
  setSelectedPeriod,
  state,
  subscribeSelectedPeriod,
} from "../../core/state";
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
import { openPaymentEditModal } from "../components/paymentEditModal";
import { renderMatrixTable } from "../components/matrixTable";
import { openPaymentModal } from "../components/paymentModal";
import { showToast } from "../components/toast";
import { renderAppShell } from "../layout/app-shell";
import { mountPrimaryNav } from "../layout/navbar";
import {
  renderFilterPill,
} from "../components/filterBar";
import { renderMoneyStatCard } from "../components/moneyStatCard";
import { renderSectionHeader } from "../components/sectionHeader";

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

function renderSummaryCards(summary) {
  return `
    <section class="money-grid money-grid--4">
      ${renderMoneyStatCard({
        label: "Khoản chi",
        value: `${summary.expenseCount}`,
        hint: "Bản ghi chi tiêu trong tháng",
        tone: "neutral",
      })}
      ${renderMoneyStatCard({
        label: "Thanh toán",
        value: `${summary.paymentCount}`,
        hint: "Đã ghi nhận",
        tone: summary.paymentCount ? "positive" : "neutral",
      })}
      ${renderMoneyStatCard({
        label: "Còn cấn trừ",
        value: `${summary.settlementCount}`,
        hint: summary.settlementCount ? "Dòng cần xử lý" : "Đã cân bằng",
        tone: summary.settlementCount ? "danger" : "positive",
      })}
      ${renderMoneyStatCard({
        label: "Tổng payment tháng",
        value: formatVND(summary.paymentTotal),
        hint: "Từ lịch sử thanh toán",
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
          Cấn trừ của tháng này đã cân bằng hoặc chưa phát sinh nợ.
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
          Lịch sử thanh toán của tháng này sẽ xuất hiện ở đây.
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

function renderLoading(period) {
  return `
    <div class="card">
      <div class="card-body d-flex align-items-center gap-3">
        <div class="spinner-border" role="status" aria-label="Loading"></div>
        <div>
          <div class="fw-semibold">Đang tải dữ liệu thanh toán tháng ${period}...</div>
          <div class="text-secondary small">Vui lòng chờ trong giây lát</div>
        </div>
      </div>
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
  const currentUserLabel = getCurrentUserLabel(state);

  let selectedPeriod = getSelectedPeriod();
  let liveExpenses = [];
  let livePayments = [];
  let expensesReady = false;
  let paymentsReady = false;
  let unsubscribeExpenses = null;
  let unsubscribePayments = null;

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

    app.innerHTML = renderAppShell({
      pageId: "payments",
      title: "Thanh toán",
      subtitle: "Vận hành theo cấn trừ",
      meta: [`Đăng nhập: ${currentUserLabel}`, `Nhóm: ${groupId}`],
      showPeriodFilter: true,
      period: selectedPeriod,
      periodActions: [
        renderFilterPill({
          label: `${summary.expenseCount} khoản chi`,
          tone: "neutral",
        }),
        renderFilterPill({
          label: `${summary.paymentCount} payment`,
          tone: summary.paymentCount ? "success" : "warning",
        }),
      ].join(""),
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

        ${
          ready
            ? `
              ${renderSummaryCards(summary)}

              <section class="card section-card">
                <div class="card-body section-card__body">
                  ${renderSectionHeader({
                    title: "Các khoản cần thanh toán theo cấn trừ",
                    subtitle:
                      "Mọi payment mới chỉ được ghi nhận từ các dòng cấn trừ còn lại của tháng này.",
                  })}
                  ${renderSettlementList(settlement.settlementPlan, canOperate)}
                </div>
              </section>

              <section class="card section-card">
                <div class="card-body section-card__body">
                  ${renderSectionHeader({
                    title: "Lịch sử thanh toán tháng",
                    subtitle:
                      "Chỉ được sửa ngày và ghi chú. Nếu sai số tiền, hãy xóa rồi tạo lại từ dòng cấn trừ.",
                  })}
                  ${renderPaymentsHistory(livePayments, canOperate)}
                </div>
              </section>

              <details class="card section-card" id="paymentsVerification" ${openVerification ? "open" : ""}>
                <summary class="card-header">Xem ma trận đối chiếu</summary>
                <div class="card-body section-card__body">
                  <section class="card">
                    <div class="card-body section-card__body">
                      ${renderSectionHeader({
                        title: "Ma trận nợ gốc",
                        subtitle: "Bảng nợ ban đầu tạo từ các khoản chi tiêu.",
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
                        subtitle: "Số dư hiện tại sau khi đã trừ các payment đã ghi nhận.",
                      })}
                      ${renderBalancesList(settlement.balances)}
                    </div>
                  </section>

                  <section class="card">
                    <div class="card-body section-card__body">
                      ${renderSectionHeader({
                        title: "Ma trận sau cấn trừ",
                        subtitle: "Bảng đối chiếu để mọi người kiểm tra lại logic thanh toán.",
                      })}
                      ${renderMatrixTable({
                        members: ROSTER,
                        matrix: settlement.settleMatrix,
                        title: "Ma trận sau cấn trừ",
                      })}
                    </div>
                  </section>
                </div>
              </details>
            `
            : renderLoading(selectedPeriod)
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

    document.getElementById("globalPeriodPicker")?.addEventListener("change", (event) => {
      setSelectedPeriod(event.target.value);
    });

    if (!ready) return;

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

  const unsubscribeSelectedPeriod = subscribeSelectedPeriod((nextPeriod) => {
    if (nextPeriod === selectedPeriod) return;
    selectedPeriod = nextPeriod;
    render();
    startWatch();
  });

  const onHashChange = () => {
    const isPaymentsRoute = location.hash.startsWith("#/payments");
    const isMatrixRoute = aliasMode && location.hash.startsWith("#/matrix");
    if (!isPaymentsRoute && !isMatrixRoute) {
      unsubscribeExpenses?.();
      unsubscribePayments?.();
      unsubscribeSelectedPeriod();
      window.removeEventListener("hashchange", onHashChange);
    }
  };

  window.addEventListener("hashchange", onHashChange);
}
