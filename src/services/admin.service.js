import {
  collection,
  doc,
  getDocs,
  serverTimestamp,
  writeBatch,
} from "firebase/firestore";
import { db } from "../config/firebase";
import { EMAIL_TO_MEMBER_ID } from "../config/members.map";
import { ROSTER_IDS } from "../config/roster";
import { LEGACY_OWNER_UID } from "../config/constants";
import {
  isOwnerProfile,
  normalizeMemberRole,
} from "../core/roles";
import { wrapFirestoreError } from "../core/errors";
import { getPeriod } from "./period.service";
import { getRentByPeriod } from "./rent.service";

function currentPeriod() {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}

function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

function permissionError(message) {
  const error = new Error(message);
  error.code = "permission-denied";
  return error;
}

function normalizeMemberForAdmin(member) {
  const role = normalizeMemberRole(member);
  const diagnostics = [];
  const email = normalizeEmail(member.email);
  const expectedMemberId = EMAIL_TO_MEMBER_ID[email] || "";
  const memberId = String(member.memberId || "").trim();
  const rawRole = String(member.role || "").trim();

  if (!memberId) {
    diagnostics.push({ code: "missing-member-id", label: "Thiếu memberId" });
  }

  if (
    !rawRole ||
    !["owner", "admin", "member"].includes(rawRole) ||
    (member.uid === LEGACY_OWNER_UID && rawRole !== "owner")
  ) {
    diagnostics.push({ code: "legacy-role", label: "Role legacy" });
  }

  if (email && expectedMemberId !== memberId) {
    diagnostics.push({
      code: "email-map-mismatch",
      label: "Email không khớp map",
    });
  }

  if (memberId && !ROSTER_IDS.includes(memberId)) {
    diagnostics.push({
      code: "unknown-roster-member",
      label: "Không nằm trong roster",
    });
  }

  return {
    ...member,
    role,
    diagnostics,
  };
}

function sortMembers(left, right) {
  const rank = {
    owner: 0,
    admin: 1,
    member: 2,
  };

  const rankDiff = rank[left.role] - rank[right.role];
  if (rankDiff !== 0) return rankDiff;

  return String(left.memberId || left.email || left.uid).localeCompare(
    String(right.memberId || right.email || right.uid),
    "vi",
  );
}

function collectDiagnostics(members) {
  return {
    missingMemberId: members.filter((member) =>
      member.diagnostics.some((item) => item.code === "missing-member-id"),
    ),
    legacyRoles: members.filter((member) =>
      member.diagnostics.some((item) => item.code === "legacy-role"),
    ),
    emailMapMismatch: members.filter((member) =>
      member.diagnostics.some((item) => item.code === "email-map-mismatch"),
    ),
    unknownRosterMembers: members.filter((member) =>
      member.diagnostics.some((item) => item.code === "unknown-roster-member"),
    ),
  };
}

function assertOwnerActor(actor, members) {
  const uid = actor?.uid || actor;
  const actorMember = members.find((member) => member.uid === uid);

  if (uid === LEGACY_OWNER_UID) return;
  if (actorMember && isOwnerProfile(actorMember)) return;

  throw permissionError("Chỉ admin chính mới được quản trị thành viên.");
}

function memberDocRef(groupId, uid) {
  return doc(db, "groups", groupId, "members", uid);
}

function buildRolePatch(role) {
  return {
    role,
    updatedAt: serverTimestamp(),
  };
}

export { normalizeMemberForAdmin };

export async function listGroupMembers(groupId) {
  try {
    const ref = collection(db, "groups", groupId, "members");
    const snap = await getDocs(ref);
    return snap.docs
      .map((docSnap) =>
        normalizeMemberForAdmin({
          id: docSnap.id,
          ...docSnap.data(),
        }),
      )
      .sort(sortMembers);
  } catch (error) {
    throw wrapFirestoreError(error, "Không thể tải danh sách thành viên.");
  }
}

export async function getAdminOverview(groupId) {
  try {
    const members = await listGroupMembers(groupId);
    const period = currentPeriod();
    const [rent, periodDoc] = await Promise.all([
      getRentByPeriod(groupId, period),
      getPeriod(groupId, period),
    ]);

    return {
      groupId,
      owner: members.find((member) => member.role === "owner") || null,
      backupAdmin: members.find((member) => member.role === "admin") || null,
      memberCount: members.length,
      diagnostics: collectDiagnostics(members),
      currentPeriodStatus: {
        rentExists: !!rent,
        reportSnapshotExists:
          periodDoc?.snapshotType === "monthly-report" && !!periodDoc?.snapshot,
      },
    };
  } catch (error) {
    throw wrapFirestoreError(error, "Không thể tải tổng quan quản trị.");
  }
}

export async function promoteBackupAdmin(groupId, targetUid, actor) {
  try {
    const members = await listGroupMembers(groupId);
    assertOwnerActor(actor, members);

    const target = members.find((member) => member.uid === targetUid);
    if (!target) {
      throw new Error("Không tìm thấy thành viên cần cấp quyền.");
    }
    if (target.role === "owner") {
      throw new Error("Admin chính không thể đổi thành admin phụ.");
    }

    const batch = writeBatch(db);
    members
      .filter(
        (member) => member.role === "admin" && member.uid !== targetUid,
      )
      .forEach((member) => {
        batch.set(
          memberDocRef(groupId, member.uid),
          buildRolePatch("member"),
          { merge: true },
        );
      });

    batch.set(
      memberDocRef(groupId, targetUid),
      buildRolePatch("admin"),
      { merge: true },
    );

    await batch.commit();
  } catch (error) {
    if (error?.code === "permission-denied") throw error;
    throw wrapFirestoreError(
      error,
      "Không thể đặt thành viên làm admin phụ.",
    );
  }
}

export async function demoteBackupAdmin(groupId, targetUid, actor) {
  try {
    const members = await listGroupMembers(groupId);
    assertOwnerActor(actor, members);

    const target = members.find((member) => member.uid === targetUid);
    if (!target) {
      throw new Error("Không tìm thấy thành viên cần gỡ quyền.");
    }
    if (target.role !== "admin") {
      throw new Error("Thành viên này không phải admin phụ.");
    }

    const batch = writeBatch(db);
    batch.set(
      memberDocRef(groupId, targetUid),
      buildRolePatch("member"),
      { merge: true },
    );
    await batch.commit();
  } catch (error) {
    if (error?.code === "permission-denied") throw error;
    throw wrapFirestoreError(error, "Không thể gỡ quyền admin phụ.");
  }
}
