import { describe, expect, it } from "vitest";
import {
  canAddExpense,
  canOperateMonth,
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
});
