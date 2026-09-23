import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from "@firebase/rules-unit-testing";
import fs from "node:fs";
import { serverTimestamp } from "firebase/firestore";

const OWNER_UID = "owner-uid";
const ADMIN_UID = "admin-uid";
const MEMBER_UID = "member-uid";
const SECOND_MEMBER_UID = "second-member-uid";
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

function calendarPayload(ownerUid, memberUids = [ownerUid, ownerUid === MEMBER_UID ? OWNER_UID : MEMBER_UID], kind = "shared") {
  return {
    name: kind === "private" ? "Ca nhan" : "Ke hoach A-B",
    kind,
    ownerUid,
    memberUids,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };
}

function calendarEntryPayload(uid, overrides = {}) {
  return {
    uid,
    title: "Di hoc",
    description: "Chi tiet lich",
    location: "Nha",
    startAt: new Date("2026-09-14T08:00:00+07:00"),
    endAt: new Date("2026-09-14T10:00:00+07:00"),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    ...overrides,
  };
}

function calendarPath(calendarId, groupId = GROUP_ID) {
  return `groups/${groupId}/calendars/${calendarId}`;
}

async function createAudienceCalendars() {
  await assertSucceeds(authenticatedDb(OWNER_UID).doc(calendarPath("shared-ab")).set(
    calendarPayload(OWNER_UID, [OWNER_UID, MEMBER_UID]),
  ));
  await assertSucceeds(authenticatedDb(MEMBER_UID).doc(calendarPath(`private_${MEMBER_UID}`)).set(
    calendarPayload(MEMBER_UID, [MEMBER_UID], "private"),
  ));
  await assertSucceeds(authenticatedDb(MEMBER_UID).doc(`${calendarPath("shared-ab")}/entries/from-b`).set(
    calendarEntryPayload(MEMBER_UID),
  ));
  await assertSucceeds(authenticatedDb(MEMBER_UID).doc(`${calendarPath(`private_${MEMBER_UID}`)}/entries/personal`).set(
    calendarEntryPayload(MEMBER_UID),
  ));
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
      memberPayload(SECOND_MEMBER_UID, "member", "second-member"),
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

  it("allows admin to update expenses but only owner can delete", async () => {
    await seedNestedDocs();
    const adminDb = authenticatedDb(ADMIN_UID);
    const ownerDb = authenticatedDb(OWNER_UID);
    const seededRef = adminDb.doc(`groups/${GROUP_ID}/expenses/exp-seeded`);
    const ownerSeededRef = ownerDb.doc(`groups/${GROUP_ID}/expenses/exp-seeded`);

    await assertSucceeds(seededRef.set({ note: "Admin sua" }, { merge: true }));
    await assertFails(seededRef.delete());

    await testEnv.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();
      await db.doc(`groups/${GROUP_ID}/expenses/exp-owner-del`).set({
        date: "2026-03-16",
        amount: 50000,
        payerId: "owner",
        participants: ["owner", "member"],
        debts: { member: 25000 },
        note: "Xoa duoc",
        createdBy: OWNER_UID,
      });
    });

    await assertSucceeds(ownerDb.doc(`groups/${GROUP_ID}/expenses/exp-owner-del`).delete());
    await assertSucceeds(ownerSeededRef.set({ note: "Owner sua" }, { merge: true }));
  });

  it("blocks invalid expense creates and locked-period writes", async () => {
    const memberDb = authenticatedDb(MEMBER_UID);
    const adminDb = authenticatedDb(ADMIN_UID);

    await assertFails(
      memberDb.doc(`groups/${GROUP_ID}/expenses/exp-bad`).set({
        date: "2026-03-15",
        amount: -1,
        payerId: "member",
        debts: { owner: 1 },
        createdBy: MEMBER_UID,
      }),
    );

    await assertFails(
      memberDb.doc(`groups/${GROUP_ID}/expenses/exp-spoof`).set({
        date: "2026-03-15",
        amount: 1000,
        payerId: "member",
        debts: { owner: 1000 },
        createdBy: OWNER_UID,
      }),
    );

    await assertSucceeds(
      adminDb.doc(`groups/${GROUP_ID}/periods/2026-04`).set({
        period: "2026-04",
        lockedSoft: true,
        snapshotType: "month-close",
      }),
    );

    await assertFails(
      memberDb.doc(`groups/${GROUP_ID}/expenses/exp-locked`).set({
        date: "2026-04-10",
        amount: 1000,
        payerId: "member",
        debts: { owner: 1000 },
        createdBy: MEMBER_UID,
      }),
    );

    await assertFails(
      adminDb.doc(`groups/${GROUP_ID}/payments/pay-locked`).set({
        date: "2026-04-10",
        amount: 1000,
        fromId: "member",
        toId: "owner",
        createdBy: ADMIN_UID,
      }),
    );

    await assertFails(
      adminDb.doc(`groups/${GROUP_ID}/rents/2026-04`).set(
        rentPayload("2026-04", ADMIN_UID),
      ),
    );
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

  it("allows any group member to set and clear shared nicknames", async () => {
    const memberDb = authenticatedDb(MEMBER_UID);
    const outsiderDb = authenticatedDb(OUTSIDER_UID);

    await assertSucceeds(
      memberDb.doc(`groups/${GROUP_ID}/nicknames/thao`).set({
        nickname: "Meo",
        updatedBy: MEMBER_UID,
        updatedAt: "now",
      }),
    );

    await assertSucceeds(
      memberDb.doc(`groups/${GROUP_ID}/nicknames/thao`).delete(),
    );

    await assertFails(
      outsiderDb.doc(`groups/${GROUP_ID}/nicknames/thao`).set({
        nickname: "Hack",
        updatedBy: OUTSIDER_UID,
        updatedAt: "now",
      }),
    );

    await assertFails(
      memberDb.doc(`groups/${GROUP_ID}/nicknames/thao`).set({
        nickname: "x".repeat(40),
        updatedBy: MEMBER_UID,
        updatedAt: "now",
      }),
    );

    await assertFails(
      memberDb.doc(`groups/${GROUP_ID}/nicknames/thao`).set({
        nickname: "Meo",
        updatedBy: OWNER_UID,
        updatedAt: "now",
      }),
    );
  });

  it("lets group members read calendar entries and write only their own", async () => {
    const memberDb = authenticatedDb(MEMBER_UID);
    const ownerDb = authenticatedDb(OWNER_UID);
    const outsiderDb = authenticatedDb(OUTSIDER_UID);
    const start = new Date("2026-09-14T08:00:00+07:00");
    const end = new Date("2026-09-14T10:00:00+07:00");

    const payload = {
      uid: MEMBER_UID,
      title: "Di hoc",
      description: "",
      location: "Nha",
      startAt: start,
      endAt: end,
      createdAt: start,
      updatedAt: start,
    };

    await assertSucceeds(
      memberDb.doc(`groups/${GROUP_ID}/calendarEntries/cal-member`).set(payload),
    );

    await assertSucceeds(
      memberDb.doc(`groups/${GROUP_ID}/calendarEntries/cal-member`).get(),
    );

    await assertSucceeds(
      ownerDb.doc(`groups/${GROUP_ID}/calendarEntries/cal-member`).get(),
    );

    await assertFails(
      ownerDb.doc(`groups/${GROUP_ID}/calendarEntries/cal-member`).update({
        title: "Hack",
        updatedAt: end,
      }),
    );

    await assertFails(
      ownerDb.doc(`groups/${GROUP_ID}/calendarEntries/cal-member`).delete(),
    );

    await assertFails(
      memberDb.doc(`groups/${GROUP_ID}/calendarEntries/cal-other`).set({
        ...payload,
        uid: OWNER_UID,
      }),
    );

    await assertFails(
      outsiderDb.doc(`groups/${GROUP_ID}/calendarEntries/cal-member`).get(),
    );

    await assertFails(
      outsiderDb.doc(`groups/${GROUP_ID}/calendarEntries/cal-out`).set(payload),
    );

    await assertSucceeds(
      memberDb.doc(`groups/${GROUP_ID}/calendarEntries/cal-member`).update({
        title: "Di hoc 2",
        description: "",
        location: "Nha",
        startAt: start,
        endAt: end,
        uid: MEMBER_UID,
        createdAt: start,
        updatedAt: end,
      }),
    );

    await assertFails(
      memberDb.doc(`groups/${GROUP_ID}/calendarEntries/cal-member`).update({
        title: "Di hoc 3",
        description: "",
        location: "Nha",
        startAt: start,
        endAt: end,
        uid: OWNER_UID,
        createdAt: start,
        updatedAt: end,
      }),
    );
  });

  it("blocks calendar writes from removed members", async () => {
    const removedUid = "removed-uid";
    await seedGroup(GROUP_ID, [
      memberPayload(OWNER_UID, "owner", "owner"),
      memberPayload(ADMIN_UID, "admin", "admin"),
      memberPayload(MEMBER_UID, "member", "member"),
      memberPayload(removedUid, "member", "removed"),
    ]);

    const start = new Date("2026-09-14T08:00:00+07:00");
    const end = new Date("2026-09-14T10:00:00+07:00");
    const payload = {
      uid: removedUid,
      title: "Cu",
      description: "",
      location: "",
      startAt: start,
      endAt: end,
      createdAt: start,
      updatedAt: start,
    };

    await assertSucceeds(
      authenticatedDb(removedUid).doc(`groups/${GROUP_ID}/calendarEntries/cal-removed`).set(payload),
    );

    await testEnv.withSecurityRulesDisabled(async (context) => {
      await context.firestore().doc(`groups/${GROUP_ID}/members/${removedUid}`).delete();
    });

    await assertFails(
      authenticatedDb(removedUid).doc(`groups/${GROUP_ID}/calendarEntries/cal-removed`).update({
        ...payload,
        title: "Moi",
      }),
    );

    await assertFails(
      authenticatedDb(removedUid).doc(`groups/${GROUP_ID}/calendarEntries/cal-removed`).get(),
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

  describe("calendar audiences", () => {
    it.each(["group", "private", "shared"])("allows an author's atomic multi-event deletion in the %s calendar", async (kind) => {
      await createAudienceCalendars();
      const path = kind === "group" ? `groups/${GROUP_ID}/calendarEntries`
        : `${calendarPath(kind === "private" ? `private_${MEMBER_UID}` : "shared-ab")}/entries`;
      const ids = Array.from({ length: 14 }, (_, index) => `delete-following-${index}`);
      await testEnv.withSecurityRulesDisabled(async (context) => {
        const db = context.firestore();
        const batch = db.batch();
        for (const id of ids) batch.set(db.doc(`${path}/${id}`), calendarEntryPayload(MEMBER_UID));
        await batch.commit();
      });
      const db = authenticatedDb(MEMBER_UID);
      const ownEntries = await assertSucceeds(db.collection(path).where("uid", "==", MEMBER_UID).get());
      expect(ownEntries.docs.filter((entry) => ids.includes(entry.id))).toHaveLength(14);
      await assertSucceeds(db.runTransaction(async (transaction) => {
        const refs = ids.map((id) => db.doc(`${path}/${id}`));
        const snapshots = await Promise.all(refs.map((ref) => transaction.get(ref)));
        expect(snapshots.every((snapshot) => snapshot.data().uid === MEMBER_UID)).toBe(true);
        refs.forEach((ref) => transaction.delete(ref));
      }));
      await testEnv.withSecurityRulesDisabled(async (context) => {
        const snapshots = await Promise.all(ids.map((id) => context.firestore().doc(`${path}/${id}`).get()));
        expect(snapshots.every((snapshot) => !snapshot.exists)).toBe(true);
      });
    });

    it("rejects the entire multi-event deletion if any event belongs to someone else", async () => {
      await createAudienceCalendars();
      const path = `${calendarPath("shared-ab")}/entries`;
      const db = authenticatedDb(OWNER_UID);
      await db.doc(`${path}/from-a`).set(calendarEntryPayload(OWNER_UID));
      await assertFails(db.runTransaction(async (transaction) => {
        const refs = [db.doc(`${path}/from-a`), db.doc(`${path}/from-b`)];
        await Promise.all(refs.map((ref) => transaction.get(ref)));
        refs.forEach((ref) => transaction.delete(ref));
      }));
      expect((await db.doc(`${path}/from-a`).get()).exists).toBe(true);
      expect((await db.doc(`${path}/from-b`).get()).exists).toBe(true);
    });

    it("keeps previously previewed events when the author loses calendar access before deletion", async () => {
      await createAudienceCalendars();
      const ownerDb = authenticatedDb(OWNER_UID);
      const memberDb = authenticatedDb(MEMBER_UID);
      const path = `${calendarPath("shared-ab")}/entries/from-b`;
      await assertSucceeds(memberDb.doc(path).get());
      await ownerDb.doc(calendarPath("shared-ab")).update({ memberUids: [OWNER_UID], updatedAt: serverTimestamp() });
      await assertFails(memberDb.runTransaction(async (transaction) => {
        await transaction.get(memberDb.doc(path));
        transaction.delete(memberDb.doc(path));
      }));
      expect((await ownerDb.doc(path).get()).exists).toBe(true);
    });

    it("shows the common calendar to all four members and isolates private/shared calendars", async () => {
      await createAudienceCalendars();
      const commonPath = `groups/${GROUP_ID}/calendarEntries/common`;
      await assertSucceeds(authenticatedDb(MEMBER_UID).doc(commonPath).set(calendarEntryPayload(MEMBER_UID)));

      for (const uid of [OWNER_UID, MEMBER_UID, ADMIN_UID, SECOND_MEMBER_UID]) {
        const db = authenticatedDb(uid);
        await assertSucceeds(db.doc(commonPath).get());
        const sharedParent = db.doc(calendarPath("shared-ab"));
        const sharedEntry = db.doc(`${calendarPath("shared-ab")}/entries/from-b`);
        const personalParent = db.doc(calendarPath(`private_${MEMBER_UID}`));
        const personalEntry = db.doc(`${calendarPath(`private_${MEMBER_UID}`)}/entries/personal`);

        if ([OWNER_UID, MEMBER_UID].includes(uid)) {
          await assertSucceeds(sharedParent.get());
          await assertSucceeds(sharedEntry.get());
        } else {
          await assertFails(sharedParent.get());
          await assertFails(sharedEntry.get());
        }
        if (uid === MEMBER_UID) {
          await assertSucceeds(personalParent.get());
          await assertSucceeds(personalEntry.get());
        } else {
          await assertFails(personalParent.get());
          await assertFails(personalEntry.get());
        }
      }
    });

    it("requires audience-filtered parent queries and supports weekly entry overlap queries", async () => {
      await createAudienceCalendars();
      const db = authenticatedDb(MEMBER_UID);
      const calendars = db.collection(`groups/${GROUP_ID}/calendars`);
      const visible = await assertSucceeds(calendars.where("memberUids", "array-contains", MEMBER_UID).get());
      expect(visible.docs.map((item) => item.id).sort()).toEqual([`private_${MEMBER_UID}`, "shared-ab"].sort());
      await assertFails(calendars.get());
      await assertFails(calendars.where("memberUids", "array-contains", OWNER_UID).get());

      const empty = await assertSucceeds(authenticatedDb(SECOND_MEMBER_UID)
        .collection(`groups/${GROUP_ID}/calendars`)
        .where("memberUids", "array-contains", SECOND_MEMBER_UID).get());
      expect(empty.empty).toBe(true);

      const weekQuery = (client) => client.collection(`${calendarPath("shared-ab")}/entries`)
        .where("endAt", ">", new Date("2026-09-14T00:00:00+07:00"))
        .where("startAt", "<", new Date("2026-09-21T00:00:00+07:00"))
        .orderBy("endAt", "asc").orderBy("startAt", "asc");
      expect((await assertSucceeds(weekQuery(db).get())).size).toBe(1);
      await assertFails(weekQuery(authenticatedDb(ADMIN_UID)).get());
    });

    it("denies anonymous, outside-group, and cross-group access even with known IDs", async () => {
      await createAudienceCalendars();
      for (const db of [testEnv.unauthenticatedContext().firestore(), authenticatedDb(OUTSIDER_UID), authenticatedDb(OTHER_OWNER_UID)]) {
        await assertFails(db.doc(calendarPath("shared-ab")).get());
        await assertFails(db.doc(`${calendarPath("shared-ab")}/entries/from-b`).get());
        await assertFails(db.doc(calendarPath(`private_${MEMBER_UID}`)).get());
        await assertFails(db.collection(`groups/${GROUP_ID}/calendars`).get());
      }
      const memberDb = authenticatedDb(MEMBER_UID);
      await assertFails(memberDb.doc(calendarPath("forged", OTHER_GROUP_ID)).set(calendarPayload(MEMBER_UID)));
      await assertFails(memberDb.doc(`${calendarPath("shared-ab")}/entries/spoof`).set(calendarEntryPayload(OWNER_UID)));
      await assertFails(authenticatedDb(OUTSIDER_UID).doc(`${calendarPath("shared-ab")}/entries/outside`).set(calendarEntryPayload(OUTSIDER_UID)));
    });

    it("bootstraps only the requester's deterministic private calendar and prevents ID squatting", async () => {
      const db = authenticatedDb(MEMBER_UID);
      const ref = db.doc(calendarPath(`private_${MEMBER_UID}`));
      await assertSucceeds(db.runTransaction(async (tx) => {
        const current = await tx.get(ref);
        expect(current.exists).toBe(false);
        tx.set(ref, calendarPayload(MEMBER_UID, [MEMBER_UID], "private"));
      }));
      await assertSucceeds(ref.get());
      await assertFails(db.doc(calendarPath(`private_${ADMIN_UID}`)).get());
      await assertFails(db.doc(calendarPath("unknown-shared")).get());
      await assertFails(authenticatedDb(OUTSIDER_UID).doc(calendarPath(`private_${OUTSIDER_UID}`)).get());
      await assertFails(db.doc(calendarPath(`private_${ADMIN_UID}`)).set(calendarPayload(MEMBER_UID)));
      await assertFails(db.doc(calendarPath("wrong-private-id")).set(calendarPayload(MEMBER_UID, [MEMBER_UID], "private")));
      await assertFails(db.doc(calendarPath(`private_${OWNER_UID}`)).set(calendarPayload(OWNER_UID, [OWNER_UID], "private")));
      await assertFails(ref.update({ name: "Rename", updatedAt: serverTimestamp() }));
      await assertFails(ref.update({ memberUids: [MEMBER_UID, OWNER_UID], updatedAt: serverTimestamp() }));
      await assertFails(ref.delete());
    });

    it("rejects malformed calendars, forged ownership, and client-supplied creation timestamps", async () => {
      const db = authenticatedDb(MEMBER_UID);
      const invalid = [
        { ownerUid: OWNER_UID, memberUids: [OWNER_UID, MEMBER_UID] },
        { memberUids: [OWNER_UID] },
        { memberUids: [MEMBER_UID, MEMBER_UID] },
        { memberUids: [] },
        { memberUids: MEMBER_UID },
        { name: "" },
        { name: "x".repeat(81) },
        { kind: "public" },
        { unexpected: true },
        { createdAt: new Date("2020-01-01") },
        { updatedAt: new Date("2020-01-01") },
      ];
      for (const [index, overrides] of invalid.entries()) {
        await assertFails(db.doc(calendarPath(`invalid-${index}`)).set({ ...calendarPayload(MEMBER_UID), ...overrides }));
      }
      await assertFails(db.doc(calendarPath(`private_${MEMBER_UID}`)).set(
        calendarPayload(MEMBER_UID, [MEMBER_UID, OWNER_UID], "private"),
      ));
      await assertFails(authenticatedDb(OUTSIDER_UID).doc(calendarPath("outside-parent")).set(calendarPayload(OUTSIDER_UID)));
    });

    it("lets only the shared-calendar owner manage audience while preventing transfer, conversion, and deletion", async () => {
      const path = calendarPath("member-owned");
      const memberRef = authenticatedDb(MEMBER_UID).doc(path);
      await assertSucceeds(memberRef.set(calendarPayload(MEMBER_UID, [MEMBER_UID, OWNER_UID, ADMIN_UID])));
      await assertSucceeds(memberRef.update({ name: "Renamed", memberUids: [MEMBER_UID, OWNER_UID], updatedAt: serverTimestamp() }));
      for (const uid of [OWNER_UID, ADMIN_UID]) {
        const otherRef = authenticatedDb(uid).doc(path);
        await assertFails(otherRef.update({ name: "Hijacked", updatedAt: serverTimestamp() }));
        await assertFails(otherRef.update({ memberUids: [uid], updatedAt: serverTimestamp() }));
        await assertFails(otherRef.delete());
      }
      for (const overrides of [
        { ownerUid: OWNER_UID },
        { kind: "private" },
        { memberUids: [OWNER_UID] },
        { createdAt: new Date("2020-01-01") },
        { updatedAt: new Date("2020-01-01") },
      ]) {
        await assertFails(memberRef.update({ updatedAt: serverTimestamp(), ...overrides }));
      }
      await assertFails(memberRef.delete());
    });

    it("allows event changes only by the author and keeps event identity and timestamps valid", async () => {
      await createAudienceCalendars();
      const path = `${calendarPath("shared-ab")}/entries/from-b`;
      const authorRef = authenticatedDb(MEMBER_UID).doc(path);
      await assertSucceeds(authorRef.update({ title: "Updated", updatedAt: serverTimestamp() }));
      const ownerRef = authenticatedDb(OWNER_UID).doc(path);
      await assertFails(ownerRef.update({ title: "Owner override", updatedAt: serverTimestamp() }));
      await assertFails(ownerRef.delete());
      await assertFails(authenticatedDb(ADMIN_UID).doc(path).update({ title: "Admin override", updatedAt: serverTimestamp() }));

      for (const overrides of [
        { uid: OWNER_UID },
        { createdAt: new Date("2020-01-01") },
        { updatedAt: new Date("2020-01-01") },
        { title: "" },
        { title: "x".repeat(121) },
        { endAt: new Date("2020-01-01") },
        { unexpected: "data" },
      ]) {
        await assertFails(authorRef.update({ updatedAt: serverTimestamp(), ...overrides }));
      }
      await assertFails(authenticatedDb(MEMBER_UID).doc(`${calendarPath("shared-ab")}/entries/old-timestamp`).set(
        calendarEntryPayload(MEMBER_UID, { createdAt: new Date("2020-01-01") }),
      ));
      await assertSucceeds(authorRef.delete());
    });

    it("applies audience changes to historical entries and revokes the removed author's access", async () => {
      await createAudienceCalendars();
      const parentRef = authenticatedDb(OWNER_UID).doc(calendarPath("shared-ab"));
      const entryPath = `${calendarPath("shared-ab")}/entries/from-b`;
      await assertFails(authenticatedDb(ADMIN_UID).doc(entryPath).get());
      await assertSucceeds(parentRef.update({ memberUids: [OWNER_UID, MEMBER_UID, ADMIN_UID], updatedAt: serverTimestamp() }));
      await assertSucceeds(authenticatedDb(ADMIN_UID).doc(entryPath).get());
      await assertSucceeds(authenticatedDb(ADMIN_UID).doc(`${calendarPath("shared-ab")}/entries/from-c`).set(calendarEntryPayload(ADMIN_UID)));
      await assertSucceeds(parentRef.update({ memberUids: [OWNER_UID, ADMIN_UID], updatedAt: serverTimestamp() }));

      const removedDb = authenticatedDb(MEMBER_UID);
      await assertFails(removedDb.doc(calendarPath("shared-ab")).get());
      await assertFails(removedDb.doc(entryPath).get());
      await assertFails(removedDb.doc(entryPath).update({ title: "No access", updatedAt: serverTimestamp() }));
      await assertFails(removedDb.doc(entryPath).delete());
      await assertFails(removedDb.doc(`${calendarPath("shared-ab")}/entries/new`).set(calendarEntryPayload(MEMBER_UID)));
      await assertFails(removedDb.doc(calendarPath("shared-ab")).update({ memberUids: [OWNER_UID, MEMBER_UID], updatedAt: serverTimestamp() }));
      const remaining = await assertSucceeds(removedDb.collection(`groups/${GROUP_ID}/calendars`)
        .where("memberUids", "array-contains", MEMBER_UID).get());
      expect(remaining.docs.map((item) => item.id)).toEqual([`private_${MEMBER_UID}`]);
      expect((await assertSucceeds(authenticatedDb(OWNER_UID).doc(entryPath).get())).data().uid).toBe(MEMBER_UID);
    });

    it("requires current group membership even when the UID remains in the stored audience", async () => {
      await createAudienceCalendars();
      const removedDb = authenticatedDb(MEMBER_UID);
      await assertSucceeds(authenticatedDb(OWNER_UID).doc(`groups/${GROUP_ID}/members/${MEMBER_UID}`).delete());
      for (const id of ["shared-ab", `private_${MEMBER_UID}`]) {
        await assertFails(removedDb.doc(calendarPath(id)).get());
        await assertFails(removedDb.collection(`${calendarPath(id)}/entries`).get());
        await assertFails(removedDb.doc(`${calendarPath(id)}/entries/new`).set(calendarEntryPayload(MEMBER_UID)));
      }
      await assertFails(removedDb.collection(`groups/${GROUP_ID}/calendars`)
        .where("memberUids", "array-contains", MEMBER_UID).get());
      await assertFails(removedDb.doc(`${calendarPath("shared-ab")}/entries/from-b`).delete());
      await assertFails(removedDb.doc(calendarPath("new-shared")).set(calendarPayload(MEMBER_UID)));
      await assertSucceeds(authenticatedDb(OWNER_UID).doc(`${calendarPath("shared-ab")}/entries/from-b`).get());

      await assertSucceeds(authenticatedDb(OWNER_UID).doc(calendarPath("shared-ab")).update({
        memberUids: [OWNER_UID, OUTSIDER_UID], updatedAt: serverTimestamp(),
      }));
      await assertFails(authenticatedDb(OUTSIDER_UID).doc(calendarPath("shared-ab")).get());
      await assertFails(authenticatedDb(OUTSIDER_UID).doc(`${calendarPath("shared-ab")}/entries/from-b`).get());
    });

    it("permits create-if-absent entry copy transactions only within an accessible calendar", async () => {
      await createAudienceCalendars();
      const db = authenticatedDb(MEMBER_UID);
      const ref = db.doc(`${calendarPath("shared-ab")}/entries/copied-next-week`);
      const copy = () => db.runTransaction(async (tx) => {
        const existing = await tx.get(ref);
        if (existing.exists) return "skipped";
        tx.set(ref, calendarEntryPayload(MEMBER_UID, {
          startAt: new Date("2026-09-21T22:00:00+07:00"),
          endAt: new Date("2026-09-22T02:00:00+07:00"),
        }));
        return "added";
      });
      expect(await assertSucceeds(copy())).toBe("added");
      expect(await assertSucceeds(copy())).toBe("skipped");
      await assertSucceeds(db.doc(`${calendarPath(`private_${MEMBER_UID}`)}/entries/not-created-yet`).get());
      await assertFails(authenticatedDb(ADMIN_UID).doc(`${calendarPath("shared-ab")}/entries/not-created-yet`).get());
      await assertFails(db.doc(`${calendarPath("unknown")}/entries/not-created-yet`).get());
    });

    it("moves an authored event between common and private calendars atomically", async () => {
      await createAudienceCalendars();
      const db = authenticatedDb(MEMBER_UID);
      const commonRef = db.doc(`groups/${GROUP_ID}/calendarEntries/movable`);
      const privateRef = db.doc(`${calendarPath(`private_${MEMBER_UID}`)}/entries/movable`);
      await assertSucceeds(commonRef.set(calendarEntryPayload(MEMBER_UID)));

      const intoPrivate = db.batch();
      intoPrivate.set(privateRef, calendarEntryPayload(MEMBER_UID));
      intoPrivate.delete(commonRef);
      await assertSucceeds(intoPrivate.commit());
      expect((await assertSucceeds(commonRef.get())).exists).toBe(false);
      expect((await assertSucceeds(privateRef.get())).exists).toBe(true);
      await assertFails(authenticatedDb(OWNER_UID).doc(privateRef.path).get());

      const intoCommon = db.batch();
      intoCommon.set(commonRef, calendarEntryPayload(MEMBER_UID));
      intoCommon.delete(privateRef);
      await assertSucceeds(intoCommon.commit());
      expect((await assertSucceeds(privateRef.get())).exists).toBe(false);
      expect((await assertSucceeds(authenticatedDb(OWNER_UID).doc(commonRef.path).get())).exists).toBe(true);
    });

    it("rejects an entire move when the destination is inaccessible or the source belongs to someone else", async () => {
      await createAudienceCalendars();
      const db = authenticatedDb(MEMBER_UID);
      const commonRef = db.doc(`groups/${GROUP_ID}/calendarEntries/stays-common`);
      await assertSucceeds(commonRef.set(calendarEntryPayload(MEMBER_UID)));
      await assertSucceeds(authenticatedDb(ADMIN_UID).doc(calendarPath(`private_${ADMIN_UID}`)).set(
        calendarPayload(ADMIN_UID, [ADMIN_UID], "private"),
      ));

      const invalidDestination = db.batch();
      invalidDestination.set(db.doc(`${calendarPath(`private_${ADMIN_UID}`)}/entries/denied`), calendarEntryPayload(MEMBER_UID));
      invalidDestination.delete(commonRef);
      await assertFails(invalidDestination.commit());
      expect((await assertSucceeds(commonRef.get())).exists).toBe(true);
      expect((await assertSucceeds(authenticatedDb(ADMIN_UID)
        .doc(`${calendarPath(`private_${ADMIN_UID}`)}/entries/denied`).get())).exists).toBe(false);

      const ownerDb = authenticatedDb(OWNER_UID);
      const forgedDestination = ownerDb.doc(`groups/${GROUP_ID}/calendarEntries/forged-move`);
      const invalidSource = ownerDb.batch();
      invalidSource.set(forgedDestination, calendarEntryPayload(OWNER_UID));
      invalidSource.delete(ownerDb.doc(`${calendarPath("shared-ab")}/entries/from-b`));
      await assertFails(invalidSource.commit());
      expect((await assertSucceeds(forgedDestination.get())).exists).toBe(false);
      expect((await assertSucceeds(ownerDb.doc(`${calendarPath("shared-ab")}/entries/from-b`).get())).exists).toBe(true);
    });
  });
});
