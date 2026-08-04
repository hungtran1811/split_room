import { formatVND } from "../../../config/i18n";
import { ROSTER_IDS, nameOf } from "../../../config/roster";
import { renderMemberChip } from "../../components/memberChip";
import { renderMetricGrid, renderMoneyStatCard } from "../../components/metricTile";
import { renderProgressRing } from "../../components/progressRing";
import { renderSectionHeader } from "../../components/sectionHeader";
import { buildEqualShares } from "../../../domain/rent/compute";

export function renderRentCollectionRing({
  collected = 0,
  expectedCollection = 0,
  size = 96,
  stroke = 9,
} = {}) {
  const percent =
    expectedCollection <= 0
      ? 0
      : Math.min(100, (collected / expectedCollection) * 100);

  return renderProgressRing({
    percent,
    label: "Đã thu",
    sublabel: `${formatVND(collected)} / ${formatVND(expectedCollection)}`,
    size,
    stroke,
  });
}

export function rowInfoHtml(share, due) {
  return `Phải đóng: ${formatVND(share)} • Còn thiếu: <b>${formatVND(due)}</b>`;
}

export function rentStatusChip(share, paidValue) {
  if (share <= 0) {
    return '<span class="status-badge status-badge--pending">Chưa nhập</span>';
  }
  if (paidValue >= share) {
    return '<span class="status-badge status-badge--settled">Đã đủ</span>';
  }
  return '<span class="status-badge status-badge--debt">Còn thiếu</span>';
}

export function renderRentPageContent(payerId) {
  return `
    <div id="rentReadonlyBanner" class="readonly-banner" hidden style="display:none">Chỉ xem</div>

    <div class="d-flex align-items-center gap-3 flex-wrap mb-2">
      <div id="rentRingHost">
        ${renderRentCollectionRing()}
      </div>
      <div class="flex-grow-1">
        ${renderMetricGrid(
          [
            { label: "Tổng", value: '<span id="rentTotalStrip">0 đ</span>', tone: "warning" },
            { label: "Đã thu", value: '<span id="collectedStrip">0 đ</span>', tone: "positive" },
            { label: "Thiếu", value: '<span id="totalDueStrip">0 đ</span>', tone: "danger" },
          ],
          { columns: 3 },
        )}
      </div>
    </div>

    <div id="rentEditableArea" class="section-stack">
      <section class="card section-card" id="rentFormCard">
        <div class="card-body section-card__body">
          ${renderSectionHeader({
            title: "1. Khoản tiền tháng này",
            subtitle: "Nhập các khoản gốc để hệ thống tự tính tổng tiền nhà.",
          })}
          <div class="row g-3">
            <div class="col-6">
              <label class="form-label">Tiền thuê</label>
              <input id="it_rent" class="form-control" placeholder="VD: 6000000" />
            </div>
            <div class="col-6">
              <label class="form-label">Số người ở</label>
              <input id="headcount" class="form-control" placeholder="VD: 4" />
            </div>
            <div class="col-6">
              <label class="form-label">Nước / người</label>
              <input id="waterUnit" class="form-control" placeholder="VD: 100000" />
            </div>
            <div class="col-12">
              <div class="d-flex justify-content-between small">
                <span class="text-secondary">Tiền nước thực tế</span>
                <span class="fw-semibold" id="waterCostTxt">0 đ</span>
              </div>
            </div>
            <div class="col-4">
              <label class="form-label">Điện cũ</label>
              <input id="elecOld" class="form-control" placeholder="VD: 11008" />
            </div>
            <div class="col-4">
              <label class="form-label">Điện mới</label>
              <input id="elecNew" class="form-control" placeholder="VD: 11214" />
            </div>
            <div class="col-4">
              <label class="form-label">Giá điện / số</label>
              <input id="elecUnit" class="form-control" placeholder="VD: 4000" />
            </div>
            <div class="col-12">
              <div class="d-flex justify-content-between small">
                <span class="text-secondary">Số điện dùng</span>
                <span class="fw-semibold" id="kwhUsedTxt">0</span>
              </div>
              <div class="d-flex justify-content-between small">
                <span class="text-secondary">Tiền điện thực tế</span>
                <span class="fw-semibold" id="elecCostTxt">0 đ</span>
              </div>
            </div>
            <div class="col-6">
              <label class="form-label">Wifi</label>
              <input id="it_wifi" class="form-control" placeholder="VD: 150000" />
            </div>
            <div class="col-12">
              <label class="form-label">Khác</label>
              <input id="it_other" class="form-control" placeholder="0" />
            </div>
            <div class="col-12">
              <div class="money-grid money-grid--3">
                ${renderMoneyStatCard({ label: "Tổng tiền nhà", value: '<span id="rentTotal">0 đ</span>', tone: "warning" })}
                ${renderMoneyStatCard({ label: "Tiền nước", value: '<span id="waterCostCard">0 đ</span>', tone: "neutral" })}
                ${renderMoneyStatCard({ label: "Tiền điện", value: '<span id="elecCostCard">0 đ</span>', tone: "neutral" })}
              </div>
            </div>
            <div class="col-12">
              <label class="form-label">Ghi chú</label>
              <input id="rentNote" class="form-control" placeholder="VD: Tiền nhà tháng này" />
            </div>
          </div>
        </div>
      </section>

      <section class="card section-card" id="rentShareCard">
        <div class="card-body section-card__body">
          ${renderSectionHeader({
            title: "2. Chia tiền",
            subtitle: "Chọn chia đều hoặc tự nhập phần của từng người.",
            action: `
              <div class="form-check">
                <input class="form-check-input" type="checkbox" id="splitEqual" checked>
                <label class="form-check-label" for="splitEqual">Chia đều</label>
              </div>
            `,
          })}
          <div id="sharesBox" class="row g-2"></div>
          <div class="money-grid money-grid--3">
            ${renderMoneyStatCard({ label: "Tổng phần chia", value: '<span id="sharesSum">0 đ</span>', tone: "neutral" })}
          </div>
          <div class="small text-danger" id="sharesErr" style="min-height:18px;"></div>
        </div>
      </section>

      <section class="card section-card" id="rentPaidCard">
        <div class="card-body section-card__body">
          ${renderSectionHeader({
            title: `3. Mọi người đã chuyển cho ${nameOf(payerId)} bao nhiêu`,
            subtitle: "Theo dõi số đã thu và phần còn thiếu của từng người.",
          })}
          <div id="paidBox" class="row g-2"></div>
          <div class="money-grid money-grid--3">
            ${renderMoneyStatCard({ label: "Đã thu từ mọi người", value: '<span id="collected">0 đ</span>', tone: "positive" })}
            ${renderMoneyStatCard({ label: `${nameOf(payerId)} đang gánh`, value: '<span id="payerBurden">0 đ</span>', tone: "warning" })}
            ${renderMoneyStatCard({ label: "Còn thiếu", value: '<span id="totalDue">0 đ</span>', tone: "danger" })}
          </div>
          <div class="small text-secondary">Cập nhật cuối: <b id="rentUpdated">Chưa có</b></div>
          <div class="small text-danger" id="rentMsg"></div>
        </div>
      </section>

      <div class="mobile-action-bar" id="rentActionBar">
        <button id="btnSaveRent" type="button" class="btn btn-primary">Lưu</button>
        <button id="btnClearPaid" type="button" class="btn btn-outline-secondary">Clear đã chuyển</button>
      </div>
    </div>
  `;
}

export function renderShareInputs(page, total, equal, shares) {
  const box = page.querySelector("#sharesBox");
  const equalShares = buildEqualShares(total, ROSTER_IDS);
  box.innerHTML = ROSTER_IDS.map((memberId) => {
    const value = equal
      ? equalShares[memberId]
      : Number(shares?.[memberId] ?? equalShares[memberId] ?? 0);
    return `
      <div class="col-6 col-md-3">
        <label class="form-label">${nameOf(memberId)}</label>
        <input class="form-control shareInput" data-id="${memberId}" value="${value}" ${equal ? "disabled" : ""} />
      </div>
    `;
  }).join("");
}

export function renderPaidInputs(page, payerId, shares, paid) {
  const box = page.querySelector("#paidBox");
  box.innerHTML = ROSTER_IDS.filter((memberId) => memberId !== payerId)
    .map((memberId) => {
      const share = Number(shares?.[memberId] || 0);
      const paidValue = Number(paid?.[memberId] || 0);
      const due = Math.max(share - paidValue, 0);
      return `
        <div class="col-12 col-md-6 paidRow rent-member-row" data-id="${memberId}">
          <div class="d-flex justify-content-between align-items-start gap-2">
            ${renderMemberChip({ memberId, label: nameOf(memberId) })}
            <div class="text-end">
              ${rentStatusChip(share, paidValue)}
              <div class="text-secondary small paidInfo mt-2">${rowInfoHtml(share, due)}</div>
            </div>
          </div>
          <input class="form-control paidInput" data-id="${memberId}" value="${paidValue}" placeholder="Đã chuyển" />
          <div class="form-text">Nhập số tiền ${nameOf(memberId)} đã chuyển cho ${nameOf(payerId)} trong tháng này.</div>
        </div>
      `;
    })
    .join("");
}
