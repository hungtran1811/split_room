import { formatVND } from "../../config/i18n";

export async function copySettlementText({ fromName, toName, amount, context = "" }) {
  const text = `${fromName} → ${toName}: ${formatVND(amount)}${context ? ` (${context})` : ""}`;

  try {
    await navigator.clipboard.writeText(text);
    return { ok: true, text };
  } catch {
    window.prompt("Copy:", text);
    return { ok: false, text };
  }
}

export function bindCopyButtons(root, { getLabel } = {}) {
  if (!root) return;

  root.querySelectorAll("[data-copy-settlement]").forEach((button) => {
    button.addEventListener("click", async () => {
      const raw = button.getAttribute("data-copy-settlement") || "";
      const [fromId, toId, amountString] = raw.split("|");
      const amount = Number(amountString || 0);
      const labels = typeof getLabel === "function" ? getLabel(fromId, toId) : null;
      const fromName = labels?.fromName || fromId;
      const toName = labels?.toName || toId;

      await copySettlementText({ fromName, toName, amount, context: "cấn trừ" });

      const old = button.innerHTML;
      button.textContent = "✓";
      setTimeout(() => {
        button.innerHTML = old;
      }, 900);
    });
  });
}
