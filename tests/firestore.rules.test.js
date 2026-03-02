import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from "@firebase/rules-unit-testing";
import fs from "node:fs";

const OWNER_UID = "8tgX0c2IBbTx0k0oIZgn7w2H12b2";
const ADMIN_UID = "backup-admin-uid";
const MEMBER_UID = "member-uid";

let testEnv;

function rentPayload(period, uid) {
  return {
    period,
    payerId: "hung",
    items: { rent: 4000000, wifi: 150000, other: 0 },
    total: 4850000,
    headcount: 4,
    water: { unitPrice: 100000, mode: "perPerson" },
    electric: { oldKwh: 11214, newKwh: 11289, unitPrice: 4000 },
    computed: { waterCost: 400000, kwhUsed: 75, electricCost: 300000 },
    splitMode: "equal",
    shares: { hung: 1326000, thao: 1787000, thinh: 1637000, thuy: 100000 },
    paid: { hung: 0, thao: 0, thinh: 0, thuy: 0 },
    note: "Tien nha thang 3",
    createdBy: uid,
  };
}

function periodPayload(period, uid) {
  return {
    period,
    snapshotType: "monthly-report",
    reportVersion: 1,
    snapshotAt: `snapshot-${period}`,
    snapshotBy: uid,
    stats: {
      expenseCount: 1,
      paymentCount: 1,
      expenseTotal: 1000,
      paymentTotal: 500,
      rentTotal: 2000,
      settlementCount: 1,
    },
    snapshot: {
      balances: { hung: 1000, thao: -1000 },
      settlementPlan: [{ fromId: "thao", toId: "hung", amount: 1000 }],
      rent: {
        payerId: "hung",
        total: 2000,
        collected: 1000,
        remaining: 1000,
      },
      members: [
        {
          memberId: "hung",
          name: "Hung",
          netBalance: 1000,
          rentShare: 0,
          rentPaid: 0,
          rentRemaining: 0,
        },
      ],
    },
  };
}

function paymentPayload(uid, amount = 100000) {
  return {
    date: "2026-03-01",
    fromId: "thao",
    toId: "hung",
    amount,
    note: "Tra no",
    createdBy: uid,
  };
}

async function seedMember(uid, role, email, memberId) {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    await context.firestore().doc(`groups/P102/members/${uid}`).set({
      uid,
      email,
      memberId,
      role,
      displayName: memberId,
      photoURL: "",
    });
    await context.firestore().doc("groups/P102").set({
      name: "P102",
    });
  });
}

describe("firestore rules", () => {
  beforeAll(async () => {
    testEnv = await initializeTestEnvironment({
      projectId: "demo-split-room-test",
      firestore: {
        rules: fs.readFileSync("firestore.rules", "utf8"),
      },
    });
  });

  afterAll(async () => {
    await testEnv?.cleanup();
  });

  beforeEach(async () => {
    await testEnv.clearFirestore();
    await seedMember(OWNER_UID, "owner", "hungtran00.nt@gmail.com", "hung");
    await seedMember(
      ADMIN_UID,
      "admin",
      "huynhnhatthinh.2003@gmail.com",
      "thinh",
    );
    await seedMember(
      MEMBER_UID,
      "member",
      "huynhthanhthao14062001@gmail.com",
      "thao",
    );
  });

  it("allows owner to update member roles and group config", async () => {
    const ownerDb = testEnv.authenticatedContext(OWNER_UID, {
      email: "hungtran00.nt@gmail.com",
    }).firestore();

    await assertSucceeds(
      ownerDb.doc(`groups/P102/members/${MEMBER_UID}`).set(
        {
          uid: MEMBER_UID,
          email: "huynhthanhthao14062001@gmail.com",
          memberId: "thao",
          role: "admin",
        },
        { merge: true },
      ),
    );

    await assertSucceeds(
      ownerDb.doc("groups/P102").set(
        {
          updatedAt: "now",
        },
        { merge: true },
      ),
    );
  });

  it("allows operators to create and update monthly payments, rents, and period snapshots", async () => {
    const adminDb = testEnv.authenticatedContext(ADMIN_UID, {
      email: "huynhnhatthinh.2003@gmail.com",
    }).firestore();

    await assertSucceeds(
      adminDb.doc("groups/P102/payments/pay-1").set(paymentPayload(ADMIN_UID)),
    );
    await assertSucceeds(
      adminDb.doc("groups/P102/payments/pay-1").set(
        {
          amount: 120000,
        },
        { merge: true },
      ),
    );

    await assertSucceeds(
      adminDb.doc("groups/P102/rents/2026-03").set(rentPayload("2026-03", ADMIN_UID)),
    );
    await assertSucceeds(
      adminDb.doc("groups/P102/rents/2026-03").set(
        {
          note: "Cap nhat",
        },
        { merge: true },
      ),
    );

    await assertSucceeds(
      adminDb.doc("groups/P102/periods/2026-03").set(periodPayload("2026-03", ADMIN_UID)),
    );
    await assertSucceeds(
      adminDb.doc("groups/P102/periods/2026-03").set(
        {
          stats: {
            ...periodPayload("2026-03", ADMIN_UID).stats,
            expenseCount: 2,
          },
        },
        { merge: true },
      ),
    );
  });

  it("blocks operators from changing member roles or group config", async () => {
    const adminDb = testEnv.authenticatedContext(ADMIN_UID, {
      email: "huynhnhatthinh.2003@gmail.com",
    }).firestore();

    await assertFails(
      adminDb.doc(`groups/P102/members/${MEMBER_UID}`).set(
        {
          uid: MEMBER_UID,
          email: "huynhthanhthao14062001@gmail.com",
          memberId: "thao",
          role: "admin",
        },
        { merge: true },
      ),
    );

    await assertFails(
      adminDb.doc("groups/P102").set(
        {
          updatedAt: "now",
        },
        { merge: true },
      ),
    );
  });

  it("allows members to read members and update only their own soft profile fields", async () => {
    const memberDb = testEnv.authenticatedContext(MEMBER_UID, {
      email: "huynhthanhthao14062001@gmail.com",
    }).firestore();

    await assertSucceeds(memberDb.doc(`groups/P102/members/${OWNER_UID}`).get());

    await assertSucceeds(
      memberDb.doc(`groups/P102/members/${MEMBER_UID}`).set(
        {
          displayName: "Thao moi",
          photoURL: "https://example.com/avatar.png",
          updatedAt: "now",
        },
        { merge: true },
      ),
    );
  });

  it("blocks members from changing their own role or memberId", async () => {
    const memberDb = testEnv.authenticatedContext(MEMBER_UID, {
      email: "huynhthanhthao14062001@gmail.com",
    }).firestore();

    await assertFails(
      memberDb.doc(`groups/P102/members/${MEMBER_UID}`).set(
        {
          role: "admin",
        },
        { merge: true },
      ),
    );

    await assertFails(
      memberDb.doc(`groups/P102/members/${MEMBER_UID}`).set(
        {
          memberId: "hung",
        },
        { merge: true },
      ),
    );
  });

  it("blocks members from writing payments, rents, and periods", async () => {
    const memberDb = testEnv.authenticatedContext(MEMBER_UID, {
      email: "huynhthanhthao14062001@gmail.com",
    }).firestore();

    await assertFails(
      memberDb.doc("groups/P102/payments/pay-1").set(paymentPayload(MEMBER_UID)),
    );
    await assertFails(
      memberDb.doc("groups/P102/rents/2026-03").set(rentPayload("2026-03", MEMBER_UID)),
    );
    await assertFails(
      memberDb.doc("groups/P102/periods/2026-03").set(periodPayload("2026-03", MEMBER_UID)),
    );
  });

  it("blocks outsiders from reading rent docs", async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await context.firestore()
        .doc("groups/P102/rents/2026-03")
        .set(rentPayload("2026-03", OWNER_UID));
    });

    const outsiderDb = testEnv.authenticatedContext("outsider-uid", {
      email: "outsider@example.com",
    }).firestore();

    await assertFails(outsiderDb.doc("groups/P102/rents/2026-03").get());
  });

  it("blocks unexpected fields in rent payload", async () => {
    const ownerDb = testEnv.authenticatedContext(OWNER_UID, {
      email: "hungtran00.nt@gmail.com",
    }).firestore();

    await assertFails(
      ownerDb.doc("groups/P102/rents/2026-03").set({
        ...rentPayload("2026-03", OWNER_UID),
        evil: true,
      }),
    );
  });
});
