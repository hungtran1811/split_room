// src/ui/pages/rent.page.js
import { state } from "../../core/state";
import { isAdmin } from "../../core/roles";
import { ROSTER, ROSTER_IDS, nameOf } from "../../config/roster";
import { formatVND } from "../../config/i18n";
import { showToast } from "../components/toast";

import {
  upsertRentByPeriod,
  watchRentByPeriod,
} from "../../services/rent.service";
import {
  getRentByPeriod,
  getLatestRentBefore,
} from "../../services/rent.service";

function $(id) {
  return document.getElementById(id);
}

function currentPeriod() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

// integer VND: chấp nhận 10.000 / 10000 / 10.000,5 -> làm tròn về đồng
function parseVndInt(s) {
  if (s === null || s === undefined) return 0;
  let x = String(s).trim();
  if (!x) return 0;
  x = x.replace(/[₫đ\s]/gi, "");

  if (x.includes(".") && x.includes(",")) {
    x = x.replaceAll(".", "").replace(",", ".");
  } else {
    if (x.includes(",")) x = x.replace(",", ".");
    const dots = (x.match(/\./g) || []).length;
    if (dots >= 2) x = x.replaceAll(".", "");
  }

  const n = Number(x);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n); // ✅ integer đồng
}

function parseIntSafe(v) {
  const n = parseVndInt(v);
  return Number.isFinite(n) ? n : 0;
}

function clampNonNegative(n) {
  n = Number(n || 0);
  return Number.isFinite(n) ? Math.max(0, n) : 0;
}

function sumObj(obj) {
  return Object.values(obj || {}).reduce((a, b) => a + Number(b || 0), 0);
}

function buildEqualShares(total, ids) {
  const n = ids.length || 1;
  const base = Math.floor(total / n);
  let rem = total - base * n;

  const shares = {};
  for (const id of ids) {
    shares[id] = base + (rem > 0 ? 1 : 0);
    if (rem > 0) rem--;
  }
  return shares;
}

let _unsubRent = null;

export async function renderRentPage() {
  if (!state.user) return;
  const groupId = state.groupId;
  if (!groupId) return;

  const payerId = "hung"; // ✅ bạn là người trả chủ nhà
  const admin = isAdmin(state.user);

  const app = document.querySelector("#app");
  app.innerHTML = `
    <div class="container py-4" style="max-width: 980px;">
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
      </div>

      <div class="row g-3">
        <!-- Card 1: items -->
        <div class="col-12 col-lg-6">
          <div class="card">
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
                    <span class="fw-semibold" id="waterCostTxt">0 ₫</span>
                </div>
                </div>

                <hr class="my-2"/>

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
                    <span class="fw-semibold" id="elecCostTxt">0 ₫</span>
                </div>
                </div>

                <div class="col-6">
                  <label class="form-label">Wifi</label>
                  <input id="it_wifi" class="form-control" placeholder="VD: 250000" />
                </div>
                <div class="col-12">
                  <label class="form-label">Khác</label>
                  <input id="it_other" class="form-control" placeholder="0" />
                </div>

                <div class="col-12 mt-2">
                  <div class="d-flex justify-content-between">
                    <span class="text-secondary">Tổng</span>
                    <span class="fw-semibold" id="rentTotal">0 ₫</span>
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

        <!-- Card 2: shares -->
        <div class="col-12 col-lg-6">
          <div class="card">
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
                  <span class="fw-semibold" id="sharesSum">0 ₫</span>
                </div>
                <div class="small text-danger" id="sharesErr" style="min-height:18px;"></div>
              </div>
            </div>
          </div>
        </div>

        <!-- Card 3: paid -->
        <div class="col-12">
          <div class="card">
            <div class="card-header">3) Mọi người đã chuyển cho ${nameOf(payerId)} bao nhiêu</div>
            <div class="card-body">
              <div id="paidBox" class="row g-2"></div>

              <hr class="my-3"/>

              <div class="row g-2">
                <div class="col-md-4">
                  <div class="text-secondary small">Đã thu từ mọi người</div>
                  <div class="fw-semibold" id="collected">0 ₫</div>
                </div>
                <div class="col-md-4">
                  <div class="text-secondary small">${nameOf(payerId)} đang gánh</div>
                  <div class="fw-semibold" id="payerBurden">0 ₫</div>
                </div>
                <div class="col-md-4">
                  <div class="text-secondary small">Còn thiếu (tổng)</div>
                  <div class="fw-semibold" id="totalDue">0 ₫</div>
                </div>
              </div>

              <div class="d-flex gap-2 mt-3">
                <button id="btnSaveRent" type="button" class="btn btn-primary">Lưu</button>
                <button id="btnClearPaid" class="btn btn-outline-secondary">Clear đã chuyển</button>
                <div class="small text-danger align-self-center" id="rentMsg"></div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;

  const periodEl = $("rentPeriod");
  let period = currentPeriod();
  periodEl.value = period;

  let liveDoc = null;
  let _prefillAppliedForPeriod = null; // period đã prefill để tránh watcher đè về 0

  const readItems = () => ({
    rent: parseVndInt($("it_rent").value),
    wifi: parseVndInt($("it_wifi").value),
    other: parseVndInt($("it_other").value),

    // ✅ NET + TRASH: file bạn hiện tại chưa có input nên mình không thêm.
    // Nếu bản local có: net: parseVndInt($("it_net").value), trash: parseVndInt($("it_trash").value),
  });

  const readMeta = () => ({
    headcount: clampNonNegative(parseIntSafe($("headcount")?.value || 0)),
    water: {
      unitPrice: clampNonNegative(parseVndInt($("waterUnit")?.value || 0)),
      mode: "perPerson",
    },
    electric: {
      oldKwh: clampNonNegative(parseIntSafe($("elecOld")?.value || 0)),
      newKwh: clampNonNegative(parseIntSafe($("elecNew")?.value || 0)),
      unitPrice: clampNonNegative(parseVndInt($("elecUnit")?.value || 0)),
    },
  });

  function computeCosts(items, meta, legacyFallback = null) {
    const headcount = meta.headcount || 0;

    // fallback legacy (nếu doc cũ còn lưu it_water/it_electric dạng tiền)
    const legacyWater = Number(legacyFallback?.waterCost || 0);
    const legacyElec = Number(legacyFallback?.electricCost || 0);

    const waterCost = meta.water?.unitPrice
      ? meta.water.unitPrice * headcount
      : legacyWater;

    const oldKwh = meta.electric?.oldKwh || 0;
    const newKwh = meta.electric?.newKwh || 0;
    const unit = meta.electric?.unitPrice || 0;

    const kwhUsed = meta.electric?.unitPrice ? Math.max(newKwh - oldKwh, 0) : 0;
    const electricCost = meta.electric?.unitPrice ? kwhUsed * unit : legacyElec;

    const total = sumObj(items) + waterCost + electricCost;

    return { waterCost, kwhUsed, electricCost, total };
  }

  const readShares = () => {
    const shares = {};
    document.querySelectorAll(".shareInput").forEach((el) => {
      const id = el.dataset.id;
      shares[id] = parseVndInt(el.value);
    });
    return shares;
  };

  const readPaid = () => {
    const paid = {};
    document.querySelectorAll(".paidInput").forEach((el) => {
      const id = el.dataset.id;
      paid[id] = parseVndInt(el.value);
    });
    paid[payerId] = 0; // payer không chuyển cho chính mình
    return paid;
  };

  const renderSharesInputs = ({ total, equal, shares }) => {
    const box = $("sharesBox");
    box.innerHTML = "";

    const ids = ROSTER_IDS;
    const eqShares = buildEqualShares(total, ids);

    for (const id of ids) {
      const v = equal
        ? eqShares[id]
        : Number(shares?.[id] ?? eqShares[id] ?? 0);

      box.innerHTML += `
        <div class="col-6 col-md-3">
          <label class="form-label">${nameOf(id)}</label>
          <input class="form-control shareInput" data-id="${id}" value="${v}" ${equal ? "disabled" : ""}/>
        </div>
      `;
    }

    $("sharesSum").textContent = formatVND(
      sumObj(equal ? eqShares : readShares()),
    );
  };

  const renderPaidInputs = ({ shares, paid }) => {
    const box = $("paidBox");
    box.innerHTML = "";

    for (const id of ROSTER_IDS) {
      if (id === payerId) continue;

      const share = Number(shares?.[id] || 0);
      const paidVal = Number(paid?.[id] || 0);
      const due = Math.max(share - paidVal, 0);

      box.innerHTML += `
        <div class="col-12 col-md-6">
          <div class="d-flex justify-content-between">
            <div class="fw-semibold">${nameOf(id)}</div>
            <div class="text-secondary small">Phải đóng: ${formatVND(share)} • Còn thiếu: <b>${formatVND(due)}</b></div>
          </div>
          <input class="form-control paidInput" data-id="${id}" value="${paidVal}" placeholder="Đã chuyển"/>
          <div class="form-text">Nhập số tiền ${nameOf(id)} đã chuyển cho ${nameOf(payerId)} trong tháng này.</div>
        </div>
      `;
    }
  };

  function setShareInputsDisabled(disabled) {
    document.querySelectorAll(".shareInput").forEach((el) => {
      el.disabled = !!disabled;
    });
  }

  function updateShareInputsValues(shares) {
    document.querySelectorAll(".shareInput").forEach((el) => {
      const id = el.dataset.id;
      if (shares[id] == null) return;
      // chỉ set value nếu khác để tránh giật caret
      const next = String(shares[id]);
      if (el.value !== next) el.value = next;
    });
  }

  const recomputeSummary = ({ total, shares, paid }) => {
    const collected = sumObj(
      Object.fromEntries(
        Object.entries(paid || {}).filter(([id]) => id !== payerId),
      ),
    );
    const payerBurden = Math.max(total - collected, 0);

    let dueSum = 0;
    for (const id of ROSTER_IDS) {
      if (id === payerId) continue;
      const s = Number(shares?.[id] || 0);
      const p = Number(paid?.[id] || 0);
      dueSum += Math.max(s - p, 0);
    }

    $("rentTotal").textContent = formatVND(total);
    $("collected").textContent = formatVND(collected);
    $("payerBurden").textContent = formatVND(payerBurden);
    $("totalDue").textContent = formatVND(dueSum);
  };

  const validateShares = (total, shares) => {
    const sum = sumObj(shares);
    if (sum !== total)
      return `Tổng phần chia (${formatVND(sum)}) phải bằng Tổng tiền (${formatVND(total)}).`;
    return "";
  };

  const hydrateUI = (docData) => {
    const items = docData?.items || { rent: 0, wifi: 0, other: 0 };

    // ✅ legacy fallback (doc cũ có thể còn items.electric / items.water)
    const legacyFallback = {
      electricCost: Number(docData?.items?.electric || 0),
      waterCost: Number(docData?.items?.water || 0),
    };

    $("it_rent").value = items.rent ?? 0;
    $("it_wifi").value = items.wifi ?? 0;
    $("it_other").value = items.other ?? 0;

    // meta (new)
    $("headcount").value = docData?.headcount ?? 0;
    $("waterUnit").value = docData?.water?.unitPrice ?? 0;
    $("elecOld").value = docData?.electric?.oldKwh ?? 0;
    $("elecNew").value = docData?.electric?.newKwh ?? 0;
    $("elecUnit").value = docData?.electric?.unitPrice ?? 0;
    $("rentNote").value = docData?.note || "";

    const meta = {
      headcount: Number(docData?.headcount || 0),
      water: docData?.water || { unitPrice: 0, mode: "perPerson" },
      electric: docData?.electric || { oldKwh: 0, newKwh: 0, unitPrice: 0 },
    };

    const computed = computeCosts(items, meta, legacyFallback);
    const total = Number(docData?.total ?? computed.total);

    // render computed texts
    $("waterCostTxt").textContent = formatVND(computed.waterCost);
    $("kwhUsedTxt").textContent = String(computed.kwhUsed);
    $("elecCostTxt").textContent = formatVND(computed.electricCost);

    const equal = (docData?.splitMode || "equal") === "equal";
    $("splitEqual").checked = equal;

    const shares = docData?.shares || buildEqualShares(total, ROSTER_IDS);

    const paid =
      docData?.paid || Object.fromEntries(ROSTER_IDS.map((id) => [id, 0]));

    renderSharesInputs({ total, equal, shares });
    renderPaidInputs({
      shares: equal ? buildEqualShares(total, ROSTER_IDS) : shares,
      paid,
    });

    const finalShares = equal ? buildEqualShares(total, ROSTER_IDS) : shares;
    $("sharesSum").textContent = formatVND(sumObj(finalShares));
    $("sharesErr").textContent = validateShares(total, finalShares);

    recomputeSummary({ total, shares: finalShares, paid });
  };

  const startWatch = () => {
    if (_unsubRent) _unsubRent();
    _unsubRent = watchRentByPeriod(groupId, period, (docData) => {
      liveDoc = docData;
      if (!document.body.contains(app)) return;

      if (!docData) {
        // Nếu chưa có doc tháng này -> thử prefill từ tháng gần nhất
        // và TUYỆT ĐỐI không đè UI về 0 nếu đã prefill.
        if (_prefillAppliedForPeriod === period) return;

        prefillIfMissing(period).then((applied) => {
          if (applied) return;

          // không có tháng trước để prefill -> mới hydrate rỗng
          hydrateUI({
            period,
            payerId,
            items: { rent: 0, wifi: 0, other: 0 },
            total: 0,
            splitMode: "equal",
            shares: buildEqualShares(0, ROSTER_IDS),
            paid: Object.fromEntries(ROSTER_IDS.map((id) => [id, 0])),
            note: "",
            headcount: 0,
            water: { unitPrice: 0, mode: "perPerson" },
            electric: { oldKwh: 0, newKwh: 0, unitPrice: 0 },
          });
        });

        return;
      }

      hydrateUI(docData);
    });
  };

  async function prefillIfMissing(targetPeriod) {
    const groupId = state.groupId;
    if (!groupId) return false;

    // 1) nếu tháng đã có doc -> không prefill
    const current = await getRentByPeriod(groupId, targetPeriod);
    if (current) return false;

    // 2) tìm tháng gần nhất trước đó
    const prev = await getLatestRentBefore(groupId, targetPeriod);
    if (!prev) return false;

    // 3) đổ prev lên UI (KHÔNG ghi DB)
    hydrateUI(prev);

    // 4) RULE THÁNG MỚI:
    // - elecOld = elecNew tháng trước
    // - elecNew = elecOld (giữ nguyên, chờ nhập số mới)
    const prevNew = Number(prev?.electric?.newKwh ?? 0);
    if (Number.isFinite(prevNew) && prevNew > 0) {
      $("elecOld").value = String(prevNew);
      $("elecNew").value = String(prevNew);
    }

    // - clear note tháng mới
    $("rentNote").value = "";

    // - reset "đã chuyển" về 0
    document.querySelectorAll(".paidInput").forEach((el) => (el.value = "0"));

    // 5) đánh dấu đã prefill cho period này để watcher không reset về 0
    _prefillAppliedForPeriod = targetPeriod;

    // 6) cập nhật lại tổng kết
    onItemsChanged();

    return true;
  }

  // events
  periodEl.onchange = async (e) => {
    period = e.target.value || currentPeriod();
    _prefillAppliedForPeriod = null; // reset cờ khi đổi tháng

    // prefill trước để UI có data ngay
    await prefillIfMissing(period);

    // rồi mới bật watcher (watcher sẽ không đè về 0 nhờ cờ)
    startWatch();
  };

  const onItemsChanged = () => {
    const items = readItems();
    const meta = readMeta();
    const computed = computeCosts(items, meta);
    const total = computed.total;

    // update computed texts
    $("waterCostTxt").textContent = formatVND(computed.waterCost);
    $("kwhUsedTxt").textContent = String(computed.kwhUsed);
    $("elecCostTxt").textContent = formatVND(computed.electricCost);

    const equal = $("splitEqual").checked;

    // update total text
    $("rentTotal").textContent = formatVND(total);

    // shares
    if (equal) {
      const eqShares = buildEqualShares(total, ROSTER_IDS);
      setShareInputsDisabled(true);
      updateShareInputsValues(eqShares);
      $("sharesSum").textContent = formatVND(sumObj(eqShares));
      $("sharesErr").textContent = ""; // equal luôn khớp total

      // paid section chỉ update phần text tổng kết + dòng còn thiếu (không rebuild input)
      const paid = readPaid();
      recomputeSummary({ total, shares: eqShares, paid });

      // update helper text "Phải đóng / Còn thiếu" (không đụng input value)
      for (const id of ROSTER_IDS) {
        if (id === payerId) continue;
        const share = Number(eqShares[id] || 0);
        const p = Number(paid[id] || 0);
        const due = Math.max(share - p, 0);

        const row = document
          .querySelector(`.paidInput[data-id="${id}"]`)
          ?.closest(".col-12");
        if (row) {
          const info = row.querySelector(".text-secondary.small");
          if (info)
            info.innerHTML = `Phải đóng: ${formatVND(share)} • Còn thiếu: <b>${formatVND(due)}</b>`;
        }
      }
    } else {
      // custom: người dùng đang nhập shares => không overwrite
      setShareInputsDisabled(false);

      const shares = readShares();
      $("sharesSum").textContent = formatVND(sumObj(shares));
      $("sharesErr").textContent = validateShares(total, shares);

      const paid = readPaid();
      recomputeSummary({ total, shares, paid });

      for (const id of ROSTER_IDS) {
        if (id === payerId) continue;
        const share = Number(shares[id] || 0);
        const p = Number(paid[id] || 0);
        const due = Math.max(share - p, 0);

        const row = document
          .querySelector(`.paidInput[data-id="${id}"]`)
          ?.closest(".col-12");
        if (row) {
          const info = row.querySelector(".text-secondary.small");
          if (info)
            info.innerHTML = `Phải đóng: ${formatVND(share)} • Còn thiếu: <b>${formatVND(due)}</b>`;
        }
      }
    }
  };

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
    $(id)?.addEventListener("input", onItemsChanged);
  });

  $("splitEqual").addEventListener("change", onItemsChanged);

  document.addEventListener("input", (ev) => {
    if (ev.target?.classList?.contains("shareInput")) {
      onItemsChanged();
    }

    if (ev.target?.classList?.contains("paidInput")) {
      const items = readItems();
      const meta = readMeta();
      const computed = computeCosts(items, meta);
      const total = computed.total;

      const equal = $("splitEqual").checked;
      const shares = equal ? buildEqualShares(total, ROSTER_IDS) : readShares();
      const paid = readPaid();

      // clamp paid <= share
      for (const id of Object.keys(paid)) {
        if (id === payerId) continue;
        paid[id] = Math.min(paid[id], Number(shares[id] || 0));
        if (paid[id] < 0) paid[id] = 0;
      }

      // update tổng kết + “còn thiếu” text (không rebuild)
      recomputeSummary({ total, shares, paid });

      for (const id of ROSTER_IDS) {
        if (id === payerId) continue;
        const share = Number(shares[id] || 0);
        const p = Number(paid[id] || 0);
        const due = Math.max(share - p, 0);

        const row = document
          .querySelector(`.paidInput[data-id="${id}"]`)
          ?.closest(".col-12");
        if (row) {
          const info = row.querySelector(".text-secondary.small");
          if (info)
            info.innerHTML = `Phải đóng: ${formatVND(share)} • Còn thiếu: <b>${formatVND(due)}</b>`;
        }
      }
    }
  });

  $("btnSaveRent").onclick = async () => {
    $("rentMsg").textContent = "";

    const items = readItems();
    const meta = readMeta();
    const computed = computeCosts(items, meta);
    const total = computed.total;

    const equal = $("splitEqual").checked;
    const shares = equal ? buildEqualShares(total, ROSTER_IDS) : readShares();

    const err = validateShares(total, shares);
    if (err) {
      $("sharesErr").textContent = err;
      return;
    }
    $("sharesErr").textContent = "";

    const paid = readPaid();
    // clamp paid <= share
    for (const id of Object.keys(paid)) {
      if (id === payerId) continue;
      paid[id] = Math.min(paid[id], Number(shares[id] || 0));
      if (paid[id] < 0) paid[id] = 0;
    }

    const payload = {
      payerId,
      items, // rent/wifi/other (+net/trash nếu bạn có ở bản local)
      total,

      // ✅ new detail fields
      headcount: meta.headcount,
      water: meta.water,
      electric: meta.electric,
      computed: {
        waterCost: computed.waterCost,
        kwhUsed: computed.kwhUsed,
        electricCost: computed.electricCost,
      },

      splitMode: equal ? "equal" : "custom",
      shares,
      paid,
      note: ($("rentNote").value || "").trim(),
      createdBy: state.user.uid,
    };

    const btn = $("btnSaveRent");
    btn.disabled = true;
    btn.textContent = "Đang lưu...";

    try {
      await upsertRentByPeriod(groupId, period, payload);
      showToast({
        title: "Thành công",
        message: "Đã lưu tiền nhà.",
        variant: "success",
      });

      return;
    } catch (e) {
      console.error(e);
      $("rentMsg").textContent = e?.message || "Không thể lưu.";
      showToast({
        title: "Thất bại",
        message: e?.message || "Không thể lưu.",
        variant: "danger",
      });
    } finally {
      btn.disabled = false;
      btn.textContent = "Lưu";
    }
  };

  $("btnClearPaid").onclick = () => {
    document.querySelectorAll(".paidInput").forEach((el) => (el.value = "0"));
    onItemsChanged(); // cập nhật lại tổng kết + còn thiếu
    showToast({
      title: "Đã clear",
      message: "Đã reset phần 'đã chuyển' về 0 (chưa lưu).",
      variant: "success",
    });
  };

  // init
  startWatch();

  // cleanup when leaving page
  const onHashChange = () => {
    if (!location.hash.startsWith("#/rent")) {
      if (_unsubRent) {
        _unsubRent();
        _unsubRent = null;
      }
      window.removeEventListener("hashchange", onHashChange);
    }
  };
  window.addEventListener("hashchange", onHashChange);
}
