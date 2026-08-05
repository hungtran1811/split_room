import { buildMonthlyReport } from "./compute";

export function buildMonthCloseSnapshot({
  roster = [],
  expenses = [],
  payments = [],
  rent = null,
  members = [],
}: {
  roster?: Array<{ id: string; name?: string }>;
  expenses?: Array<Record<string, unknown>>;
  payments?: Array<Record<string, unknown>>;
  rent?: Record<string, unknown> | null;
  members?: Array<{
    memberId?: string;
    id?: string;
    displayName?: string;
    name?: string;
  }>;
} = {}) {
  const nameById = new Map(
    (members || [])
      .filter((member) => member?.memberId || member?.id)
      .map((member) => [
        member.memberId || member.id || "",
        member.displayName || member.name || member.memberId || member.id || "",
      ]),
  );

  const resolvedRoster = (roster || []).map((member) => ({
    id: member.id,
    name: nameById.get(member.id) || member.name || member.id,
  }));

  const report = buildMonthlyReport({
    period: "",
    roster: resolvedRoster.length ? resolvedRoster : roster,
    expenses,
    payments,
    rent,
  });

  return {
    snapshotType: "month-close" as const,
    stats: report.stats,
    balances: report.balances,
    settlementPlan: report.settlementPlan,
    rentSummary: report.rentSummary,
    memberSummaries: report.memberSummaries,
    snapshot: {
      balances: report.balances,
      settlementPlan: report.settlementPlan,
      rent: report.rentSummary,
      members: report.memberSummaries,
    },
  };
}
