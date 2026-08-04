import { formatVND } from "../../config/i18n";
import { nameOf } from "../../config/roster";

export function buildSettlementReminderMessage(period, items = []) {
  if (!items.length) {
    return `SplitRoom P102 — Tháng ${period}: không còn khoản cấn trừ.`;
  }

  const lines = items.map(
    (item) =>
      `• ${nameOf(item.fromId)} → ${nameOf(item.toId)}: ${formatVND(item.amount || 0)}`,
  );

  return [`SplitRoom P102 — Nhắc cấn trừ tháng ${period}:`, ...lines].join("\n");
}

export async function copySettlementReminder(period, items = []) {
  const text = buildSettlementReminderMessage(period, items);

  try {
    await navigator.clipboard.writeText(text);
    return { ok: true, text };
  } catch {
    window.prompt("Copy:", text);
    return { ok: false, text };
  }
}
