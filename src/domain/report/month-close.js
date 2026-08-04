import { buildMonthlyReport } from "./compute.js";

/**
 * Pure month-close snapshot for client Reports path.
 * Reuses the same settlement/report algorithms as live reports.
 */
export function buildMonthCloseSnapshot({
  roster = [],
  expenses = [],
  payments = [],
  rent = null,
  members = [],
} = {}) {
  const nameById = new Map(
    (members || [])
      .filter((member) => member?.memberId || member?.id)
      .map((member) => [
        member.memberId || member.id,
        member.displayName || member.name || member.memberId || member.id,
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
    snapshotType: "month-close",
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
