import { useEffect, useState } from "react";
import { fetchHistoricalBefore } from "../services/live-data-hub";
import { buildPreviousDebtByMonth } from "../features/payments/helpers";

export type PreviousDebtMonth = {
  period: string;
  carryTotal: number;
  carryCount: number;
  carryPlan: Array<{ fromId: string; toId: string; amount: number }>;
};

/**
 * Nợ còn treo từ các tháng trước period hiện tại (chưa được thanh toán hết).
 */
export function usePreviousDebts(groupId: string | null, period: string) {
  const [months, setMonths] = useState<PreviousDebtMonth[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!groupId || !period) {
      setMonths([]);
      setError("");
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError("");

    fetchHistoricalBefore(groupId, period)
      .then((historical) => {
        if (cancelled) return;
        const timeline = buildPreviousDebtByMonth(
          historical.expensesBefore as Array<Record<string, unknown>>,
          historical.paymentsBefore as Array<Record<string, unknown>>,
          period,
        ) as PreviousDebtMonth[];
        setMonths(timeline || []);
      })
      .catch((err) => {
        if (cancelled) return;
        setMonths([]);
        setError((err as { message?: string })?.message || "Không tải được nợ tháng trước.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [groupId, period]);

  return { months, loading, error };
}

export function filterMyPreviousDebts(
  months: PreviousDebtMonth[],
  memberId: string | null,
): Array<{
  period: string;
  fromId: string;
  toId: string;
  amount: number;
}> {
  if (!memberId) return [];
  const rows: Array<{ period: string; fromId: string; toId: string; amount: number }> = [];
  for (const month of months) {
    for (const item of month.carryPlan || []) {
      if (item.fromId === memberId && Number(item.amount) > 0) {
        rows.push({
          period: month.period,
          fromId: item.fromId,
          toId: item.toId,
          amount: Number(item.amount),
        });
      }
    }
  }
  return rows;
}
