import { describe, expect, it } from "vitest";
import {
  canOperateMonth,
  isOwnerProfile,
  normalizeMemberRole,
} from "../src/core/roles.js";

describe("roles", () => {
  it("normalizes the fixed owner to owner role", () => {
    expect(
      normalizeMemberRole({
        uid: "8tgX0c2IBbTx0k0oIZgn7w2H12b2",
        memberId: "hung",
        role: "admin",
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
        uid: "8tgX0c2IBbTx0k0oIZgn7w2H12b2",
        memberId: "hung",
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

  it("detects owner profiles correctly", () => {
    expect(
      isOwnerProfile({
        uid: "8tgX0c2IBbTx0k0oIZgn7w2H12b2",
        memberId: "hung",
      }),
    ).toBe(true);

    expect(
      isOwnerProfile({
        uid: "backup-admin-uid",
        memberId: "thinh",
        role: "admin",
      }),
    ).toBe(false);
  });
});
