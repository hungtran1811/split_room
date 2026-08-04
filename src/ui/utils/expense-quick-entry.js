const STORAGE_KEY = "splitroom_recent_expense_notes";

export const AMOUNT_PRESETS = [50_000, 100_000, 200_000, 500_000];

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function readStoredNotes() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = JSON.parse(raw || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function collectRecentNotes(expenses = [], limit = 6) {
  const seen = new Set();
  const result = [];

  const pushNote = (note) => {
    const trimmed = String(note || "").trim();
    if (!trimmed) return;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    result.push(trimmed);
  };

  for (const note of readStoredNotes()) {
    pushNote(note);
    if (result.length >= limit) return result;
  }

  const sorted = [...(expenses || [])].sort((left, right) => {
    const leftDate = String(left?.date || "");
    const rightDate = String(right?.date || "");
    return rightDate.localeCompare(leftDate);
  });

  for (const expense of sorted) {
    pushNote(expense?.note);
    if (result.length >= limit) break;
  }

  return result;
}

export function rememberExpenseNote(note) {
  const trimmed = String(note || "").trim();
  if (!trimmed) return;

  const next = [
    trimmed,
    ...readStoredNotes().filter(
      (item) => item.toLowerCase() !== trimmed.toLowerCase(),
    ),
  ].slice(0, 8);

  localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
}

export function renderAmountPresetButtons(presets = AMOUNT_PRESETS) {
  return presets
    .map(
      (amount) => `
        <button
          type="button"
          class="quick-chip quick-chip--amount"
          data-amount-preset="${amount}"
        >
          ${escapeHtml(formatPresetLabel(amount))}
        </button>
      `,
    )
    .join("");
}

export function renderNoteSuggestionChips(notes = []) {
  if (!notes.length) return "";

  return notes
    .map(
      (note) => `
        <button type="button" class="quick-chip quick-chip--note">
          ${escapeHtml(note)}
        </button>
      `,
    )
    .join("");
}

function formatPresetLabel(amount) {
  if (amount >= 1_000_000) {
    return `${amount / 1_000_000}tr`;
  }
  if (amount >= 1_000) {
    return `${amount / 1_000}k`;
  }
  return String(amount);
}

export function bindQuickEntryControls(root, handlers = {}) {
  if (!root) return;

  root.querySelectorAll("[data-amount-preset]").forEach((button) => {
    button.addEventListener("click", () => {
      const amount = Number(button.getAttribute("data-amount-preset") || 0);
      handlers.onAmountPreset?.(amount, button);
      root
        .querySelectorAll("[data-amount-preset]")
        .forEach((node) => node.classList.remove("is-active"));
      button.classList.add("is-active");
    });
  });

  root.querySelectorAll(".quick-chip--note").forEach((button) => {
    button.addEventListener("click", () => {
      handlers.onNoteSuggestion?.(button.textContent.trim(), button);
    });
  });
}

export function findLastRepeatableExpense(expenses = [], payerId = "") {
  const candidates = (expenses || []).filter(
    (item) =>
      item?.amount > 0 &&
      Array.isArray(item?.participants) &&
      item.participants.length > 0,
  );

  if (payerId) {
    const mine = candidates.find((item) => item.payerId === payerId);
    if (mine) return mine;
  }

  return candidates[0] || null;
}
