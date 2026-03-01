import { beforeAll, afterAll, beforeEach, describe, expect, it } from "vitest";
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from "@firebase/rules-unit-testing";
import fs from "node:fs";

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
    note: "Tiền nhà tháng 3",
    createdBy: uid,
  };
}

async function seedMember(uid, role, email) {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    await context.firestore()
      .doc(`groups/P102/members/${uid}`)
      .set({
        uid,
        email,
        memberId: uid === "admin-uid" ? "hung" : "thao",
        role,
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
    await seedMember("admin-uid", "admin", "hungtran00.nt@gmail.com");
    await seedMember("member-uid", "member", "huynhthanhthao14062001@gmail.com");
  });

  it("allows admin to create a valid rent doc", async () => {
    const db = testEnv.authenticatedContext("admin-uid", {
      email: "hungtran00.nt@gmail.com",
    }).firestore();

    await assertSucceeds(
      db.doc("groups/P102/rents/2026-03").set(rentPayload("2026-03", "admin-uid")),
    );
  });

  it("blocks member from creating rent", async () => {
    const db = testEnv.authenticatedContext("member-uid", {
      email: "huynhthanhthao14062001@gmail.com",
    }).firestore();

    await assertFails(
      db.doc("groups/P102/rents/2026-03").set(rentPayload("2026-03", "member-uid")),
    );
  });

  it("blocks unexpected fields in rent payload", async () => {
    const db = testEnv.authenticatedContext("admin-uid", {
      email: "hungtran00.nt@gmail.com",
    }).firestore();

    await assertFails(
      db.doc("groups/P102/rents/2026-03").set({
        ...rentPayload("2026-03", "admin-uid"),
        evil: true,
      }),
    );
  });

  it("allows group members to read rent docs", async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await context.firestore()
        .doc("groups/P102/rents/2026-03")
        .set(rentPayload("2026-03", "admin-uid"));
    });

    const db = testEnv.authenticatedContext("member-uid", {
      email: "huynhthanhthao14062001@gmail.com",
    }).firestore();

    await assertSucceeds(db.doc("groups/P102/rents/2026-03").get());
  });

  it("blocks outsiders from reading rent docs", async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await context.firestore()
        .doc("groups/P102/rents/2026-03")
        .set(rentPayload("2026-03", "admin-uid"));
    });

    const db = testEnv.authenticatedContext("outsider-uid", {
      email: "outsider@example.com",
    }).firestore();

    await assertFails(db.doc("groups/P102/rents/2026-03").get());
  });
});
