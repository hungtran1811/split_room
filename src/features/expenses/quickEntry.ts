const STORAGE_KEY = "splitroom_recent_expense_notes";

export const AMOUNT_PRESETS = [50_000, 100_000, 200_000, 500_000];

function readStoredNotes(): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = JSON.parse(raw || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function collectRecentNotes(
  expenses: Array<{ note?: string; date?: string }> = [],
  limit = 6,
): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  const pushNote = (note: unknown) => {
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

  const sorted = [...expenses].sort((left, right) => {
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

export function rememberNote(note: string): void {
  const trimmed = String(note || "").trim();
  if (!trimmed) return;

  const next = [
    trimmed,
    ...readStoredNotes().filter((item) => item.toLowerCase() !== trimmed.toLowerCase()),
  ].slice(0, 8);

  localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
}

/** Alias used by tests / call sites. */
export const rememberExpenseNote = rememberNote;

export function formatPresetLabel(amount: number): string {
  if (amount >= 1_000_000) return `${amount / 1_000_000}tr`;
  if (amount >= 1_000) return `${amount / 1_000}k`;
  return String(amount);
}

export function findLastRepeatableExpense(
  expenses: Array<{
    amount?: number;
    participants?: string[];
    payerId?: string;
    note?: string;
  }> = [],
  payerId = "",
) {
  const candidates = (expenses || []).filter(
    (item) =>
      Number(item?.amount || 0) > 0 &&
      Array.isArray(item?.participants) &&
      item.participants.length > 0,
  );

  if (payerId) {
    const mine = candidates.find((item) => item.payerId === payerId);
    if (mine) return mine;
  }

  return candidates[0] || null;
}
