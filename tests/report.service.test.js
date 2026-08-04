import { beforeEach, describe, expect, it, vi } from "vitest";

const firestoreMocks = vi.hoisted(() => ({
  collection: vi.fn(),
  doc: vi.fn(() => "DOC_REF"),
  getDoc: vi.fn(),
  getDocs: vi.fn(),
  orderBy: vi.fn(),
  query: vi.fn(),
  serverTimestamp: vi.fn(() => "SERVER_TIMESTAMP"),
  setDoc: vi.fn(),
  where: vi.fn(),
}));

vi.mock("../src/config/firebase.js", () => ({
  db: {},
}));

vi.mock("firebase/firestore", () => ({
  collection: firestoreMocks.collection,
  doc: firestoreMocks.doc,
  getDoc: firestoreMocks.getDoc,
  getDocs: firestoreMocks.getDocs,
  orderBy: firestoreMocks.orderBy,
  query: firestoreMocks.query,
  serverTimestamp: firestoreMocks.serverTimestamp,
  setDoc: firestoreMocks.setDoc,
  where: firestoreMocks.where,
}));

import {
  normalizeMonthlyReportSnapshot,
  toPeriodSummary,
} from "../src/services/report.service.js";
import {
  buildMonthlyReportSnapshotPayload,
  saveMonthlyReportSnapshot,
} from "../src/services/period.service.js";

describe("report and period services", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns null for legacy period docs without monthly report snapshot", () => {
    expect(
      normalizeMonthlyReportSnapshot("2026-03", {
        period: "2026-03",
        rent: { total: 1000 },
      }),
    ).toBeNull();
  });

  it("builds period summaries only for saved monthly report snapshots", () => {
    expect(
      toPeriodSummary({
        id: "2026-03",
        period: "2026-03",
        snapshotType: "monthly-report",
        snapshotAt: "2026-03-01T00:00:00.000Z",
        snapshotBy: "admin-uid",
        stats: {
          expenseCount: 1,
          paymentCount: 2,
          expenseTotal: 100,
          paymentTotal: 80,
          rentTotal: 50,
          settlementCount: 1,
        },
        snapshot: {},
      }),
    ).toMatchObject({
      period: "2026-03",
      snapshotBy: "admin-uid",
      stats: {
        expenseCount: 1,
        paymentCount: 2,
      },
    });
  });

  it("preserves createdAt when building snapshot payload for an existing period doc", () => {
    const payload = buildMonthlyReportSnapshotPayload(
      "2026-03",
      {
        snapshotBy: "admin-uid",
        stats: { expenseCount: 1 },
        snapshot: { balances: { hung: 0 } },
      },
      {
        createdAt: "OLD_CREATED_AT",
        rent: { total: 1 },
      },
    );

    expect(payload).toMatchObject({
      period: "2026-03",
      snapshotType: "monthly-report",
      reportVersion: 1,
      snapshotBy: "admin-uid",
      createdAt: "OLD_CREATED_AT",
    });
    expect(payload).not.toHaveProperty("rent");
  });

  it("saves report snapshots with merge and preserves legacy period docs", async () => {
    firestoreMocks.getDoc.mockResolvedValue({
      exists: () => true,
      data: () => ({
        createdAt: "OLD_CREATED_AT",
        rent: { total: 4850000 },
      }),
    });

    await saveMonthlyReportSnapshot("P102", "2026-03", {
      snapshotBy: "admin-uid",
      stats: { expenseCount: 1 },
      snapshot: { balances: { hung: 0 } },
    });

    expect(firestoreMocks.setDoc).toHaveBeenCalledWith(
      "DOC_REF",
      expect.objectContaining({
        period: "2026-03",
        snapshotType: "monthly-report",
        snapshotBy: "admin-uid",
        createdAt: "OLD_CREATED_AT",
      }),
      { merge: true },
    );
  });
});
