import { useEffect, useState } from "react";
import { formatVND } from "../shared/lib/format";
import { Button } from "../shared/ui/Button";
import { LockBanner, PageHeader } from "../shared/ui/PageHeader";
import { PageLoadingSkeleton } from "../shared/ui/Skeleton";
import { useToast } from "../shared/ui/Toast";
import { useSession } from "../app/SessionContext";
import { useLiveMonth } from "../hooks/useLiveMonth";
import { ROSTER, ROSTER_IDS } from "../config/roster";
import { OWNER_MEMBER_ID } from "../config/constants";
import { canEditRent } from "../core/roles";
import { useMemberLabel } from "../hooks/useMemberLabel";
import { MemberAvatar } from "../shared/ui/MemberAvatar";
import { NicknameSheet } from "../shared/ui/NicknameSheet";
import {
  buildEqualShares,
  clampNonNegative,
  computeRentCosts,
  parseIntSafe,
  parseVndInt,
  sumValues,
} from "../domain/rent/compute";
import { clampPaidToShares, validateShares } from "../domain/rent/validate";
import { upsertRentByPeriod } from "../services/rent.service";
import type { RentDoc } from "../types/models";

type RentForm = {
  payerId: string;
  rent: string;
  wifi: string;
  other: string;
  headcount: string;
  waterUnitPrice: string;
  electricOldKwh: string;
  electricNewKwh: string;
  electricUnitPrice: string;
  splitEqual: boolean;
  shares: Record<string, string>;
  paid: Record<string, string>;
  note: string;
  createdBy: string;
  updatedAt: unknown;
};

const WIZARD_STEPS = [
  { label: "Khoản", title: "Khoản tiền tháng này" },
  { label: "Chia", title: "Chia tiền" },
  { label: "Thu", title: "Mọi người đã chuyển" },
] as const;

function emptyForm(): RentForm {
  return {
    payerId: OWNER_MEMBER_ID,
    rent: "",
    wifi: "",
    other: "",
    headcount: "",
    waterUnitPrice: "",
    electricOldKwh: "",
    electricNewKwh: "",
    electricUnitPrice: "",
    splitEqual: true,
    shares: Object.fromEntries(ROSTER_IDS.map((id) => [id, "0"])),
    paid: Object.fromEntries(ROSTER_IDS.map((id) => [id, "0"])),
    note: "",
    createdBy: "",
    updatedAt: null,
  };
}

function hydrateForm(doc: RentDoc | null): RentForm {
  if (!doc) return emptyForm();

  const shares = (doc.shares as Record<string, number>) || {};
  const paid = (doc.paid as Record<string, number>) || {};

  return {
    payerId: doc.payerId || OWNER_MEMBER_ID,
    rent: String(doc.items?.rent ?? 0),
    wifi: String(doc.items?.wifi ?? 0),
    other: String(doc.items?.other ?? 0),
    headcount: String(doc.headcount ?? 0),
    waterUnitPrice: String(doc.water?.unitPrice ?? 0),
    electricOldKwh: String(doc.electric?.oldKwh ?? 0),
    electricNewKwh: String(doc.electric?.newKwh ?? 0),
    electricUnitPrice: String(doc.electric?.unitPrice ?? 0),
    splitEqual: (doc.splitMode || "equal") === "equal",
    shares: Object.fromEntries(ROSTER_IDS.map((id) => [id, String(shares[id] ?? 0)])),
    paid: Object.fromEntries(ROSTER_IDS.map((id) => [id, String(paid[id] ?? 0)])),
    note: doc.note || "",
    createdBy: doc.createdBy || "",
    updatedAt: doc.updatedAt || null,
  } as RentForm;
}

function ProgressRing({ percent, size = 96, stroke = 9 }: { percent: number; size?: number; stroke?: number }) {
  const clamped = Math.max(0, Math.min(100, percent));
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (clamped / 100) * circumference;

  return (
    <div className="progress-ring" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle className="progress-ring__track" cx={size / 2} cy={size / 2} r={radius} strokeWidth={stroke} fill="none" />
        <circle
          className="progress-ring__value"
          cx={size / 2}
          cy={size / 2}
          r={radius}
          strokeWidth={stroke}
          fill="none"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </svg>
      <div className="progress-ring__center">{Math.round(clamped)}%</div>
    </div>
  );
}

function formatUpdatedAt(value: unknown): string {
  const asDate = value as { toDate?: () => Date } | null;
  if (asDate && typeof asDate.toDate === "function") {
    return asDate.toDate().toLocaleString("vi-VN");
  }
  return "Chưa có";
}

export function RentPage() {
  const session = useSession();
  const { showToast } = useToast();
  const labelOf = useMemberLabel();
  const live = useLiveMonth("rent", session.groupId, session.selectedPeriod);
  const [nicknameOpen, setNicknameOpen] = useState(false);
  const [form, setForm] = useState<RentForm>(emptyForm);
  const [step, setStep] = useState<0 | 1 | 2>(0);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  const canEdit = canEditRent(session.memberProfile) && !session.lockedSoft;

  useEffect(() => {
    if (live.rentReady) {
      setForm(hydrateForm(live.rent as RentDoc | null));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [live.rentReady, live.rent]);

  const items = {
    rent: parseVndInt(form.rent),
    wifi: parseVndInt(form.wifi),
    other: parseVndInt(form.other),
  };
  const meta = {
    headcount: clampNonNegative(parseIntSafe(form.headcount)),
    water: { unitPrice: clampNonNegative(parseVndInt(form.waterUnitPrice)) },
    electric: {
      oldKwh: clampNonNegative(parseIntSafe(form.electricOldKwh)),
      newKwh: clampNonNegative(parseIntSafe(form.electricNewKwh)),
      unitPrice: clampNonNegative(parseVndInt(form.electricUnitPrice)),
    },
  };
  const computed = computeRentCosts(items, meta);
  const total = computed.total;

  const shares = form.splitEqual
    ? buildEqualShares(total, ROSTER_IDS)
    : Object.fromEntries(ROSTER_IDS.map((id) => [id, parseVndInt(form.shares[id] || "0")]));

  const rawPaid = Object.fromEntries(
    ROSTER_IDS.map((id) => [id, id === form.payerId ? 0 : parseVndInt(form.paid[id] || "0")]),
  );
  const paid = clampPaidToShares(rawPaid, shares);
  const shareError = form.splitEqual ? "" : validateShares(total, shares);

  const collected = Object.entries(paid).reduce(
    (sum, [id, value]) => sum + (id === form.payerId ? 0 : Number(value || 0)),
    0,
  );
  const payerBurden = Math.max(total - collected, 0);
  const totalDue = ROSTER_IDS.filter((id) => id !== form.payerId).reduce(
    (sum, id) => sum + Math.max(Number(shares[id] || 0) - Number(paid[id] || 0), 0),
    0,
  );
  const expectedCollection = ROSTER_IDS.filter((id) => id !== form.payerId).reduce(
    (sum, id) => sum + Number(shares[id] || 0),
    0,
  );
  const collectPercent = expectedCollection <= 0 ? 0 : Math.min(100, (collected / expectedCollection) * 100);

  function updateField<K extends keyof RentForm>(key: K, value: RentForm[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function handleNext() {
    if (step === 1 && !form.splitEqual && shareError) {
      setMessage(shareError);
      return;
    }
    setMessage("");
    setStep((current) => Math.min(2, current + 1) as 0 | 1 | 2);
  }

  function handleBack() {
    setMessage("");
    setStep((current) => Math.max(0, current - 1) as 0 | 1 | 2);
  }

  async function handleSave() {
    if (!canEdit || !session.groupId) return;
    setMessage("");

    if (!form.splitEqual && shareError) {
      setMessage(shareError);
      return;
    }

    setSaving(true);
    try {
      await upsertRentByPeriod(session.groupId, session.selectedPeriod, {
        payerId: form.payerId,
        items,
        total,
        headcount: meta.headcount,
        water: { mode: "perPerson", unitPrice: meta.water.unitPrice },
        electric: meta.electric,
        computed: { waterCost: computed.waterCost, kwhUsed: computed.kwhUsed, electricCost: computed.electricCost },
        splitMode: form.splitEqual ? "equal" : "custom",
        shares: form.splitEqual ? buildEqualShares(total, ROSTER_IDS) : shares,
        paid,
        note: form.note.trim(),
        createdBy: form.createdBy || session.user?.uid || "",
      });
      showToast({ title: "Thành công", message: "Đã lưu tiền nhà.", variant: "success" });
    } catch (error) {
      const text = (error as { message?: string })?.message || "Không thể lưu.";
      setMessage(text);
      showToast({ title: "Thất bại", message: text, variant: "danger" });
    } finally {
      setSaving(false);
    }
  }

  function handleClearPaid() {
    if (!canEdit) return;
    setForm((current) => ({
      ...current,
      paid: Object.fromEntries(ROSTER_IDS.map((id) => [id, "0"])),
    }));
    showToast({ title: "Đã clear", message: "Đã reset phần đã chuyển về 0 (chưa lưu).", variant: "success" });
  }

  if (!live.rentReady) {
    return (
      <div className="rent-page">
        <PageLoadingSkeleton stats={0} rows={4} />
      </div>
    );
  }

  const showMetrics = step === 0 || step === 2;

  return (
    <div className="rent-page">
      <PageHeader
        title="Tiền nhà"
        subtitle={`Tháng ${session.selectedPeriod} · phần mỗi người và đã trả`}
        action={
          <Button variant="ghost" className="btn--sm" onClick={() => setNicknameOpen(true)}>
            Biệt danh
          </Button>
        }
      />

      {session.lockedSoft ? (
        <LockBanner>
          Tháng {session.selectedPeriod} đã khóa — chỉ xem, không sửa tiền nhà.
        </LockBanner>
      ) : !canEditRent(session.memberProfile) ? (
        <div className="readonly-banner">Bạn không có quyền chỉnh sửa tiền nhà.</div>
      ) : null}

      {showMetrics ? (
        <div className="rent-top">
          <ProgressRing percent={collectPercent} />
          <div style={{ flex: 1 }}>
            <div className="metric-grid metric-grid--3">
              <div className="metric-tile">
                <div className="metric-tile__label">Tổng</div>
                <div className="metric-tile__value">{formatVND(total)}</div>
              </div>
              <div className="metric-tile metric-tile--positive">
                <div className="metric-tile__label">Đã thu</div>
                <div className="metric-tile__value">{formatVND(collected)}</div>
              </div>
              <div className="metric-tile metric-tile--danger">
                <div className="metric-tile__label">Thiếu</div>
                <div className="metric-tile__value">{formatVND(totalDue)}</div>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      <nav className="rent-stepper" aria-label="Các bước nhập tiền nhà">
        {WIZARD_STEPS.map((wizardStep, index) => {
          const stepIndex = index as 0 | 1 | 2;
          const isActive = step === stepIndex;
          const isDone = step > stepIndex;
          return (
            <button
              key={wizardStep.label}
              type="button"
              className={`rent-stepper__item ${isActive ? "is-active" : ""} ${isDone ? "is-done" : ""}`.trim()}
              onClick={() => {
                if (stepIndex === 2 && !form.splitEqual && shareError) {
                  setMessage(shareError);
                  return;
                }
                setMessage("");
                setStep(stepIndex);
              }}
              aria-current={isActive ? "step" : undefined}
            >
              <span className="rent-stepper__num">{index + 1}</span>
              <span className="rent-stepper__label">{wizardStep.label}</span>
            </button>
          );
        })}
      </nav>

      {step === 0 ? (
        <section className="card">
          <h2 className="section-title">1. {WIZARD_STEPS[0].title}</h2>
          <div className="form-grid form-grid--2">
            <div className="form-field">
              <label className="form-label">Người trả tiền nhà</label>
              <select
                className="form-select"
                disabled={!canEdit}
                value={form.payerId}
                onChange={(event) => updateField("payerId", event.target.value)}
              >
                {ROSTER.map((member) => (
                  <option key={member.id} value={member.id}>
                    {labelOf(member.id)}
                  </option>
                ))}
              </select>
            </div>
            <div className="form-field">
              <label className="form-label">Số người ở</label>
              <input className="form-input" disabled={!canEdit} value={form.headcount} onChange={(e) => updateField("headcount", e.target.value)} />
            </div>
            <div className="form-field">
              <label className="form-label">Tiền thuê</label>
              <input className="form-input" disabled={!canEdit} value={form.rent} onChange={(e) => updateField("rent", e.target.value)} />
            </div>
            <div className="form-field">
              <label className="form-label">Wifi</label>
              <input className="form-input" disabled={!canEdit} value={form.wifi} onChange={(e) => updateField("wifi", e.target.value)} />
            </div>
            <div className="form-field">
              <label className="form-label">Nước / người</label>
              <input className="form-input" disabled={!canEdit} value={form.waterUnitPrice} onChange={(e) => updateField("waterUnitPrice", e.target.value)} />
              <span className="form-hint">Tiền nước thực tế: {formatVND(computed.waterCost)}</span>
            </div>
            <div className="form-field">
              <label className="form-label">Khác</label>
              <input className="form-input" disabled={!canEdit} value={form.other} onChange={(e) => updateField("other", e.target.value)} />
            </div>
            <div className="form-field">
              <label className="form-label">Điện cũ</label>
              <input className="form-input" disabled={!canEdit} value={form.electricOldKwh} onChange={(e) => updateField("electricOldKwh", e.target.value)} />
            </div>
            <div className="form-field">
              <label className="form-label">Điện mới</label>
              <input className="form-input" disabled={!canEdit} value={form.electricNewKwh} onChange={(e) => updateField("electricNewKwh", e.target.value)} />
            </div>
            <div className="form-field">
              <label className="form-label">Giá điện / số</label>
              <input className="form-input" disabled={!canEdit} value={form.electricUnitPrice} onChange={(e) => updateField("electricUnitPrice", e.target.value)} />
              <span className="form-hint">
                Số điện dùng: {computed.kwhUsed} • Tiền điện thực tế: {formatVND(computed.electricCost)}
              </span>
            </div>
            <div className="form-field form-field--span2">
              <label className="form-label">Ghi chú</label>
              <input className="form-input" disabled={!canEdit} value={form.note} onChange={(e) => updateField("note", e.target.value)} />
            </div>
          </div>
        </section>
      ) : null}

      {step === 1 ? (
        <section className="card">
          <div className="card__head">
            <h2 className="section-title" style={{ marginBottom: 0 }}>
              2. {WIZARD_STEPS[1].title}
            </h2>
            <label className="form-switch-row">
              <input
                type="checkbox"
                disabled={!canEdit}
                checked={form.splitEqual}
                onChange={(event) => updateField("splitEqual", event.target.checked)}
              />
              Chia đều
            </label>
          </div>
          <div className="debts-grid">
            {ROSTER.map((member) => (
              <div key={member.id} className="debt-input-row debt-input-row--member">
                <MemberAvatar memberId={member.id} label={labelOf(member.id)} size={36} />
                <label className="form-hint">{labelOf(member.id)}</label>
                <input
                  className="form-input"
                  disabled={!canEdit || form.splitEqual}
                  value={form.splitEqual ? String(shares[member.id] || 0) : form.shares[member.id] || "0"}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, shares: { ...current.shares, [member.id]: event.target.value } }))
                  }
                />
              </div>
            ))}
          </div>
          <div className="form-hint" style={{ marginTop: 8 }}>
            Tổng phần chia: {formatVND(sumValues(shares))}
          </div>
          <div className="form-error">{!form.splitEqual ? shareError : ""}</div>
          {message && step === 1 ? <div className="form-error">{message}</div> : null}
        </section>
      ) : null}

      {step === 2 ? (
        <section className="card">
          <h2 className="section-title">3. Mọi người đã chuyển cho {labelOf(form.payerId)} bao nhiêu</h2>
          <div className="stack-list">
            {ROSTER_IDS.filter((id) => id !== form.payerId).map((memberId) => {
              const share = Number(shares[memberId] || 0);
              const paidValue = Number(paid[memberId] || 0);
              const due = Math.max(share - paidValue, 0);
              return (
                <div key={memberId} className="rent-member-row">
                  <div className="rent-member-row__head">
                    <span className="rent-member-row__who">
                      <MemberAvatar memberId={memberId} label={labelOf(memberId)} size={36} />
                      <span className="rent-member-row__name">{labelOf(memberId)}</span>
                    </span>
                    <span className={`status-badge ${due <= 0 && share > 0 ? "status-badge--settled" : share <= 0 ? "status-badge--pending" : "status-badge--debt"}`}>
                      {share <= 0 ? "Chưa nhập" : due <= 0 ? "Đã đủ" : "Còn thiếu"}
                    </span>
                  </div>
                  <input
                    className="form-input"
                    disabled={!canEdit}
                    value={form.paid[memberId] ?? "0"}
                    onChange={(event) =>
                      setForm((current) => ({ ...current, paid: { ...current.paid, [memberId]: event.target.value } }))
                    }
                  />
                  <div className="rent-member-row__info">
                    Phải đóng: {formatVND(share)} • Còn thiếu: <strong>{formatVND(due)}</strong>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="metric-grid metric-grid--3" style={{ marginTop: 16 }}>
            <div className="metric-tile metric-tile--positive">
              <div className="metric-tile__label">Đã thu từ mọi người</div>
              <div className="metric-tile__value">{formatVND(collected)}</div>
            </div>
            <div className="metric-tile metric-tile--warning">
              <div className="metric-tile__label">{labelOf(form.payerId)} đang gánh</div>
              <div className="metric-tile__value">{formatVND(payerBurden)}</div>
            </div>
            <div className="metric-tile metric-tile--danger">
              <div className="metric-tile__label">Còn thiếu</div>
              <div className="metric-tile__value">{formatVND(totalDue)}</div>
            </div>
          </div>

          <div className="rent-updated">Cập nhật cuối: {formatUpdatedAt(form.updatedAt)}</div>
          <div className="form-error">{message}</div>
        </section>
      ) : null}

      <NicknameSheet open={nicknameOpen} onClose={() => setNicknameOpen(false)} />

      <div className="rent-wizard-nav">
        <div>
          {step > 0 ? (
            <Button variant="ghost" onClick={handleBack}>
              Quay lại
            </Button>
          ) : null}
        </div>
        <div style={{ display: "flex", gap: "var(--space-2)", flexWrap: "wrap", justifyContent: "flex-end" }}>
          {step < 2 ? (
            <Button variant="primary" onClick={handleNext}>
              Tiếp theo
            </Button>
          ) : canEdit ? (
            <>
              <Button variant="ghost" onClick={handleClearPaid}>
                Clear đã chuyển
              </Button>
              <Button variant="primary" onClick={() => void handleSave()} disabled={saving}>
                {saving ? "Đang lưu..." : "Lưu"}
              </Button>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}
