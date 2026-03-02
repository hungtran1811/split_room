import { beforeEach, describe, expect, it, vi } from "vitest";

const batchSet = vi.fn();
const batchCommit = vi.fn();

const firestoreMocks = vi.hoisted(() => ({
  collection: vi.fn(),
  doc: vi.fn((...segments) => segments.slice(1).join("/")),
  getDocs: vi.fn(),
  serverTimestamp: vi.fn(() => "SERVER_TIMESTAMP"),
  writeBatch: vi.fn(() => ({
    set: batchSet,
    commit: batchCommit,
  })),
}));

vi.mock("../src/config/firebase.js", () => ({
  db: {},
}));

vi.mock("firebase/firestore", () => ({
  collection: firestoreMocks.collection,
  doc: firestoreMocks.doc,
  getDocs: firestoreMocks.getDocs,
  serverTimestamp: firestoreMocks.serverTimestamp,
  writeBatch: firestoreMocks.writeBatch,
}));

vi.mock("../src/services/period.service.js", () => ({
  getPeriod: vi.fn(),
}));

vi.mock("../src/services/rent.service.js", () => ({
  getRentByPeriod: vi.fn(),
}));

import {
  getAdminOverview,
  normalizeMemberForAdmin,
  promoteBackupAdmin,
  demoteBackupAdmin,
} from "../src/services/admin.service.js";
import { getPeriod } from "../src/services/period.service.js";
import { getRentByPeriod } from "../src/services/rent.service.js";

function membersSnapshot(items) {
  return {
    docs: items.map((item) => ({
      id: item.uid,
      data: () => item,
    })),
  };
}

describe("admin service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    batchSet.mockClear();
    batchCommit.mockClear();
  });

  it("normalizes member diagnostics for legacy role, mapping mismatch, and unknown roster", () => {
    const normalized = normalizeMemberForAdmin({
      uid: "legacy-uid",
      email: "someone@example.com",
      memberId: "",
      role: "",
    });

    expect(normalized.diagnostics.map((item) => item.code)).toEqual([
      "missing-member-id",
      "legacy-role",
    ]);

    const unknownRoster = normalizeMemberForAdmin({
      uid: "x",
      email: "hungtran00.nt@gmail.com",
      memberId: "mystery",
      role: "member",
    });

    expect(unknownRoster.diagnostics.map((item) => item.code)).toContain(
      "unknown-roster-member",
    );
  });

  it("builds admin overview with owner, backup admin, and current month status", async () => {
    firestoreMocks.getDocs.mockResolvedValue(
      membersSnapshot([
        {
          uid: "8tgX0c2IBbTx0k0oIZgn7w2H12b2",
          email: "hungtran00.nt@gmail.com",
          memberId: "hung",
          role: "owner",
        },
        {
          uid: "backup-admin-uid",
          email: "huynhnhatthinh.2003@gmail.com",
          memberId: "thinh",
          role: "admin",
        },
      ]),
    );
    getRentByPeriod.mockResolvedValue({ period: "2026-03", total: 1000 });
    getPeriod.mockResolvedValue({
      period: "2026-03",
      snapshotType: "monthly-report",
      snapshot: {},
    });

    const overview = await getAdminOverview("P102");

    expect(overview.owner?.memberId).toBe("hung");
    expect(overview.backupAdmin?.memberId).toBe("thinh");
    expect(overview.currentPeriodStatus).toEqual({
      rentExists: true,
      reportSnapshotExists: true,
    });
  });

  it("promotes a backup admin and demotes the old one in one batch", async () => {
    firestoreMocks.getDocs.mockResolvedValue(
      membersSnapshot([
        {
          uid: "8tgX0c2IBbTx0k0oIZgn7w2H12b2",
          email: "hungtran00.nt@gmail.com",
          memberId: "hung",
          role: "owner",
        },
        {
          uid: "old-admin-uid",
          email: "huynhnhatthinh.2003@gmail.com",
          memberId: "thinh",
          role: "admin",
        },
        {
          uid: "target-uid",
          email: "huynhthanhthao14062001@gmail.com",
          memberId: "thao",
          role: "member",
        },
      ]),
    );

    await promoteBackupAdmin("P102", "target-uid", {
      uid: "8tgX0c2IBbTx0k0oIZgn7w2H12b2",
    });

    expect(batchSet).toHaveBeenCalledTimes(2);
    expect(batchSet).toHaveBeenNthCalledWith(
      1,
      "groups/P102/members/old-admin-uid",
      expect.objectContaining({ role: "member" }),
      { merge: true },
    );
    expect(batchSet).toHaveBeenNthCalledWith(
      2,
      "groups/P102/members/target-uid",
      expect.objectContaining({ role: "admin" }),
      { merge: true },
    );
    expect(batchCommit).toHaveBeenCalledTimes(1);
  });

  it("demotes the current backup admin", async () => {
    firestoreMocks.getDocs.mockResolvedValue(
      membersSnapshot([
        {
          uid: "8tgX0c2IBbTx0k0oIZgn7w2H12b2",
          email: "hungtran00.nt@gmail.com",
          memberId: "hung",
          role: "owner",
        },
        {
          uid: "backup-admin-uid",
          email: "huynhnhatthinh.2003@gmail.com",
          memberId: "thinh",
          role: "admin",
        },
      ]),
    );

    await demoteBackupAdmin("P102", "backup-admin-uid", {
      uid: "8tgX0c2IBbTx0k0oIZgn7w2H12b2",
    });

    expect(batchSet).toHaveBeenCalledWith(
      "groups/P102/members/backup-admin-uid",
      expect.objectContaining({ role: "member" }),
      { merge: true },
    );
    expect(batchCommit).toHaveBeenCalledTimes(1);
  });
});
