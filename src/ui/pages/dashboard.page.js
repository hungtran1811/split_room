import { logout } from "../../services/auth.service";
import {
  getSelectedPeriod,
  setSelectedPeriod,
  state,
  subscribeSelectedPeriod,
} from "../../core/state";
import { formatVND } from "../../config/i18n";
import { ROSTER } from "../../config/roster";
import { EMAIL_TO_MEMBER_ID } from "../../config/members.map";
import {
  getCurrentUserLabel,
  getMemberLabelById,
} from "../../core/display-name";
import {
  watchExpenses,
  watchExpensesByRange,
} from "../../services/expense.service";
import {
  watchPayments,
  watchPaymentsByRange,
} from "../../services/payment.service";
import { watchRentByPeriod } from "../../services/rent.service";
import { getMonthRange } from "../../services/month-ops.service";
import { renderAppShell } from "../layout/app-shell";
import { mountPrimaryNav } from "../layout/navbar";
import { renderFilterPill } from "../components/filterBar";
import { renderMoneyStatCard } from "../components/moneyStatCard";
import { renderSectionHeader } from "../components/sectionHeader";
import { buildMonthlySettlementView } from "../../domain/matrix/compute";

function clampPercent(value) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, value));
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

function sumAmount(items = []) {
  return items.reduce((sum, item) => sum + Number(item?.amount || 0), 0);
}

function periodKeyOfDate(date) {
  const value = String(date || "").slice(0, 7);
  return /^\d{4}-\d{2}$/.test(value) ? value : null;
}

function formatPeriodLabel(period) {
  const [year, month] = String(period || "").split("-");
  if (!year || !month) return period || "-";
  return `Tháng ${Number(month)} năm ${year}`;
}

function listHistoricalPeriods(expenses = [], payments = [], period) {
  const { start } = getMonthRange(period);
  const months = new Set();

  for (const item of expenses) {
    const date = String(item?.date || "");
    if (date >= start) continue;
    const monthKey = periodKeyOfDate(date);
    if (monthKey) months.add(monthKey);
  }

  for (const item of payments) {
    const date = String(item?.date || "");
    if (date >= start) continue;
    const monthKey = periodKeyOfDate(date);
    if (monthKey) months.add(monthKey);
  }

  return [...months].sort();
}

function buildPreviousDebtTimeline(expenses = [], payments = [], period) {
  const months = listHistoricalPeriods(expenses, payments, period);
  const timeline = [];
  let cumulativeExpenses = [];
  let cumulativePayments = [];

  for (const monthKey of months) {
    const monthExpenses = expenses.filter((item) =>
      String(item?.date || "").startsWith(`${monthKey}-`),
    );
    const monthPayments = payments.filter((item) =>
      String(item?.date || "").startsWith(`${monthKey}-`),
    );

    cumulativeExpenses = cumulativeExpenses.concat(monthExpenses);
    cumulativePayments = cumulativePayments.concat(monthPayments);

    const carryPlan = buildMonthlySettlementView({
      roster: ROSTER,
      expenses: cumulativeExpenses,
      payments: cumulativePayments,
    }).settlementPlan;

    timeline.push({
      period: monthKey,
      expenseTotal: sumAmount(monthExpenses),
      paymentTotal: sumAmount(monthPayments),
      carryTotal: sumAmount(carryPlan),
      carryCount: carryPlan.length,
    });
  }

  return timeline;
}

function summarizeRentForMember(rentDoc, memberId) {
  if (!rentDoc || !memberId) return null;

  const payerId = rentDoc.payerId || "hung";
  const shares = rentDoc.shares || {};
  const paid = rentDoc.paid || {};
  const total = Number(rentDoc.total || 0);

  if (memberId === payerId) {
    const myShare = Number(shares[payerId] || 0);
    const expectedFromOthers = Math.max(0, total - myShare);
    const collectedFromOthers = Object.entries(paid).reduce((sum, [id, value]) => {
      return id === payerId ? sum : sum + Number(value || 0);
    }, 0);
    const remaining = Math.max(0, expectedFromOthers - collectedFromOthers);

    return {
      mode: "payer",
      total,
      myShare,
      collectedFromOthers,
      expectedFromOthers,
      remaining,
    };
  }

  const share = Number(shares[memberId] || 0);
  const alreadyPaid = Number(paid[memberId] || 0);
  const remaining = Math.max(0, share - alreadyPaid);

  return {
    mode: "member",
    total,
    share,
    alreadyPaid,
    remaining,
  };
}

function renderHeroRow(stats) {
  return `
    <section class="money-grid money-grid--4">
      ${renderMoneyStatCard({
        label: "Tổng chi",
        value: formatVND(stats.expenseTotal),
        hint: `${stats.expenseCount} khoản trong tháng`,
        tone: "neutral",
        size: "lg",
      })}
      ${renderMoneyStatCard({
        label: "Tổng thanh toán",
        value: formatVND(stats.paymentTotal),
        hint: `${stats.paymentCount} giao dịch đã ghi nhận`,
        tone: stats.paymentTotal > 0 ? "positive" : "neutral",
        size: "lg",
      })}
      ${renderMoneyStatCard({
        label: "Tiền nhà",
        value: formatVND(stats.rentTotal),
        hint: stats.rentTotal > 0 ? "Đã có bản ghi tháng này" : "Chưa có bản ghi tiền nhà",
        tone: stats.rentTotal > 0 ? "warning" : "neutral",
        size: "lg",
      })}
      ${renderMoneyStatCard({
        label: "Còn cấn trừ",
        value: stats.settlementCount ? `${stats.settlementCount} dòng` : "0 dòng",
        hint: stats.settlementCount ? "Cần xử lý trong tháng" : "Đã cân bằng trong tháng",
        tone: stats.settlementCount ? "danger" : "positive",
        size: "lg",
      })}
    </section>
  `;
}

function renderTasks(tasks) {
  if (!tasks.length) {
    return `
      <div class="empty-state">
        <div class="empty-state__title">Mọi thứ đang ổn</div>
        <div class="empty-state__text">
          Tháng này hiện chưa có việc ưu tiên nào cần xử lý ngay.
        </div>
      </div>
    `;
  }

  return `
    <div class="action-list">
      ${tasks
        .map(
          (task) => `
            <article class="action-list__item">
              <div class="action-list__head">
                <div>
                  <div class="action-list__title">${task.title}</div>
                  <div class="action-list__meta">${task.description}</div>
                </div>
                <a class="btn ui-action-pill ui-action-pill--secondary section-cta" href="${task.href}">
                  ${task.cta}
                </a>
              </div>
            </article>
          `,
        )
        .join("")}
    </div>
  `;
}

function renderRentSection(rentSummary) {
  if (!rentSummary) {
    return `
      <section class="card section-card">
        <div class="card-body section-card__body">
          ${renderSectionHeader({
            title: "Tiền nhà tháng này",
            subtitle: "Theo dõi phần phải đóng và tiến độ thu tiền trong tháng.",
            action:
              '<a class="btn ui-action-pill ui-action-pill--secondary section-cta" href="#/rent">Mở tiền nhà</a>',
          })}
          <div class="empty-state">
            <div class="empty-state__title">Chưa có bản ghi tiền nhà</div>
            <div class="empty-state__text">
              Tạo tiền nhà tháng này để mọi người nhìn thấy phần cần đóng.
            </div>
          </div>
        </div>
      </section>
    `;
  }

  if (rentSummary.mode === "payer") {
    const percent = clampPercent(
      rentSummary.expectedFromOthers <= 0
        ? 100
        : (rentSummary.collectedFromOthers / rentSummary.expectedFromOthers) * 100,
    );

    return `
      <section class="card section-card">
        <div class="card-body section-card__body">
          ${renderSectionHeader({
            title: "Tiền nhà tháng này",
            subtitle: "Phần tiền bạn đang đứng và tiến độ thu lại trong tháng.",
            action:
              '<a class="btn ui-action-pill ui-action-pill--secondary section-cta" href="#/rent">Mở tiền nhà</a>',
          })}
          <div class="money-grid money-grid--3">
            ${renderMoneyStatCard({
              label: "Phần của bạn",
              value: formatVND(rentSummary.myShare),
              tone: "neutral",
            })}
            ${renderMoneyStatCard({
              label: "Đã thu",
              value: formatVND(rentSummary.collectedFromOthers),
              tone: "positive",
            })}
            ${renderMoneyStatCard({
              label: "Còn thiếu",
              value: formatVND(rentSummary.remaining),
              tone: rentSummary.remaining > 0 ? "danger" : "positive",
            })}
          </div>
          <div>
            <div class="d-flex justify-content-between small text-secondary mb-2">
              <span>Tiến độ thu tiền</span>
              <span>${Math.round(percent)}%</span>
            </div>
            <div class="progress" style="height: 10px;">
              <div
                class="progress-bar ${rentSummary.remaining > 0 ? "bg-warning" : "bg-success"}"
                style="width:${percent}%"
              ></div>
            </div>
          </div>
        </div>
      </section>
    `;
  }

  const percent = clampPercent(
    rentSummary.share <= 0 ? 100 : (rentSummary.alreadyPaid / rentSummary.share) * 100,
  );

  return `
    <section class="card section-card">
      <div class="card-body section-card__body">
        ${renderSectionHeader({
          title: "Tiền nhà tháng này",
          subtitle: "Phần tiền nhà của bạn trong tháng hiện tại.",
          action:
            '<a class="btn ui-action-pill ui-action-pill--secondary section-cta" href="#/rent">Mở tiền nhà</a>',
        })}
        <div class="money-grid money-grid--3">
          ${renderMoneyStatCard({
            label: "Bạn cần trả",
            value: formatVND(rentSummary.share),
            tone: "warning",
          })}
          ${renderMoneyStatCard({
            label: "Đã chuyển",
            value: formatVND(rentSummary.alreadyPaid),
            tone: "positive",
          })}
          ${renderMoneyStatCard({
            label: "Còn thiếu",
            value: formatVND(rentSummary.remaining),
            tone: rentSummary.remaining > 0 ? "danger" : "positive",
          })}
        </div>
        <div>
          <div class="d-flex justify-content-between small text-secondary mb-2">
            <span>Tiến độ đóng tiền</span>
            <span>${Math.round(percent)}%</span>
          </div>
          <div class="progress" style="height: 10px;">
            <div
              class="progress-bar ${rentSummary.remaining > 0 ? "bg-danger" : "bg-success"}"
              style="width:${percent}%"
            ></div>
          </div>
        </div>
      </div>
    </section>
  `;
}

function renderPreviousDebtSection(items, period, timeline = []) {
  const totalDebt = sumAmount(items);

  return `
    <section class="card section-card">
      <div class="card-body section-card__body">
        ${renderSectionHeader({
          title: "Nợ cũ từ các tháng trước",
          subtitle: `Các khoản còn treo trước ${period.replace("-", "/")} để cả nhóm không quên xử lý tiếp.`,
        })}
        ${
          items.length
            ? `
              <div class="summary-strip">
                <div class="summary-strip__item">
                  <span class="summary-strip__label">Tổng nợ chuyển kỳ</span>
                  <span class="summary-strip__value">${formatVND(totalDebt)}</span>
                </div>
                <div class="summary-strip__item">
                  <span class="summary-strip__label">Số dòng còn treo</span>
                  <span class="summary-strip__value">${items.length} dòng</span>
                </div>
                <div class="summary-strip__item">
                  <span class="summary-strip__label">Số tháng có phát sinh</span>
                  <span class="summary-strip__value">${timeline.length} tháng</span>
                </div>
              </div>
              <div class="action-list">
                ${items
                  .slice(0, 4)
                  .map(
                    (item) => `
                      <article class="action-list__item">
                        <div class="action-list__head">
                          <div>
                            <div class="action-list__title">${nameOf(item.fromId)} -> ${nameOf(item.toId)}</div>
                            <div class="action-list__meta">Còn nợ từ các tháng trước ${formatVND(item.amount)}</div>
                          </div>
                        </div>
                      </article>
                    `,
                  )
                  .join("")}
              </div>
              ${
                timeline.length
                  ? `
                    <details class="settlement-explain__events-toggle">
                      <summary class="settlement-explain__events-summary">
                        Xem nhanh nợ chuyển theo từng tháng (${timeline.length} tháng)
                      </summary>
                      <div class="stack-list p-3 pt-0">
                        ${timeline
                          .map(
                            (entry) => `
                              <article class="action-list__item">
                                <div class="action-list__head">
                                  <div>
                                    <div class="action-list__title">${formatPeriodLabel(entry.period)}</div>
                                    <div class="action-list__meta">Chi tiêu: ${formatVND(entry.expenseTotal)} • Thanh toán: ${formatVND(entry.paymentTotal)}</div>
                                    <div class="action-list__meta">Cuối tháng còn chuyển: ${formatVND(entry.carryTotal)} (${entry.carryCount} dòng)</div>
                                  </div>
                                </div>
                              </article>
                            `,
                          )
                          .join("")}
                      </div>
                    </details>
                  `
                  : ""
              }
            `
            : `
              <div class="empty-state">
                <div class="empty-state__title">Không còn nợ cũ</div>
                <div class="empty-state__text">
                  Các khoản phát sinh từ những tháng trước đã được cân bằng.
                </div>
              </div>
            `
        }
      </div>
    </section>
  `;
}

function renderSettlementSection(items) {
  return `
    <section class="card section-card">
      <div class="card-body section-card__body">
        ${renderSectionHeader({
          title: "Cấn trừ hiện tại",
          subtitle: "Các khoản còn cần thanh toán trong tháng đang xem sau khi đã áp payment.",
          action:
            '<a class="btn ui-action-pill ui-action-pill--secondary section-cta" href="#/payments">Mở thanh toán</a>',
        })}
        ${
          items.length
            ? `
              <div class="action-list">
                ${items
                  .slice(0, 5)
                  .map(
                    (item) => `
                      <article class="action-list__item">
                        <div class="action-list__head">
                          <div>
                            <div class="action-list__title">${nameOf(item.fromId)} -> ${nameOf(item.toId)}</div>
                            <div class="action-list__meta">Còn cần thanh toán ${formatVND(item.amount)}</div>
                          </div>
                          <button
                            class="btn ui-action-pill ui-action-pill--secondary section-cta"
                            data-copy="${item.fromId}|${item.toId}|${item.amount}"
                          >
                            Copy
                          </button>
                        </div>
                      </article>
                    `,
                  )
                  .join("")}
              </div>
            `
            : `
              <div class="empty-state">
                <div class="empty-state__title">Không còn khoản cấn trừ nào</div>
                <div class="empty-state__text">Không còn khoản cấn trừ nào trong tháng này.</div>
              </div>
            `
        }
      </div>
    </section>
  `;
}

function renderLoading(period) {
  return `
    <div class="card">
      <div class="card-body d-flex align-items-center gap-3">
        <div class="spinner-border" role="status" aria-label="Loading"></div>
        <div>
          <div class="fw-semibold">Đang tải dữ liệu tháng ${period}...</div>
          <div class="text-secondary small">
            Dữ liệu sẽ tự làm mới khi có thay đổi.
          </div>
        </div>
      </div>
    </div>
  `;
}

export function renderDashboardPage() {
  const app = document.querySelector("#app");
  const myMemberId = getMyMemberId();
  const currentUserLabel = getCurrentUserLabel(state);

  let period = getSelectedPeriod();
  let liveExpenses = [];
  let livePayments = [];
  let liveRent = null;
  let allTimeExpenses = [];
  let allTimePayments = [];
  let expensesReady = false;
  let paymentsReady = false;
  let rentReady = false;
  let allTimeExpensesReady = false;
  let allTimePaymentsReady = false;
  let unsubscribeExpenses = null;
  let unsubscribePayments = null;
  let unsubscribeRent = null;
  let unsubscribeAllTimeExpenses = null;
  let unsubscribeAllTimePayments = null;
  let disposed = false;

  function renderShell(content, periodActions = "") {
    app.innerHTML = renderAppShell({
      pageId: "dashboard",
      title: "Dashboard",
      subtitle: "Tổng quan tháng hiện tại",
      meta: [`Đăng nhập: ${currentUserLabel}`, `Nhóm: ${state.groupId}`],
      showPeriodFilter: true,
      period,
      periodActions,
      content,
    });

    mountPrimaryNav({
      active: "dashboard",
      isOwner: state.isOwner,
      includeLogout: true,
      onLogout: async () => logout(),
      userLabel: currentUserLabel,
    });

    document
      .getElementById("globalPeriodPicker")
      ?.addEventListener("change", (event) => {
        setSelectedPeriod(event.target.value);
      });
  }

  function renderLoadingShell() {
    renderShell(
      renderLoading(period),
      renderFilterPill({
        label: "Đang tải dữ liệu",
        tone: "neutral",
      }),
    );
  }

  function recomputeAndRender() {
    if (!expensesReady || !paymentsReady || !rentReady) {
      renderLoadingShell();
      return;
    }

    const expenseTotal = liveExpenses.reduce(
      (sum, item) => sum + Number(item.amount || 0),
      0,
    );
    const paymentTotal = livePayments.reduce(
      (sum, item) => sum + Number(item.amount || 0),
      0,
    );
    const monthlySettlementView = buildMonthlySettlementView({
      roster: ROSTER,
      expenses: liveExpenses,
      payments: livePayments,
    });
    const settlementPlan = monthlySettlementView.settlementPlan;
    const { start } = getMonthRange(period);
    const previousDebtSettlementPlan =
      allTimeExpensesReady && allTimePaymentsReady
        ? buildMonthlySettlementView({
            roster: ROSTER,
            expenses: allTimeExpenses.filter((item) => String(item.date || "") < start),
            payments: allTimePayments.filter((item) => String(item.date || "") < start),
          }).settlementPlan
        : null;
    const previousDebtTimeline =
      allTimeExpensesReady && allTimePaymentsReady
        ? buildPreviousDebtTimeline(
            allTimeExpenses,
            allTimePayments,
            period,
          )
        : [];

    const rentSummary = summarizeRentForMember(liveRent, myMemberId);
    const stats = {
      expenseTotal,
      expenseCount: liveExpenses.length,
      paymentTotal,
      paymentCount: livePayments.length,
      rentTotal: Number(liveRent?.total || 0),
      settlementCount: settlementPlan.length,
    };

    const tasks = [];
    if (!liveExpenses.length) {
      tasks.push({
        title: "Tháng này chưa có khoản chi nào",
        description: "Bắt đầu bằng việc thêm khoản chi đầu tiên để cả nhóm cùng theo dõi.",
        href: "#/expenses",
        cta: "Thêm chi tiêu",
      });
    }
    if (!liveRent) {
      tasks.push({
        title: "Tạo tiền nhà tháng này",
        description: "Tiền nhà vẫn chưa được nhập nên mọi người chưa thấy phần cần đóng.",
        href: "#/rent",
        cta: "Nhập tiền nhà",
      });
    }
    if (settlementPlan.length > 0) {
      tasks.push({
        title: "Còn khoản cấn trừ cần xử lý",
        description: `${settlementPlan.length} dòng cấn trừ vẫn chưa được thanh toán hết.`,
        href: "#/payments",
        cta: "Mở thanh toán",
      });
    }

    const periodActions = [
      renderFilterPill({
        label: `${stats.expenseCount} khoản chi`,
        tone: stats.expenseCount ? "neutral" : "warning",
      }),
      renderFilterPill({
        label: `${settlementPlan.length} dòng cấn trừ`,
        tone: settlementPlan.length ? "danger" : "success",
      }),
    ].join("");

    renderShell(
      `
        ${renderHeroRow(stats)}

        <section class="card section-card">
          <div class="card-body section-card__body">
            ${renderSectionHeader({
              title: "Việc cần làm",
              subtitle: "Những việc nên xử lý trước trong tháng này.",
            })}
            ${renderTasks(tasks)}
          </div>
        </section>

        ${renderRentSection(rentSummary)}
        ${
          previousDebtSettlementPlan
            ? renderPreviousDebtSection(
                previousDebtSettlementPlan,
                period,
                previousDebtTimeline,
              )
            : `
              <section class="card section-card">
                <div class="card-body section-card__body">
                  ${renderSectionHeader({
                    title: "Nợ cũ từ các tháng trước",
                    subtitle: "Đang kiểm tra các khoản còn treo trước tháng đang xem.",
                  })}
                  <div class="card">
                    <div class="card-body d-flex align-items-center gap-3">
                      <div class="spinner-border spinner-border-sm" role="status" aria-label="Loading"></div>
                      <div class="text-secondary small">Đang tải nợ cũ...</div>
                    </div>
                  </div>
                </div>
              </section>
            `
        }
        ${renderSettlementSection(settlementPlan)}
      `,
      periodActions,
    );

    app.querySelectorAll("[data-copy]").forEach((button) => {
      button.addEventListener("click", async () => {
        const [fromId, toId, amountString] = button
          .getAttribute("data-copy")
          .split("|");
        const amount = Number(amountString || 0);
        const text = `${nameOf(fromId)} chuyển ${formatVND(amount)} cho ${nameOf(toId)} (cấn trừ tháng này)`;

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

  function startAllTimeWatchers() {
    unsubscribeAllTimeExpenses?.();
    unsubscribeAllTimePayments?.();

    allTimeExpensesReady = false;
    allTimePaymentsReady = false;

    const groupId = state.groupId;

    unsubscribeAllTimeExpenses = watchExpenses(groupId, (items) => {
      if (disposed) return;
      allTimeExpenses = items;
      allTimeExpensesReady = true;
      recomputeAndRender();
    });

    unsubscribeAllTimePayments = watchPayments(groupId, (items) => {
      if (disposed) return;
      allTimePayments = items;
      allTimePaymentsReady = true;
      recomputeAndRender();
    });
  }

  function startWatchers() {
    unsubscribeExpenses?.();
    unsubscribePayments?.();
    unsubscribeRent?.();

    expensesReady = false;
    paymentsReady = false;
    rentReady = false;

    const { start, end } = getMonthRange(period);
    const groupId = state.groupId;

    unsubscribeExpenses = watchExpensesByRange(groupId, start, end, (items) => {
      if (disposed) return;
      liveExpenses = items;
      expensesReady = true;
      recomputeAndRender();
    });

    unsubscribePayments = watchPaymentsByRange(groupId, start, end, (items) => {
      if (disposed) return;
      livePayments = items;
      paymentsReady = true;
      recomputeAndRender();
    });

    unsubscribeRent = watchRentByPeriod(groupId, period, (docData) => {
      if (disposed) return;
      liveRent = docData;
      rentReady = true;
      recomputeAndRender();
    });
  }

  function reloadPeriod(nextPeriod) {
    period = nextPeriod;
    renderLoadingShell();
    startWatchers();
  }

  const unsubscribeSelectedPeriod = subscribeSelectedPeriod((nextPeriod) => {
    if (nextPeriod === period) return;
    reloadPeriod(nextPeriod);
  });

  const onHashChange = () => {
    if (!location.hash.startsWith("#/dashboard")) {
      disposed = true;
      unsubscribeExpenses?.();
      unsubscribePayments?.();
      unsubscribeRent?.();
      unsubscribeAllTimeExpenses?.();
      unsubscribeAllTimePayments?.();
      unsubscribeSelectedPeriod();
      window.removeEventListener("hashchange", onHashChange);
    }
  };

  window.addEventListener("hashchange", onHashChange);
  renderLoadingShell();
  startAllTimeWatchers();
  startWatchers();
}
