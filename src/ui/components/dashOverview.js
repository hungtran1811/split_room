import { formatVND } from "../../config/i18n";
import { getInitials, renderIcon } from "../icons";

const QUICK_CTAS = [
  {
    id: "expense",
    href: "#/expenses",
    icon: "receipt",
    label: "Chi tiêu",
    sub: "Ghi chi mới",
    tone: "blue",
  },
  {
    id: "settle",
    href: "#/payments?tab=suggest",
    icon: "swap",
    label: "Cấn trừ",
    sub: "Thanh toán",
    tone: "indigo",
  },
  {
    id: "rent",
    href: "#/rent",
    icon: "building",
    label: "Tiền nhà",
    sub: "Cập nhật",
    tone: "violet",
  },
  {
    id: "reports",
    href: "#/reports",
    icon: "chart",
    label: "Báo cáo",
    sub: "Xem tháng",
    tone: "slate",
  },
];

export function renderQuickCtaGrid(badges = {}) {
  return `
    <section class="dash-cta" aria-label="Thao tác nhanh">
      <h2 class="dash-cta__title">Thao tác nhanh</h2>
      <div class="dash-cta__grid">
        ${QUICK_CTAS.map((item) => {
          const badge = badges[item.id];
          return `
            <a class="dash-cta__item dash-cta__item--${item.tone}" href="${item.href}">
              <span class="dash-cta__icon">${renderIcon(item.icon, { className: "icon", size: 20 })}</span>
              <span class="dash-cta__copy">
                <strong>${item.label}</strong>
                <span>${item.sub}</span>
              </span>
              ${badge ? `<span class="dash-cta__badge">${badge}</span>` : ""}
            </a>
          `;
        }).join("")}
      </div>
    </section>
  `;
}

export function buildMemberSummaries({ roster = [], rentDoc = null, settlementPlan = [] } = {}) {
  const payerId = rentDoc?.payerId || "hung";
  const total = Number(rentDoc?.total || 0);
  const shares = rentDoc?.shares || {};
  const paid = rentDoc?.paid || {};

  return roster.map((member) => {
    const id = member.id;
    let expenseOwes = 0;
    let expenseReceives = 0;

    for (const item of settlementPlan) {
      if (item.fromId === id) expenseOwes += Number(item.amount || 0);
      if (item.toId === id) expenseReceives += Number(item.amount || 0);
    }

    let rentLabel = "Chưa nhập";
    let rentAmount = 0;
    let rentTone = "neutral";

    if (rentDoc) {
      const share = Number(shares[id] || 0);
      const paidAmount = Number(paid[id] || 0);

      if (id === payerId) {
        const expected = Math.max(0, total - share);
        const collected = Object.entries(paid).reduce((sum, [memberId, value]) => {
          return memberId === payerId ? sum : sum + Number(value || 0);
        }, 0);
        const remaining = Math.max(0, expected - collected);
        rentLabel = remaining > 0 ? "Cần thu" : "Đã thu đủ";
        rentAmount = remaining > 0 ? remaining : collected;
        rentTone = remaining > 0 ? "warning" : "positive";
      } else {
        const remaining = Math.max(0, share - paidAmount);
        rentLabel = remaining > 0 ? "Thiếu nhà" : "Đủ nhà";
        rentAmount = remaining;
        rentTone = remaining > 0 ? "danger" : "positive";
      }
    }

    const totalOwe = expenseOwes + (rentTone === "danger" || rentTone === "warning" ? rentAmount : 0);
    let status = "settled";
    let statusLabel = "Ổn";

    if (expenseOwes > 0 || (rentDoc && id !== payerId && rentAmount > 0)) {
      status = "debt";
      statusLabel = "Còn nợ";
    } else if (expenseReceives > 0) {
      status = "credit";
      statusLabel = "Được nhận";
    } else if (!rentDoc) {
      status = "pending";
      statusLabel = "Chờ nhà";
    }

    return {
      id,
      name: member.name,
      expenseOwes,
      expenseReceives,
      rentLabel,
      rentAmount,
      rentTone,
      totalOwe,
      status,
      statusLabel,
    };
  });
}

export function renderMemberSummaries(summaries = [], myMemberId = "") {
  if (!summaries.length) return "";

  return `
    <section class="dash-members" aria-label="Tình hình từng người">
      <div class="dash-members__head">
        <h2 class="dash-members__title">Từng thành viên</h2>
        <a class="dash-members__link" href="#/reports">Báo cáo đầy đủ</a>
      </div>
      <div class="dash-members__grid">
        ${summaries
          .map((member) => {
            const isMe = member.id === myMemberId;
            const expenseLine =
              member.expenseOwes > 0
                ? `Nợ chi: ${formatVND(member.expenseOwes)}`
                : member.expenseReceives > 0
                  ? `Được nhận: ${formatVND(member.expenseReceives)}`
                  : "Chi: Ổn";

            const rentLine = member.rentAmount
              ? `${member.rentLabel}: ${formatVND(member.rentAmount)}`
              : member.rentLabel;

            return `
              <article class="dash-member dash-member--${member.status} ${isMe ? "dash-member--me" : ""}">
                <div class="dash-member__top">
                  <span class="dash-member__avatar">${getInitials(member.name)}</span>
                  <div class="dash-member__identity">
                    <strong class="dash-member__name">${member.name}${isMe ? " (bạn)" : ""}</strong>
                    <span class="dash-member__badge dash-member__badge--${member.status}">${member.statusLabel}</span>
                  </div>
                </div>
                <div class="dash-member__lines">
                  <div class="dash-member__line">${expenseLine}</div>
                  <div class="dash-member__line dash-member__line--${member.rentTone}">${rentLine}</div>
                </div>
                ${
                  member.status === "debt"
                    ? `<a class="dash-member__action" href="#/payments?tab=suggest">Ghi cấn trừ</a>`
                    : ""
                }
              </article>
            `;
          })
          .join("")}
      </div>
    </section>
  `;
}
