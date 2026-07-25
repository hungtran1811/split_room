import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from "@firebase/rules-unit-testing";
import fs from "node:fs";

const OWNER_UID = "owner-uid";
const ADMIN_UID = "admin-uid";
const MEMBER_UID = "member-uid";
const OUTSIDER_UID = "outsider-uid";
const OTHER_OWNER_UID = "other-owner-uid";
const NEW_MEMBER_UID = "new-member-uid";
const GROUP_ID = "P102";
const OTHER_GROUP_ID = "P202";

let testEnv;

function rentPayload(period, uid) {
  return {
    period,
    payerId: "owner",
    items: { rent: 4000000, wifi: 150000, other: 0 },
    total: 4850000,
    headcount: 4,
    water: { unitPrice: 100000, mode: "perPerson" },
    electric: { oldKwh: 11214, newKwh: 11289, unitPrice: 4000 },
    computed: { waterCost: 400000, kwhUsed: 75, electricCost: 300000 },
    splitMode: "equal",
    shares: { owner: 1326000, admin: 1787000, member: 1637000, guest: 100000 },
    paid: { owner: 0, admin: 0, member: 0, guest: 0 },
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
      balances: { owner: 1000, member: -1000 },
      settlementPlan: [{ fromId: "member", toId: "owner", amount: 1000 }],
      rent: {
        payerId: "owner",
        total: 2000,
        collected: 1000,
        remaining: 1000,
      },
      members: [
        {
          memberId: "owner",
          name: "Owner",
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
    fromId: "member",
    toId: "owner",
    amount,
    note: "Tra no",
    createdBy: uid,
  };
}

function memberPayload(uid, role, memberId = uid) {
  return {
    uid,
    email: `${uid}@example.test`,
    memberId,
    role,
    displayName: memberId,
    photoURL: "",
  };
}

function authenticatedDb(uid) {
  return testEnv.authenticatedContext(uid, {
    email: `${uid}@example.test`,
  }).firestore();
}

async function seedGroup(groupId, members) {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await db.doc(`groups/${groupId}`).set({
      name: groupId,
      createdBy: members[0]?.uid || "seed",
    });

    for (const member of members) {
      await db.doc(`groups/${groupId}/members/${member.uid}`).set(member);
    }
  });
}

async function seedNestedDocs() {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await db.doc(`groups/${GROUP_ID}/rents/2026-03`).set(rentPayload("2026-03", OWNER_UID));
    await db.doc(`groups/${GROUP_ID}/expenses/exp-seeded`).set({
      date: "2026-03-15",
      amount: 120000,
      payerId: "member",
      participants: ["member", "owner"],
      debts: { owner: 60000 },
      note: "An trua",
      createdBy: MEMBER_UID,
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
    await seedGroup(GROUP_ID, [
      memberPayload(OWNER_UID, "owner", "owner"),
      memberPayload(ADMIN_UID, "admin", "admin"),
      memberPayload(MEMBER_UID, "member", "member"),
    ]);
    await seedGroup(OTHER_GROUP_ID, [
      memberPayload(OTHER_OWNER_UID, "owner", "other-owner"),
    ]);
  });

  it("blocks anonymous users from reading groups and nested data", async () => {
    await seedNestedDocs();
    const anonymousDb = testEnv.unauthenticatedContext().firestore();

    await assertFails(anonymousDb.doc(`groups/${GROUP_ID}`).get());
    await assertFails(anonymousDb.doc(`groups/${GROUP_ID}/members/${OWNER_UID}`).get());
    await assertFails(anonymousDb.doc(`groups/${GROUP_ID}/rents/2026-03`).get());
  });

  it("blocks outsiders from reading a group or self-joining it", async () => {
    const outsiderDb = authenticatedDb(OUTSIDER_UID);

    await assertFails(outsiderDb.doc(`groups/${GROUP_ID}`).get());
    await assertFails(outsiderDb.doc(`groups/${GROUP_ID}/members/${OWNER_UID}`).get());
    await assertFails(
      outsiderDb.doc(`groups/${GROUP_ID}/members/${OUTSIDER_UID}`).set(
        memberPayload(OUTSIDER_UID, "member", "outsider"),
      ),
    );
  });

  it("isolates data between groups", async () => {
    const memberDb = authenticatedDb(MEMBER_UID);

    await assertSucceeds(memberDb.doc(`groups/${GROUP_ID}`).get());
    await assertFails(memberDb.doc(`groups/${OTHER_GROUP_ID}`).get());
    await assertFails(
      memberDb.doc(`groups/${OTHER_GROUP_ID}/members/${OTHER_OWNER_UID}`).get(),
    );
  });

  it("allows a creator to bootstrap a group and owner membership in one atomic batch", async () => {
    const creatorUid = "creator-uid";
    const creatorDb = authenticatedDb(creatorUid);
    const batch = creatorDb.batch();

    batch.set(creatorDb.doc("groups/NEW"), {
      name: "NEW",
      createdBy: creatorUid,
    });
    batch.set(
      creatorDb.doc(`groups/NEW/members/${creatorUid}`),
      memberPayload(creatorUid, "owner", "creator"),
    );

    await assertSucceeds(batch.commit());
    await assertSucceeds(creatorDb.doc("groups/NEW").get());
  });

  it("blocks group creation without an atomic owner membership", async () => {
    const creatorDb = authenticatedDb("orphan-creator-uid");

    await assertFails(
      creatorDb.doc("groups/ORPHAN").set({
        name: "ORPHAN",
        createdBy: "orphan-creator-uid",
      }),
    );
  });

  it("allows owners to create members, update roles, and update group config", async () => {
    const ownerDb = authenticatedDb(OWNER_UID);

    await assertSucceeds(
      ownerDb.doc(`groups/${GROUP_ID}/members/${NEW_MEMBER_UID}`).set(
        memberPayload(NEW_MEMBER_UID, "member", "new-member"),
      ),
    );

    await assertSucceeds(
      ownerDb.doc(`groups/${GROUP_ID}/members/${MEMBER_UID}`).set(
        {
          role: "admin",
        },
        { merge: true },
      ),
    );

    await assertSucceeds(
      ownerDb.doc(`groups/${GROUP_ID}`).set(
        {
          updatedAt: "now",
        },
        { merge: true },
      ),
    );
  });

  it("blocks owners from changing immutable member identity fields", async () => {
    const ownerDb = authenticatedDb(OWNER_UID);

    await assertFails(
      ownerDb.doc(`groups/${GROUP_ID}/members/${MEMBER_UID}`).set(
        {
          email: "changed@example.test",
        },
        { merge: true },
      ),
    );

    await assertFails(
      ownerDb.doc(`groups/${GROUP_ID}/members/${MEMBER_UID}`).set(
        {
          memberId: "changed-id",
        },
        { merge: true },
      ),
    );
  });

  it("allows operators to create and update monthly payments, rents, and period snapshots", async () => {
    const adminDb = authenticatedDb(ADMIN_UID);

    await assertSucceeds(
      adminDb.doc(`groups/${GROUP_ID}/payments/pay-1`).set(paymentPayload(ADMIN_UID)),
    );
    await assertSucceeds(
      adminDb.doc(`groups/${GROUP_ID}/payments/pay-1`).set(
        {
          amount: 120000,
        },
        { merge: true },
      ),
    );

    await assertSucceeds(
      adminDb.doc(`groups/${GROUP_ID}/rents/2026-03`).set(
        rentPayload("2026-03", ADMIN_UID),
      ),
    );
    await assertSucceeds(
      adminDb.doc(`groups/${GROUP_ID}/rents/2026-03`).set(
        {
          note: "Cap nhat",
        },
        { merge: true },
      ),
    );

    await assertSucceeds(
      adminDb.doc(`groups/${GROUP_ID}/periods/2026-03`).set(
        periodPayload("2026-03", ADMIN_UID),
      ),
    );
    await assertSucceeds(
      adminDb.doc(`groups/${GROUP_ID}/periods/2026-03`).set(
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

  it("blocks admins from changing member roles or group config", async () => {
    const adminDb = authenticatedDb(ADMIN_UID);

    await assertFails(
      adminDb.doc(`groups/${GROUP_ID}/members/${MEMBER_UID}`).set(
        {
          role: "admin",
        },
        { merge: true },
      ),
    );

    await assertFails(
      adminDb.doc(`groups/${GROUP_ID}`).set(
        {
          updatedAt: "now",
        },
        { merge: true },
      ),
    );
  });

  it("allows members to read group members and update only their own soft profile fields", async () => {
    const memberDb = authenticatedDb(MEMBER_UID);

    await assertSucceeds(memberDb.doc(`groups/${GROUP_ID}`).get());
    await assertSucceeds(memberDb.doc(`groups/${GROUP_ID}/members/${OWNER_UID}`).get());

    await assertSucceeds(
      memberDb.doc(`groups/${GROUP_ID}/members/${MEMBER_UID}`).set(
        {
          displayName: "Member moi",
          photoURL: "https://example.com/avatar.png",
          updatedAt: "now",
        },
        { merge: true },
      ),
    );
  });

  it("blocks members from changing their own role, memberId, or email", async () => {
    const memberDb = authenticatedDb(MEMBER_UID);

    await assertFails(
      memberDb.doc(`groups/${GROUP_ID}/members/${MEMBER_UID}`).set(
        {
          role: "admin",
        },
        { merge: true },
      ),
    );

    await assertFails(
      memberDb.doc(`groups/${GROUP_ID}/members/${MEMBER_UID}`).set(
        {
          memberId: "owner",
        },
        { merge: true },
      ),
    );

    await assertFails(
      memberDb.doc(`groups/${GROUP_ID}/members/${MEMBER_UID}`).set(
        {
          email: "changed@example.test",
        },
        { merge: true },
      ),
    );
  });

  it("blocks members from writing payments, rents, and periods", async () => {
    const memberDb = authenticatedDb(MEMBER_UID);

    await assertFails(
      memberDb.doc(`groups/${GROUP_ID}/payments/pay-1`).set(paymentPayload(MEMBER_UID)),
    );
    await assertFails(
      memberDb.doc(`groups/${GROUP_ID}/rents/2026-03`).set(
        rentPayload("2026-03", MEMBER_UID),
      ),
    );
    await assertFails(
      memberDb.doc(`groups/${GROUP_ID}/periods/2026-03`).set(
        periodPayload("2026-03", MEMBER_UID),
      ),
    );
  });

  it("allows members to create expenses but not update or delete them", async () => {
    const memberDb = authenticatedDb(MEMBER_UID);
    const expenseRef = memberDb.doc(`groups/${GROUP_ID}/expenses/exp-1`);

    await assertSucceeds(
      expenseRef.set({
        date: "2026-03-15",
        amount: 120000,
        payerId: "member",
        participants: ["member", "owner"],
        debts: { owner: 60000 },
        note: "An trua",
        createdBy: MEMBER_UID,
      }),
    );

    await assertFails(expenseRef.set({ note: "Sua ghi chu" }, { merge: true }));
    await assertFails(expenseRef.delete());
  });

  it("blocks unexpected fields in rent payload", async () => {
    const ownerDb = authenticatedDb(OWNER_UID);

    await assertFails(
      ownerDb.doc(`groups/${GROUP_ID}/rents/2026-03`).set({
        ...rentPayload("2026-03", OWNER_UID),
        evil: true,
      }),
    );
  });

  it("keeps the seeded membership roles unchanged after denied writes", async () => {
    const adminDb = authenticatedDb(ADMIN_UID);
    await assertFails(
      adminDb.doc(`groups/${GROUP_ID}/members/${ADMIN_UID}`).set(
        { role: "owner" },
        { merge: true },
      ),
    );

    await testEnv.withSecurityRulesDisabled(async (context) => {
      const snapshot = await context.firestore()
        .doc(`groups/${GROUP_ID}/members/${ADMIN_UID}`)
        .get();
      expect(snapshot.data().role).toBe("admin");
    });
  });
});
