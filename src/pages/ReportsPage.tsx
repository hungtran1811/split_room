import { useEffect, useMemo, useState } from "react";
import { formatVND } from "../shared/lib/format";
import { EmptyState } from "../shared/ui/EmptyState";
import { MetricGrid } from "../shared/ui/MetricTile";
import { MoneyRow } from "../shared/ui/MoneyRow";
import { OverviewSection } from "../shared/ui/OverviewSection";
import { PageHeader } from "../shared/ui/PageHeader";
import { PageLoadingSkeleton, SkeletonList } from "../shared/ui/Skeleton";
import { useSession } from "../app/SessionContext";
import { useLiveMonth } from "../hooks/useLiveMonth";
import { ROSTER_IDS, nameOf } from "../config/roster";
import { resolveMemberIdFromEmail } from "../config/members.map";
import { shiftPeriod } from "../core/period";
import {
  buildDailySpend,
  buildLargestExpenses,
  buildMonthCompare,
  buildRentCollectionInsight,
} from "../domain/report/insights";
import { buildTopPayers } from "../domain/report/top-payers";
import { DailySpendChart } from "../features/reports/DailySpendChart";
import { MonthCompareCards } from "../features/reports/MonthCompareCards";
import { RentCollectionCard } from "../features/reports/RentCollectionCard";
import { TopPayerCharts } from "../features/reports/TopPayerCharts";
import { fetchAllExpenses } from "../services/expense.service";
import type { ExpenseDoc } from "../types/models";
import { getMonthRange } from "../core/period";

function formatPeriodLabel(period: string): string {
  const [year, month] = String(period || "").split("-");
  if (!year || !month) return period || "-";
  return `Tháng ${Number(month)}/${year}`;
}

export function ReportsPage() {
  const session = useSession();
  const live = useLiveMonth("reports", session.groupId, session.selectedPeriod);
  const previousPeriod = shiftPeriod(session.selectedPeriod, -1);

  const [allExpenses, setAllExpenses] = useState<ExpenseDoc[]>([]);
  const [allLoading, setAllLoading] = useState(true);
  const [allError, setAllError] = useState("");

  const myMemberId =
    session.memberProfile?.memberId ||
    resolveMemberIdFromEmail(session.user?.email) ||
    ROSTER_IDS[0];

  const monthExpenses = live.expenses as ExpenseDoc[];
  const monthReady = live.expensesReady;
  const rentReady = live.rentReady;

  useEffect(() => {
    if (!session.groupId) return;
    let cancelled = false;
    setAllLoading(true);
    setAllError("");

    // Một query all-time; tháng trước lọc client-side (tiết kiệm quota).
    void fetchAllExpenses(session.groupId)
      .then((items) => {
        if (cancelled) return;
        setAllExpenses(items as ExpenseDoc[]);
      })
      .catch((error) => {
        if (cancelled) return;
        setAllError((error as { message?: string })?.message || "Không tải được dữ liệu.");
        setAllExpenses([]);
      })
      .finally(() => {
        if (!cancelled) setAllLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [session.groupId]);

  const prevExpenses = useMemo(() => {
    const { start, end } = getMonthRange(previousPeriod);
    return allExpenses.filter((item) => {
      const date = String(item.date || "");
      return date >= start && date < end;
    });
  }, [allExpenses, previousPeriod]);

  const prevLoading = allLoading;
  const prevError = allError;

  const monthTop = useMemo(
    () => buildTopPayers(monthExpenses, { limit: 10 }),
    [monthExpenses],
  );
  const allTimeTop = useMemo(() => buildTopPayers(allExpenses, { limit: 10 }), [allExpenses]);
  const dailySpend = useMemo(
    () => buildDailySpend(monthExpenses, session.selectedPeriod),
    [monthExpenses, session.selectedPeriod],
  );
  const largestExpenses = useMemo(
    () => buildLargestExpenses(monthExpenses, { limit: 5 }),
    [monthExpenses],
  );
  const monthCompare = useMemo(
    () =>
      buildMonthCompare(
        monthExpenses,
        prevExpenses,
        session.selectedPeriod,
        previousPeriod,
      ),
    [monthExpenses, prevExpenses, session.selectedPeriod, previousPeriod],
  );
  const rentInsight = useMemo(
    () => buildRentCollectionInsight(live.rent as Record<string, unknown> | null),
    [live.rent],
  );

  const monthTotal = monthTop.reduce((sum, row) => sum + row.total, 0);
  const allTimeTotal = allTimeTop.reduce((sum, row) => sum + row.total, 0);

  const deltaTone =
    monthCompare.deltaTotal > 0
      ? "danger"
      : monthCompare.deltaTotal < 0
        ? "positive"
        : "neutral";
  const deltaHint =
    monthCompare.deltaPct === null
      ? prevLoading
        ? "…"
        : "—"
      : `${monthCompare.deltaTotal > 0 ? "+" : ""}${monthCompare.deltaPct}%`;

  return (
    <div className="reports-page">
      <PageHeader title="Báo cáo" />

      {!monthReady ? (
        <PageLoadingSkeleton stats={3} rows={0} />
      ) : (
        <MetricGrid
          columns={3}
          tiles={[
            {
              key: "total",
              label: "Tổng chi tháng",
              value: formatVND(monthTotal),
              hint: `${monthExpenses.length} khoản`,
            },
            {
              key: "prev",
              label: "Tháng trước",
              value: prevLoading ? "…" : formatVND(monthCompare.previousTotal),
              hint: prevLoading ? "…" : `${monthCompare.previousCount} khoản`,
            },
            {
              key: "delta",
              label: "Chênh lệch",
              value: prevLoading
                ? "…"
                : `${monthCompare.deltaTotal > 0 ? "+" : ""}${formatVND(monthCompare.deltaTotal)}`,
              hint: deltaHint,
              tone: deltaTone,
            },
          ]}
        />
      )}

      <OverviewSection title="Chi theo ngày">
        {!monthReady ? (
          <SkeletonList count={3} />
        ) : !dailySpend.length ? (
          <EmptyState
            title="Chưa có chi tiêu theo ngày"
            description="Thêm khoản chi để xem xu hướng trong tháng."
          />
        ) : (
          <DailySpendChart rows={dailySpend} />
        )}
      </OverviewSection>

      <OverviewSection title="Top khoản chi lớn nhất">
        {!monthReady ? (
          <SkeletonList count={3} />
        ) : !largestExpenses.length ? (
          <EmptyState
            title="Chưa có khoản chi"
            description="Các khoản lớn nhất trong tháng sẽ hiện ở đây."
          />
        ) : (
          <div className="money-row-list">
            {largestExpenses.map((item) => (
              <MoneyRow
                key={item.id}
                memberId={item.payerId}
                avatarLabel={nameOf(item.payerId)}
                title={item.note || "Khoản chi"}
                subtitle={`${item.date} · ${nameOf(item.payerId)} trả`}
                amount={formatVND(item.amount)}
              />
            ))}
          </div>
        )}
      </OverviewSection>

      <OverviewSection title="So với tháng trước">
        {!monthReady || prevLoading ? (
          <SkeletonList count={2} />
        ) : prevError ? (
          <EmptyState title="Không so sánh được" description={prevError} />
        ) : (
          <MonthCompareCards compare={monthCompare} />
        )}
      </OverviewSection>

      <OverviewSection title="Tiền nhà tháng này">
        {!rentReady ? (
          <SkeletonList count={3} />
        ) : (
          <RentCollectionCard insight={rentInsight} myMemberId={myMemberId} />
        )}
      </OverviewSection>

      <OverviewSection title={`Top chi ${formatPeriodLabel(session.selectedPeriod)}`}>
        {!monthReady ? (
          <SkeletonList count={4} />
        ) : !monthTop.length ? (
          <EmptyState
            title="Chưa có chi tiêu tháng này"
            description="Thêm khoản chi để xem ai đã trả nhiều nhất."
          />
        ) : (
          <TopPayerCharts rows={monthTop} total={monthTotal} myMemberId={myMemberId} />
        )}
      </OverviewSection>

      <OverviewSection title="Top chi từ đầu đến nay">
        {allLoading ? (
          <SkeletonList count={4} />
        ) : allError ? (
          <EmptyState title="Không tải được báo cáo" description={allError} />
        ) : !allTimeTop.length ? (
          <EmptyState
            title="Chưa có dữ liệu"
            description="Khi nhóm có khoản chi, xếp hạng sẽ hiện ở đây."
          />
        ) : (
          <TopPayerCharts rows={allTimeTop} total={allTimeTotal} myMemberId={myMemberId} />
        )}
      </OverviewSection>
    </div>
  );
}
