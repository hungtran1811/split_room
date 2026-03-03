import { logout } from "../../services/auth.service";
import {
  getSelectedPeriod,
  setSelectedPeriod,
  state,
  subscribeSelectedPeriod,
} from "../../core/state";
import { ROSTER_IDS, nameOf } from "../../config/roster";
import { formatVND } from "../../config/i18n";
import { showToast } from "../components/toast";
import { renderAppShell } from "../layout/app-shell";
import { mountPrimaryNav } from "../layout/navbar";
import { renderMoneyStatCard } from "../components/moneyStatCard";
import { renderSectionHeader } from "../components/sectionHeader";
import {
  buildEqualShares,
  clampNonNegative,
  computeRentCosts,
  parseIntSafe,
  parseVndInt,
  sumValues,
} from "../../domain/rent/compute";
import {
  clampPaidToShares,
  validateShares,
} from "../../domain/rent/validate";
import {
  getLatestRentBefore,
  getRentByPeriod,
  upsertRentByPeriod,
  watchRentByPeriod,
} from "../../services/rent.service";
import { getCurrentUserLabel } from "../../core/display-name";

let unsubscribeRent = null;

function byId(id) {
  return document.getElementById(id);
}

function emptyPaid() {
  return Object.fromEntries(ROSTER_IDS.map((memberId) => [memberId, 0]));
}

function emptyRentDoc(period, payerId) {
  return {
    period,
    payerId,
    items: { rent: 0, wifi: 0, other: 0 },
    total: 0,
    headcount: 0,
    water: { unitPrice: 0, mode: "perPerson" },
    electric: { oldKwh: 0, newKwh: 0, unitPrice: 0 },
    computed: { waterCost: 0, kwhUsed: 0, electricCost: 0 },
    splitMode: "equal",
    shares: buildEqualShares(0, ROSTER_IDS),
    paid: emptyPaid(),
    note: "",
  };
}

function rowInfoHtml(share, due) {
  return `Phải đóng: ${formatVND(share)} • Còn thiếu: <b>${formatVND(due)}</b>`;
}

export async function renderRentPage() {
  if (!state.user || !state.groupId) return;

  const groupId = state.groupId;
  const payerId = "hung";
  const canEdit = state.canOperateMonth;
  const app = document.querySelector("#app");
  const currentUserLabel = getCurrentUserLabel(state);
  const initialPeriod = getSelectedPeriod();

  app.innerHTML = renderAppShell({
    pageId: "rent",
    title: "Tiền nhà",
    subtitle: "Theo dõi thu tiền trong tháng",
    meta: [
      `Người trả chủ nhà: ${nameOf(payerId)}`,
      `Đăng nhập: ${currentUserLabel}`,
      `Nhóm: ${groupId}`,
    ],
    showPeriodFilter: true,
    period: initialPeriod,
    content: `
      <section class="money-grid money-grid--3">
        ${renderMoneyStatCard({
          label: "Tổng tiền nhà",
          value: '<span id="rentTotalStrip">0 đ</span>',
          tone: "warning",
          size: "lg",
        })}
        ${renderMoneyStatCard({
          label: "Đã thu",
          value: '<span id="collectedStrip">0 đ</span>',
          tone: "positive",
          size: "lg",
        })}
        ${renderMoneyStatCard({
          label: "Còn thiếu",
          value: '<span id="totalDueStrip">0 đ</span>',
          tone: "danger",
          size: "lg",
        })}
      </section>

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
                  ${renderMoneyStatCard({
                    label: "Tổng tiền nhà",
                    value: '<span id="rentTotal">0 đ</span>',
                    tone: "warning",
                  })}
                  ${renderMoneyStatCard({
                    label: "Tiền nước",
                    value: '<span id="waterCostCard">0 đ</span>',
                    tone: "neutral",
                  })}
                  ${renderMoneyStatCard({
                    label: "Tiền điện",
                    value: '<span id="elecCostCard">0 đ</span>',
                    tone: "neutral",
                  })}
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
              ${renderMoneyStatCard({
                label: "Tổng phần chia",
                value: '<span id="sharesSum">0 đ</span>',
                tone: "neutral",
              })}
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
              ${renderMoneyStatCard({
                label: "Đã thu từ mọi người",
                value: '<span id="collected">0 đ</span>',
                tone: "positive",
              })}
              ${renderMoneyStatCard({
                label: `${nameOf(payerId)} đang gánh`,
                value: '<span id="payerBurden">0 đ</span>',
                tone: "warning",
              })}
              ${renderMoneyStatCard({
                label: "Còn thiếu",
                value: '<span id="totalDue">0 đ</span>',
                tone: "danger",
              })}
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
    `,
  });

  mountPrimaryNav({
    active: "rent",
    isOwner: state.isOwner,
    includeLogout: true,
    onLogout: async () => {
      await logout();
    },
    userLabel: currentUserLabel,
  });

  const page = app.querySelector('[data-page="rent"]');
  const periodPicker = byId("globalPeriodPicker");
  let period = initialPeriod;
  let liveDoc = null;
  let prefilledPeriod = null;

  function setEditable(enabled) {
    page
      .querySelectorAll("#rentEditableArea input, #rentEditableArea button")
      .forEach((element) => {
        element.disabled = !enabled;
      });

    if (periodPicker) {
      periodPicker.disabled = false;
      periodPicker.value = period;
    }

    if (!enabled) {
      byId("rentMsg").textContent = "Chỉ người vận hành tháng mới được sửa tiền nhà.";
      return;
    }

    byId("rentMsg").textContent = "";
  }

  function readItems() {
    return {
      rent: parseVndInt(byId("it_rent").value),
      wifi: parseVndInt(byId("it_wifi").value),
      other: parseVndInt(byId("it_other").value),
    };
  }

  function readMeta() {
    return {
      headcount: clampNonNegative(parseIntSafe(byId("headcount").value || 0)),
      water: {
        unitPrice: clampNonNegative(parseVndInt(byId("waterUnit").value || 0)),
        mode: "perPerson",
      },
      electric: {
        oldKwh: clampNonNegative(parseIntSafe(byId("elecOld").value || 0)),
        newKwh: clampNonNegative(parseIntSafe(byId("elecNew").value || 0)),
        unitPrice: clampNonNegative(parseVndInt(byId("elecUnit").value || 0)),
      },
    };
  }

  function readShares() {
    const shares = {};
    page.querySelectorAll(".shareInput").forEach((input) => {
      shares[input.dataset.id] = parseVndInt(input.value);
    });
    return shares;
  }

  function readPaid() {
    const paid = {};
    page.querySelectorAll(".paidInput").forEach((input) => {
      paid[input.dataset.id] = parseVndInt(input.value);
    });
    paid[payerId] = 0;
    return paid;
  }

  function updateComputedText(computed) {
    byId("waterCostTxt").textContent = formatVND(computed.waterCost);
    byId("waterCostCard").textContent = formatVND(computed.waterCost);
    byId("kwhUsedTxt").textContent = String(computed.kwhUsed);
    byId("elecCostTxt").textContent = formatVND(computed.electricCost);
    byId("elecCostCard").textContent = formatVND(computed.electricCost);
    byId("rentTotal").textContent = formatVND(computed.total);
    byId("rentTotalStrip").textContent = formatVND(computed.total);
  }

  function updateRentMetaUi(docData) {
    const updatedAt = docData?.updatedAt?.toDate
      ? docData.updatedAt.toDate().toLocaleString("vi-VN")
      : docData?.updatedAt || "Chưa có";
    byId("rentUpdated").textContent = String(updatedAt);
  }

  function renderShareInputs(total, equal, shares) {
    const box = byId("sharesBox");
    const equalShares = buildEqualShares(total, ROSTER_IDS);
    box.innerHTML = ROSTER_IDS.map((memberId) => {
      const value = equal
        ? equalShares[memberId]
        : Number(shares?.[memberId] ?? equalShares[memberId] ?? 0);
      return `
        <div class="col-6 col-md-3">
          <label class="form-label">${nameOf(memberId)}</label>
          <input
            class="form-control shareInput"
            data-id="${memberId}"
            value="${value}"
            ${equal ? "disabled" : ""}
          />
        </div>
      `;
    }).join("");
  }

  function renderPaidInputs(shares, paid) {
    const box = byId("paidBox");
    box.innerHTML = ROSTER_IDS.filter((memberId) => memberId !== payerId)
      .map((memberId) => {
        const share = Number(shares?.[memberId] || 0);
        const paidValue = Number(paid?.[memberId] || 0);
        const due = Math.max(share - paidValue, 0);

        return `
          <div class="col-12 col-md-6 paidRow" data-id="${memberId}">
            <div class="d-flex justify-content-between">
              <div class="fw-semibold">${nameOf(memberId)}</div>
              <div class="text-secondary small paidInfo">${rowInfoHtml(
                share,
                due,
              )}</div>
            </div>
            <input
              class="form-control paidInput"
              data-id="${memberId}"
              value="${paidValue}"
              placeholder="Đã chuyển"
            />
            <div class="form-text">
              Nhập số tiền ${nameOf(memberId)} đã chuyển cho ${nameOf(
                payerId,
              )} trong tháng này.
            </div>
          </div>
        `;
      })
      .join("");
  }

  function syncPaidRows(shares, paid) {
    ROSTER_IDS.filter((memberId) => memberId !== payerId).forEach((memberId) => {
      const row = page.querySelector(`.paidRow[data-id="${memberId}"]`);
      if (!row) return;

      const share = Number(shares?.[memberId] || 0);
      const paidValue = Number(paid?.[memberId] || 0);
      const due = Math.max(share - paidValue, 0);
      const info = row.querySelector(".paidInfo");
      if (info) info.innerHTML = rowInfoHtml(share, due);

      const input = row.querySelector(".paidInput");
      if (input && input.value !== String(paidValue)) {
        input.value = String(paidValue);
      }
    });
  }

  function collectSnapshot() {
    const items = readItems();
    const meta = readMeta();
    const legacyFallback = {
      waterCost: Number(liveDoc?.items?.water || 0),
      electricCost: Number(liveDoc?.items?.electric || 0),
    };
    const computed = computeRentCosts(items, meta, legacyFallback);
    const total = computed.total;
    const equal = byId("splitEqual").checked;
    const shares = equal ? buildEqualShares(total, ROSTER_IDS) : readShares();
    const paid = clampPaidToShares(readPaid(), shares);
    const shareError = validateShares(total, shares);

    return {
      items,
      meta,
      computed,
      total,
      equal,
      shares,
      paid,
      shareError,
    };
  }

  function syncSummary(snapshot, { rerenderPaid = false } = {}) {
    const { total, equal, shares, paid, shareError } = snapshot;
    const finalShares = equal ? buildEqualShares(total, ROSTER_IDS) : shares;
    const collected = sumValues(
      Object.fromEntries(
        Object.entries(paid).filter(([memberId]) => memberId !== payerId),
      ),
    );
    const payerBurden = Math.max(total - collected, 0);
    const totalDue = ROSTER_IDS.filter((memberId) => memberId !== payerId)
      .reduce((sum, memberId) => {
        return (
          sum +
          Math.max(
            Number(finalShares[memberId] || 0) - Number(paid[memberId] || 0),
            0,
          )
        );
      }, 0);

    byId("sharesSum").textContent = formatVND(sumValues(finalShares));
    byId("sharesErr").textContent = shareError
      ? `Tổng phần chia (${formatVND(sumValues(finalShares))}) phải bằng Tổng tiền (${formatVND(total)}).`
      : "";
    byId("collected").textContent = formatVND(collected);
    byId("collectedStrip").textContent = formatVND(collected);
    byId("payerBurden").textContent = formatVND(payerBurden);
    byId("totalDue").textContent = formatVND(totalDue);
    byId("totalDueStrip").textContent = formatVND(totalDue);

    if (rerenderPaid) {
      renderPaidInputs(finalShares, paid);
    } else {
      syncPaidRows(finalShares, paid);
    }
  }

  function onItemsChanged() {
    const snapshot = collectSnapshot();
    updateComputedText(snapshot.computed);
    renderShareInputs(snapshot.total, snapshot.equal, snapshot.shares);
    syncSummary(snapshot, { rerenderPaid: true });
  }

  function hydrateUI(docData) {
    const normalized = docData || emptyRentDoc(period, payerId);
    const items = normalized.items || { rent: 0, wifi: 0, other: 0 };

    byId("it_rent").value = String(items.rent ?? 0);
    byId("it_wifi").value = String(items.wifi ?? 0);
    byId("it_other").value = String(items.other ?? 0);
    byId("headcount").value = String(normalized.headcount ?? 0);
    byId("waterUnit").value = String(normalized.water?.unitPrice ?? 0);
    byId("elecOld").value = String(normalized.electric?.oldKwh ?? 0);
    byId("elecNew").value = String(normalized.electric?.newKwh ?? 0);
    byId("elecUnit").value = String(normalized.electric?.unitPrice ?? 0);
    byId("rentNote").value = normalized.note || "";
    byId("splitEqual").checked = (normalized.splitMode || "equal") === "equal";

    const legacyFallback = {
      waterCost: Number(normalized?.items?.water || 0),
      electricCost: Number(normalized?.items?.electric || 0),
    };
    const computed = computeRentCosts(
      items,
      {
        headcount: Number(normalized.headcount || 0),
        water: normalized.water || { unitPrice: 0, mode: "perPerson" },
        electric:
          normalized.electric || { oldKwh: 0, newKwh: 0, unitPrice: 0 },
      },
      legacyFallback,
    );
    const total = Number(normalized.total ?? computed.total);
    const shares = normalized.shares || buildEqualShares(total, ROSTER_IDS);
    const paid = normalized.paid || emptyPaid();

    updateComputedText({ ...computed, total });
    renderShareInputs(total, byId("splitEqual").checked, shares);
    renderPaidInputs(
      byId("splitEqual").checked ? buildEqualShares(total, ROSTER_IDS) : shares,
      paid,
    );
    updateRentMetaUi(normalized);
    syncSummary({
      total,
      equal: byId("splitEqual").checked,
      shares,
      paid,
      shareError: validateShares(total, shares),
      computed: { ...computed, total },
    });
  }

  async function prefillIfMissing(targetPeriod) {
    const current = await getRentByPeriod(groupId, targetPeriod);
    if (current) return false;

    const previous = await getLatestRentBefore(groupId, targetPeriod);
    if (!previous) return false;

    const next = {
      ...previous,
      period: targetPeriod,
      note: "",
      paid: emptyPaid(),
    };

    hydrateUI(next);

    const previousNewKwh = Number(previous?.electric?.newKwh ?? 0);
    if (Number.isFinite(previousNewKwh) && previousNewKwh > 0) {
      byId("elecOld").value = String(previousNewKwh);
      byId("elecNew").value = String(previousNewKwh);
    }

    prefilledPeriod = targetPeriod;
    onItemsChanged();
    return true;
  }

  async function saveRent() {
    if (!canEdit) return;

    byId("rentMsg").textContent = "";

    const snapshot = collectSnapshot();
    if (snapshot.shareError) {
      byId("sharesErr").textContent = `Tổng phần chia (${formatVND(sumValues(snapshot.shares))}) phải bằng Tổng tiền (${formatVND(snapshot.total)}).`;
      return;
    }

    const payload = {
      payerId,
      items: snapshot.items,
      total: snapshot.total,
      headcount: snapshot.meta.headcount,
      water: snapshot.meta.water,
      electric: snapshot.meta.electric,
      computed: {
        waterCost: snapshot.computed.waterCost,
        kwhUsed: snapshot.computed.kwhUsed,
        electricCost: snapshot.computed.electricCost,
      },
      splitMode: snapshot.equal ? "equal" : "custom",
      shares: snapshot.equal
        ? buildEqualShares(snapshot.total, ROSTER_IDS)
        : snapshot.shares,
      paid: snapshot.paid,
      note: byId("rentNote").value.trim(),
      createdBy: liveDoc?.createdBy || state.user.uid,
    };

    const saveButton = byId("btnSaveRent");
    saveButton.disabled = true;

    try {
      await upsertRentByPeriod(groupId, period, payload);
      showToast({
        title: "Thành công",
        message: "Đã lưu tiền nhà.",
        variant: "success",
      });
    } catch (error) {
      console.error(error);
      byId("rentMsg").textContent = error?.message || "Không thể lưu.";
      showToast({
        title: "Thất bại",
        message: error?.message || "Không thể lưu.",
        variant: "danger",
      });
    } finally {
      saveButton.disabled = !canEdit;
    }
  }

  function bindInputEvents() {
    [
      "it_rent",
      "it_wifi",
      "it_other",
      "headcount",
      "waterUnit",
      "elecOld",
      "elecNew",
      "elecUnit",
    ].forEach((id) => {
      byId(id)?.addEventListener("input", onItemsChanged);
    });

    byId("splitEqual").addEventListener("change", () => {
      onItemsChanged();
    });

    page.addEventListener("input", (event) => {
      if (event.target?.classList?.contains("shareInput")) {
        const snapshot = collectSnapshot();
        syncSummary(snapshot, { rerenderPaid: true });
      }

      if (event.target?.classList?.contains("paidInput")) {
        const snapshot = collectSnapshot();
        syncSummary(snapshot);
      }
    });
  }

  function startWatch() {
    if (unsubscribeRent) {
      unsubscribeRent();
      unsubscribeRent = null;
    }

    unsubscribeRent = watchRentByPeriod(groupId, period, (docData) => {
      liveDoc = docData;
      if (!document.body.contains(page)) return;

      if (!docData) {
        if (prefilledPeriod === period) return;

        prefillIfMissing(period).then((applied) => {
          if (applied) return;
          hydrateUI(emptyRentDoc(period, payerId));
        });
        return;
      }

      hydrateUI(docData);
    });
  }

  bindInputEvents();
  setEditable(canEdit);

  byId("btnSaveRent").addEventListener("click", async () => {
    await saveRent();
  });

  byId("btnClearPaid").addEventListener("click", () => {
    if (!canEdit) return;
    page.querySelectorAll(".paidInput").forEach((input) => {
      input.value = "0";
    });
    syncSummary(collectSnapshot());
    showToast({
      title: "Đã clear",
      message: "Đã reset phần đã chuyển về 0 (chưa lưu).",
      variant: "success",
    });
  });

  periodPicker?.addEventListener("change", (event) => {
    setSelectedPeriod(event.target.value);
  });

  startWatch();

  const unsubscribeSelectedPeriod = subscribeSelectedPeriod((nextPeriod) => {
    if (nextPeriod === period) return;
    period = nextPeriod;
    prefilledPeriod = null;
    if (periodPicker && periodPicker.value !== nextPeriod) {
      periodPicker.value = nextPeriod;
    }
    startWatch();
  });

  const onHashChange = () => {
    if (!location.hash.startsWith("#/rent")) {
      if (unsubscribeRent) {
        unsubscribeRent();
        unsubscribeRent = null;
      }
      unsubscribeSelectedPeriod();
      window.removeEventListener("hashchange", onHashChange);
    }
  };

  window.addEventListener("hashchange", onHashChange);
}
