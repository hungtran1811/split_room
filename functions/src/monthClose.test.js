import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildCloseSnapshot,
  buildMailOutboxItems,
  buildMemberNotifications,
  previousPeriod,
} from "./monthClose.js";

describe("previousPeriod", () => {
  it("returns prior month within the same year", () => {
    assert.equal(previousPeriod("2026-08"), "2026-07");
  });

  it("rolls back across year boundary", () => {
    assert.equal(previousPeriod("2026-01"), "2025-12");
  });
});

describe("notification building", () => {
  const members = [
    {
      uid: "uid-hung",
      memberId: "hung",
      email: "hung@example.test",
      displayName: "Hưng",
      role: "owner",
    },
    {
      uid: "uid-thao",
      memberId: "thao",
      email: "thao@example.test",
      displayName: "Thảo",
      role: "member",
    },
    {
      uid: "uid-thinh",
      memberId: "thinh",
      email: "",
      displayName: "Thịnh",
      role: "member",
    },
  ];

  it("builds member notifications with Vietnamese copy", () => {
    const settlementPlan = [
      { fromId: "thao", toId: "hung", amount: 50000 },
    ];

    const notifications = buildMemberNotifications(
      settlementPlan,
      members,
      "2026-07",
    );

    assert.equal(notifications.length, 3);

    const hung = notifications.find((item) => item.memberId === "hung");
    const thao = notifications.find((item) => item.memberId === "thao");
    const thinh = notifications.find((item) => item.memberId === "thinh");

    assert.equal(hung.title, "Tháng 2026-07 đã được chốt");
    assert.match(hung.body, /Thảo cần chuyển/);
    assert.match(thao.body, /Bạn cần chuyển/);
    assert.match(thinh.body, /không còn khoản cấn trừ/);
    assert.equal(thinh.settlement.length, 0);
  });

  it("builds pending mail outbox only for members with email", () => {
    const settlementPlan = [
      { fromId: "thao", toId: "hung", amount: 50000 },
    ];

    const mails = buildMailOutboxItems({
      settlementPlan,
      members,
      period: "2026-07",
      groupId: "P102",
    });

    assert.equal(mails.length, 2);
    assert.ok(mails.every((item) => item.status === "pending"));
    assert.ok(mails.every((item) => item.subject.includes("Đã chốt tháng 2026-07")));
    assert.ok(mails.some((item) => item.to === "hung@example.test"));
    assert.ok(!mails.some((item) => item.memberId === "thinh"));
  });

  it("builds a close snapshot with whole-VND settlement", () => {
    const snapshot = buildCloseSnapshot({
      expenses: [
        {
          payerId: "hung",
          amount: 300000,
          debts: { thao: 100000, thinh: 100000, thuy: 100000 },
        },
      ],
      payments: [{ fromId: "thao", toId: "hung", amount: 50000 }],
      rent: null,
      members,
    });

    assert.equal(snapshot.snapshotType, "month-close");
    assert.equal(snapshot.stats.expenseTotal, 300000);
    assert.equal(snapshot.stats.paymentTotal, 50000);
    assert.ok(snapshot.settlementPlan.every((item) => item.amount > 0));
    assert.ok(Number.isInteger(snapshot.balances.hung));
  });
});
