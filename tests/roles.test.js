import { describe, expect, it } from "vitest";
import {
  canAddExpense,
  canDeleteExpense,
  canEditExpense,
  canEditRent,
  canOperateMonth,
  canRecordPayment,
  canViewFullSettlement,
  isOwnerProfile,
  normalizeMemberRole,
} from "../src/core/roles.js";

describe("roles", () => {
  it("uses Firestore role only and does not elevate by uid or memberId", () => {
    expect(
      normalizeMemberRole({
        uid: "8tgX0c2IBbTx0k0oIZgn7w2H12b2",
        memberId: "hung",
        role: "admin",
      }),
    ).toBe("admin");

    expect(
      normalizeMemberRole({
        uid: "any-uid",
        memberId: "hung",
        role: "member",
      }),
    ).toBe("member");

    expect(
      normalizeMemberRole({
        uid: "owner-uid",
        memberId: "hung",
        role: "owner",
      }),
    ).toBe("owner");
  });

  it("keeps admin and member roles for non-owner members", () => {
    expect(
      normalizeMemberRole({
        uid: "backup-admin-uid",
        memberId: "thinh",
        role: "admin",
      }),
    ).toBe("admin");

    expect(
      normalizeMemberRole({
        uid: "member-uid",
        memberId: "thao",
        role: "member",
      }),
    ).toBe("member");
  });

  it("treats owner and admin as month operators", () => {
    expect(
      canOperateMonth({
        uid: "owner-uid",
        memberId: "hung",
        role: "owner",
      }),
    ).toBe(true);

    expect(
      canOperateMonth({
        uid: "backup-admin-uid",
        memberId: "thinh",
        role: "admin",
      }),
    ).toBe(true);

    expect(
      canOperateMonth({
        uid: "member-uid",
        memberId: "thao",
        role: "member",
      }),
    ).toBe(false);
  });

  it("allows all group members to add expenses", () => {
    expect(
      canAddExpense({
        uid: "member-uid",
        memberId: "thao",
        role: "member",
      }),
    ).toBe(true);

    expect(
      canAddExpense({
        uid: "backup-admin-uid",
        memberId: "thinh",
        role: "admin",
      }),
    ).toBe(true);

    expect(canAddExpense(null)).toBe(false);

    expect(
      canAddExpense(null, "huynhthanhthao14062001@gmail.com"),
    ).toBe(true);
  });

  it("detects owner profiles from role field only", () => {
    expect(
      isOwnerProfile({
        uid: "owner-uid",
        memberId: "hung",
        role: "owner",
      }),
    ).toBe(true);

    expect(
      isOwnerProfile({
        uid: "8tgX0c2IBbTx0k0oIZgn7w2H12b2",
        memberId: "hung",
      }),
    ).toBe(false);

    expect(
      isOwnerProfile({
        uid: "backup-admin-uid",
        memberId: "thinh",
        role: "admin",
      }),
    ).toBe(false);
  });

  it("lets owner and admin edit expenses but only owner delete", () => {
    const owner = { uid: "owner-uid", memberId: "hung", role: "owner" };
    const admin = { uid: "admin-uid", memberId: "thinh", role: "admin" };
    const member = { uid: "member-uid", memberId: "thao", role: "member" };

    expect(canEditExpense(owner)).toBe(true);
    expect(canEditExpense(admin)).toBe(true);
    expect(canEditExpense(member)).toBe(false);

    expect(canDeleteExpense(owner)).toBe(true);
    expect(canDeleteExpense(admin)).toBe(false);
    expect(canDeleteExpense(member)).toBe(false);
  });

  it("lets operators record payments and edit rent; members see personal settlement only", () => {
    const owner = { uid: "owner-uid", memberId: "hung", role: "owner" };
    const admin = { uid: "admin-uid", memberId: "thinh", role: "admin" };
    const member = { uid: "member-uid", memberId: "thao", role: "member" };

    expect(canRecordPayment(owner)).toBe(true);
    expect(canRecordPayment(admin)).toBe(true);
    expect(canRecordPayment(member)).toBe(false);

    expect(canEditRent(owner)).toBe(true);
    expect(canEditRent(admin)).toBe(true);
    expect(canEditRent(member)).toBe(false);

    expect(canViewFullSettlement(owner)).toBe(true);
    expect(canViewFullSettlement(admin)).toBe(true);
    expect(canViewFullSettlement(member)).toBe(false);
  });
});
