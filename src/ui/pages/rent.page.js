import { state } from "../../core/state";
import { ROSTER_IDS, nameOf } from "../../config/roster";
import { formatVND } from "../../config/i18n";
import { showToast } from "../components/toast";
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
    status: "draft",
    finalizedAt: null,
    finalizedBy: null,
  };
}

function statusMeta(status) {
  if (status === "finalized") {
    return {
      badgeClass: "bg-success",
      badgeText: "ĐÃ CHỐT",
      hint: "Tháng này đã được chốt.",
      toggleText: "Mở chốt",
      toggleVariant: "btn-outline-warning",
    };
  }

  return {
    badgeClass: "bg-secondary",
    badgeText: "NHÁP",
    hint: "Tháng này đang ở trạng thái nhập.",
    toggleText: "Chốt tháng",
    toggleVariant: "btn-outline-success",
  };
}

function rowInfoHtml(share, due) {
  return `Phải đóng: ${formatVND(share)} • Còn thiếu: <b>${formatVND(due)}</b>`;
}

export async function renderRentPage() {
  if (!state.user || !state.groupId) return;

  const groupId = state.groupId;
  const payerId = "hung";
  const canEdit = state.isAdmin;
  const app = document.querySelector("#app");

  app.innerHTML = `
    <div class="container py-4" style="max-width: 980px;" data-page="rent">
      <div class="d-flex justify-content-between align-items-center mb-3">
        <div>
          <h1 class="h4 mb-1">Tiền nhà</h1>
          <div class="text-secondary small">Người trả chủ nhà: <b>${nameOf(payerId)}</b></div>
        </div>
        <div class="d-flex gap-2">
          <a class="btn btn-outline-secondary btn-sm" href="#/dashboard">← Về Dashboard</a>
        </div>
      </div>

      <div class="row g-2 align-items-end mb-3">
        <div class="col-6 col-md-4">
          <label class="form-label small mb-1">Chọn tháng</label>
          <input id="rentPeriod" type="month" class="form-control" />
        </div>
        <div class="col-6 col-md-4">
          <div class="small text-secondary mb-1">Trạng thái</div>
          <div class="d-flex align-items-center gap-2">
            <span id="rentStatusBadge" class="badge bg-secondary">NHÁP</span>
            <span id="rentStatusHint" class="small text-secondary"></span>
          </div>
        </div>
      </div>

      <div id="rentEditableArea" class="row g-3">
        <div class="col-12 col-lg-6">
          <div class="card" id="rentFormCard">
            <div class="card-header">1) Khoản tiền tháng này</div>
            <div class="card-body">
              <div class="row g-2">
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

                <hr class="my-2" />

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
                <div class="col-12 mt-2">
                  <div class="d-flex justify-content-between">
                    <span class="text-secondary">Tổng</span>
                    <span class="fw-semibold" id="rentTotal">0 đ</span>
                  </div>
                </div>
                <div class="col-12">
                  <label class="form-label">Ghi chú</label>
                  <input id="rentNote" class="form-control" placeholder="VD: Tiền nhà tháng này" />
                </div>
              </div>
            </div>
          </div>
        </div>

        <div class="col-12 col-lg-6">
          <div class="card" id="rentShareCard">
            <div class="card-header d-flex justify-content-between align-items-center">
              <div>2) Chia tiền</div>
              <div class="form-check">
                <input class="form-check-input" type="checkbox" id="splitEqual" checked>
                <label class="form-check-label" for="splitEqual">Chia đều</label>
              </div>
            </div>
            <div class="card-body">
              <div id="sharesBox" class="row g-2"></div>
              <div class="mt-2">
                <div class="d-flex justify-content-between small">
                  <span class="text-secondary">Tổng phần chia</span>
                  <span class="fw-semibold" id="sharesSum">0 đ</span>
                </div>
                <div class="small text-danger" id="sharesErr" style="min-height:18px;"></div>
              </div>
            </div>
          </div>
        </div>

        <div class="col-12">
          <div class="card" id="rentPaidCard">
            <div class="card-header">3) Mọi người đã chuyển cho ${nameOf(
              payerId,
            )} bao nhiêu</div>
            <div class="card-body">
              <div id="paidBox" class="row g-2"></div>
              <hr class="my-3" />
              <div class="row g-2">
                <div class="col-md-3">
                  <div class="text-secondary small">Đã thu từ mọi người</div>
                  <div class="fw-semibold" id="collected">0 đ</div>
                </div>
                <div class="col-md-3">
                  <div class="text-secondary small">${nameOf(
                    payerId,
                  )} đang gánh</div>
                  <div class="fw-semibold" id="payerBurden">0 đ</div>
                </div>
                <div class="col-md-3">
                  <div class="text-secondary small">Còn thiếu (tổng)</div>
                  <div class="fw-semibold" id="totalDue">0 đ</div>
                </div>
                <div class="col-md-3">
                  <div class="text-secondary small">Cập nhật cuối</div>
                  <div class="fw-semibold small" id="rentUpdated">Chưa có</div>
                </div>
              </div>
              <div class="d-flex flex-wrap gap-2 mt-3">
                <button id="btnSaveRent" type="button" class="btn btn-primary">Lưu</button>
                <button id="btnToggleFinalize" type="button" class="btn btn-outline-success">Chốt tháng</button>
                <button id="btnClearPaid" type="button" class="btn btn-outline-secondary">Clear đã chuyển</button>
                <div class="small text-danger align-self-center" id="rentMsg"></div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;

  const page = app.querySelector('[data-page="rent"]');
  const periodEl = byId("rentPeriod");
  let period = currentPeriod();
  let liveDoc = null;
  let prefilledPeriod = null;

  periodEl.value = period;

  function setEditable(enabled) {
    page
      .querySelectorAll("#rentEditableArea input, #rentEditableArea button")
      .forEach((element) => {
        element.disabled = !enabled;
      });

    periodEl.disabled = false;

    if (!enabled) {
      byId("rentMsg").textContent = "Chỉ admin mới được sửa tiền nhà.";
    }
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
    byId("kwhUsedTxt").textContent = String(computed.kwhUsed);
    byId("elecCostTxt").textContent = formatVND(computed.electricCost);
    byId("rentTotal").textContent = formatVND(computed.total);
  }

  function updateStatusUi(docData) {
    const meta = statusMeta(docData?.status || "draft");
    byId("rentStatusBadge").className = `badge ${meta.badgeClass}`;
    byId("rentStatusBadge").textContent = meta.badgeText;
    byId("rentStatusHint").textContent = meta.hint;
    byId("btnToggleFinalize").className = `btn ${meta.toggleVariant}`;
    byId("btnToggleFinalize").textContent = meta.toggleText;

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
    byId("payerBurden").textContent = formatVND(payerBurden);
    byId("totalDue").textContent = formatVND(totalDue);

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
    updateStatusUi(normalized);
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
      status: "draft",
      finalizedAt: null,
      finalizedBy: null,
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

  async function saveRent(statusOverride = null) {
    if (!canEdit) return;

    byId("rentMsg").textContent = "";

    const snapshot = collectSnapshot();
    if (snapshot.shareError) {
      byId("sharesErr").textContent = `Tổng phần chia (${formatVND(sumValues(snapshot.shares))}) phải bằng Tổng tiền (${formatVND(snapshot.total)}).`;
      return;
    }

    const targetStatus = statusOverride || liveDoc?.status || "draft";
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
      status: targetStatus,
      finalizedAt:
        targetStatus === "finalized"
          ? liveDoc?.finalizedAt || new Date().toISOString()
          : null,
      finalizedBy:
        targetStatus === "finalized"
          ? liveDoc?.finalizedBy || state.user.uid
          : null,
    };

    const saveButton = byId("btnSaveRent");
    const toggleButton = byId("btnToggleFinalize");
    saveButton.disabled = true;
    toggleButton.disabled = true;

    try {
      await upsertRentByPeriod(groupId, period, payload);
      showToast({
        title: "Thành công",
        message:
          targetStatus === "finalized"
            ? "Đã lưu và chốt tháng."
            : "Đã lưu tiền nhà.",
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
      toggleButton.disabled = !canEdit;
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

  byId("btnToggleFinalize").addEventListener("click", async () => {
    const nextStatus =
      liveDoc?.status === "finalized" ? "draft" : "finalized";
    await saveRent(nextStatus);
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

  periodEl.addEventListener("change", async (event) => {
    period = event.target.value || currentPeriod();
    prefilledPeriod = null;
    await prefillIfMissing(period);
    startWatch();
  });

  startWatch();

  const onHashChange = () => {
    if (!location.hash.startsWith("#/rent")) {
      if (unsubscribeRent) {
        unsubscribeRent();
        unsubscribeRent = null;
      }
      window.removeEventListener("hashchange", onHashChange);
    }
  };

  window.addEventListener("hashchange", onHashChange);
}
