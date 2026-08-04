import { state } from "../../../core/state";
import { formatVND } from "../../../config/i18n";
import { ROSTER_IDS } from "../../../config/roster";
import {
  buildEqualShares,
  clampNonNegative,
  computeRentCosts,
  parseIntSafe,
  parseVndInt,
  sumValues,
} from "../../../domain/rent/compute";
import { clampPaidToShares, validateShares } from "../../../domain/rent/validate";
import { getLatestRentBefore, getRentByPeriod, upsertRentByPeriod } from "../../../services/rent.service";
import { showToast } from "../../components/toast";
import {
  renderPaidInputs,
  renderRentCollectionRing,
  renderShareInputs,
  rowInfoHtml,
} from "./render";

function emptyPaid() {
  return Object.fromEntries(ROSTER_IDS.map((memberId) => [memberId, 0]));
}

export function emptyRentDoc(period, payerId) {
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

export function createRentFormController({
  page,
  groupId,
  payerId,
  canEdit,
  getPeriod,
  getLiveDoc,
  getPrefilledPeriod,
  setPrefilledPeriod,
}) {
  const byId = (id) => page.querySelector(`#${id}`);

  function setEditable(enabled) {
    page.querySelectorAll("#rentEditableArea input, #rentEditableArea button").forEach((element) => {
      element.disabled = !enabled;
    });
    const banner = byId("rentReadonlyBanner");
    if (banner) {
      banner.hidden = enabled;
      banner.style.display = enabled ? "none" : "";
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
      water: { unitPrice: clampNonNegative(parseVndInt(byId("waterUnit").value || 0)), mode: "perPerson" },
      electric: {
        oldKwh: clampNonNegative(parseIntSafe(byId("elecOld").value || 0)),
        newKwh: clampNonNegative(parseIntSafe(byId("elecNew").value || 0)),
        unitPrice: clampNonNegative(parseVndInt(byId("elecUnit").value || 0)),
      },
    };
  }

  function readShares() {
    return Object.fromEntries(
      [...page.querySelectorAll(".shareInput")].map((input) => [input.dataset.id, parseVndInt(input.value)]),
    );
  }

  function readPaid() {
    const paid = Object.fromEntries(
      [...page.querySelectorAll(".paidInput")].map((input) => [input.dataset.id, parseVndInt(input.value)]),
    );
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

  function syncPaidRows(shares, paid) {
    ROSTER_IDS.filter((memberId) => memberId !== payerId).forEach((memberId) => {
      const row = page.querySelector(`.paidRow[data-id="${memberId}"]`);
      if (!row) return;
      const share = Number(shares?.[memberId] || 0);
      const paidValue = Number(paid?.[memberId] || 0);
      const info = row.querySelector(".paidInfo");
      if (info) info.innerHTML = rowInfoHtml(share, Math.max(share - paidValue, 0));
      const input = row.querySelector(".paidInput");
      if (input && input.value !== String(paidValue)) input.value = String(paidValue);
    });
  }

  function collectSnapshot() {
    const items = readItems();
    const meta = readMeta();
    const liveDoc = getLiveDoc();
    const computed = computeRentCosts(items, meta, {
      waterCost: Number(liveDoc?.items?.water || 0),
      electricCost: Number(liveDoc?.items?.electric || 0),
    });
    const total = computed.total;
    const equal = byId("splitEqual").checked;
    const shares = equal ? buildEqualShares(total, ROSTER_IDS) : readShares();
    const paid = clampPaidToShares(readPaid(), shares);
    return { items, meta, computed, total, equal, shares, paid, shareError: validateShares(total, shares) };
  }

  function syncSummary(snapshot, { rerenderPaid = false } = {}) {
    const { total, equal, shares, paid, shareError } = snapshot;
    const finalShares = equal ? buildEqualShares(total, ROSTER_IDS) : shares;
    const collected = sumValues(Object.fromEntries(Object.entries(paid).filter(([memberId]) => memberId !== payerId)));
    const payerBurden = Math.max(total - collected, 0);
    const totalDue = ROSTER_IDS.filter((memberId) => memberId !== payerId).reduce(
      (sum, memberId) => sum + Math.max(Number(finalShares[memberId] || 0) - Number(paid[memberId] || 0), 0),
      0,
    );
    byId("sharesSum").textContent = formatVND(sumValues(finalShares));
    byId("sharesErr").textContent = shareError
      ? `Tổng phần chia (${formatVND(sumValues(finalShares))}) phải bằng Tổng tiền (${formatVND(total)}).`
      : "";
    byId("collected").textContent = formatVND(collected);
    byId("collectedStrip").textContent = formatVND(collected);
    byId("payerBurden").textContent = formatVND(payerBurden);
    byId("totalDue").textContent = formatVND(totalDue);
    byId("totalDueStrip").textContent = formatVND(totalDue);
    const expectedCollection = ROSTER_IDS.filter((memberId) => memberId !== payerId)
      .reduce((sum, memberId) => sum + Number(finalShares[memberId] || 0), 0);
    byId("rentRingHost").innerHTML = renderRentCollectionRing({ collected, expectedCollection });
    if (rerenderPaid) renderPaidInputs(page, payerId, finalShares, paid);
    else syncPaidRows(finalShares, paid);
  }

  function onItemsChanged() {
    const snapshot = collectSnapshot();
    updateComputedText(snapshot.computed);
    renderShareInputs(page, snapshot.total, snapshot.equal, snapshot.shares);
    syncSummary(snapshot, { rerenderPaid: true });
  }

  function hydrateUI(docData) {
    const normalized = docData || emptyRentDoc(getPeriod(), payerId);
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
    const computed = computeRentCosts(items, {
      headcount: Number(normalized.headcount || 0),
      water: normalized.water || { unitPrice: 0, mode: "perPerson" },
      electric: normalized.electric || { oldKwh: 0, newKwh: 0, unitPrice: 0 },
    }, {
      waterCost: Number(normalized?.items?.water || 0),
      electricCost: Number(normalized?.items?.electric || 0),
    });
    const total = Number(normalized.total ?? computed.total);
    const shares = normalized.shares || buildEqualShares(total, ROSTER_IDS);
    const paid = normalized.paid || emptyPaid();
    updateComputedText({ ...computed, total });
    renderShareInputs(page, total, byId("splitEqual").checked, shares);
    renderPaidInputs(page, payerId, byId("splitEqual").checked ? buildEqualShares(total, ROSTER_IDS) : shares, paid);
    updateRentMetaUi(normalized);
    syncSummary({ total, equal: byId("splitEqual").checked, shares, paid, shareError: validateShares(total, shares) });
  }

  async function prefillIfMissing(period) {
    const current = await getRentByPeriod(groupId, period);
    if (current) return false;
    const previous = await getLatestRentBefore(groupId, period);
    if (!previous) return false;
    const next = { ...previous, period, note: "", paid: emptyPaid() };
    hydrateUI(next);
    const previousNewKwh = Number(previous?.electric?.newKwh ?? 0);
    if (Number.isFinite(previousNewKwh) && previousNewKwh > 0) {
      byId("elecOld").value = String(previousNewKwh);
      byId("elecNew").value = String(previousNewKwh);
    }
    setPrefilledPeriod(period);
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
      payerId, items: snapshot.items, total: snapshot.total, headcount: snapshot.meta.headcount,
      water: snapshot.meta.water, electric: snapshot.meta.electric,
      computed: { waterCost: snapshot.computed.waterCost, kwhUsed: snapshot.computed.kwhUsed, electricCost: snapshot.computed.electricCost },
      splitMode: snapshot.equal ? "equal" : "custom",
      shares: snapshot.equal ? buildEqualShares(snapshot.total, ROSTER_IDS) : snapshot.shares,
      paid: snapshot.paid, note: byId("rentNote").value.trim(),
      createdBy: getLiveDoc()?.createdBy || state.user.uid,
    };
    const saveButton = byId("btnSaveRent");
    saveButton.disabled = true;
    try {
      await upsertRentByPeriod(groupId, getPeriod(), payload);
      showToast({ title: "Thành công", message: "Đã lưu tiền nhà.", variant: "success" });
    } catch (error) {
      console.error(error);
      byId("rentMsg").textContent = error?.message || "Không thể lưu.";
      showToast({ title: "Thất bại", message: error?.message || "Không thể lưu.", variant: "danger" });
    } finally {
      saveButton.disabled = !canEdit;
    }
  }

  function bindInputEvents() {
    ["it_rent", "it_wifi", "it_other", "headcount", "waterUnit", "elecOld", "elecNew", "elecUnit"]
      .forEach((id) => byId(id)?.addEventListener("input", onItemsChanged));
    byId("splitEqual").addEventListener("change", onItemsChanged);
    page.addEventListener("input", (event) => {
      if (event.target?.classList?.contains("shareInput")) syncSummary(collectSnapshot(), { rerenderPaid: true });
      if (event.target?.classList?.contains("paidInput")) syncSummary(collectSnapshot());
    });
  }

  function bindActions() {
    setEditable(canEdit);
    byId("btnSaveRent").addEventListener("click", () => void saveRent());
    byId("btnClearPaid").addEventListener("click", () => {
      if (!canEdit) return;
      page.querySelectorAll(".paidInput").forEach((input) => { input.value = "0"; });
      syncSummary(collectSnapshot());
      showToast({ title: "Đã clear", message: "Đã reset phần đã chuyển về 0 (chưa lưu).", variant: "success" });
    });
    bindInputEvents();
  }

  return { bindActions, hydrateUI, prefillIfMissing, isPrefilled: (period) => getPrefilledPeriod() === period };
}
