import {
  collection,
  doc,
  getDocs,
  serverTimestamp,
  writeBatch,
  type Firestore,
} from "firebase/firestore";
import { db } from "../config/firebase";
import { EMAIL_TO_MEMBER_ID } from "../config/members.map";
import { ROSTER_IDS } from "../config/roster";
import { isOwnerProfile, normalizeMemberRole } from "../core/roles";
import { wrapFirestoreError } from "../core/errors";
import { getPeriod } from "./period.service";
import { getRentByPeriod } from "./rent.service";

function requireDb(): Firestore {
  if (!db) {
    throw new Error("Firestore chưa được cấu hình.");
  }
  return db;
}

function normalizeEmail(email: unknown): string {
  return String(email || "").trim().toLowerCase();
}

function permissionError(message: string): Error & { code: string } {
  const error = new Error(message) as Error & { code: string };
  error.code = "permission-denied";
  return error;
}

type AdminMember = Record<string, unknown> & {
  id: string;
  role: string;
  diagnostics: Array<{ code: string; label: string }>;
};

export function normalizeMemberForAdmin(member: Record<string, unknown>): AdminMember {
  const role = normalizeMemberRole(member);
  const diagnostics: Array<{ code: string; label: string }> = [];
  const email = normalizeEmail(member.email);
  const expectedMemberId = EMAIL_TO_MEMBER_ID[email] || "";
  const memberId = String(member.memberId || "").trim();
  const rawRole = String(member.role || "").trim();

  if (!memberId) {
    diagnostics.push({ code: "missing-member-id", label: "Thiếu memberId" });
  }

  if (!rawRole || !["owner", "admin", "member"].includes(rawRole)) {
    diagnostics.push({ code: "legacy-role", label: "Role legacy" });
  }

  if (email && expectedMemberId !== memberId) {
    diagnostics.push({
      code: "email-map-mismatch",
      label: "Email không khớp map",
    });
  }

  if (memberId && !(ROSTER_IDS as readonly string[]).includes(memberId)) {
    diagnostics.push({
      code: "unknown-roster-member",
      label: "Không nằm trong roster",
    });
  }

  return {
    ...member,
    id: String(member.id || member.uid || ""),
    role,
    diagnostics,
  } as AdminMember;
}

function sortMembers(left: AdminMember, right: AdminMember): number {
  const rank: Record<string, number> = {
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

function collectDiagnostics(members: AdminMember[]) {
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

function assertOwnerActor(actor: { uid?: string } | string | null | undefined, members: AdminMember[]) {
  const uid = typeof actor === "string" ? actor : actor?.uid;
  const actorMember = members.find((member) => member.uid === uid);

  if (actorMember && isOwnerProfile(actorMember)) return;

  throw permissionError("Chỉ admin chính mới được quản trị thành viên.");
}

function memberDocRef(groupId: string, uid: string) {
  return doc(requireDb(), "groups", groupId, "members", uid);
}

function buildRolePatch(role: string) {
  return {
    role,
    updatedAt: serverTimestamp(),
  };
}

export async function listGroupMembers(groupId: string): Promise<AdminMember[]> {
  try {
    const firestore = requireDb();
    const ref = collection(firestore, "groups", groupId, "members");
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

export const MAX_BACKUP_ADMINS = 2;

export async function getAdminOverview(groupId: string, period: string) {
  try {
    const members = await listGroupMembers(groupId);
    const backupAdmins = members.filter((member) => member.role === "admin");
    const [rent, periodDoc] = await Promise.all([
      getRentByPeriod(groupId, period),
      getPeriod(groupId, period),
    ]);

    return {
      groupId,
      owner: members.find((member) => member.role === "owner") || null,
      backupAdmin: backupAdmins[0] || null,
      backupAdmins,
      maxBackupAdmins: MAX_BACKUP_ADMINS,
      memberCount: members.length,
      diagnostics: collectDiagnostics(members),
      currentPeriodStatus: {
        rentExists: !!rent,
        reportSnapshotExists:
          ["monthly-report", "month-close"].includes(String(periodDoc?.snapshotType)) &&
          !!periodDoc?.snapshot,
      },
    };
  } catch (error) {
    throw wrapFirestoreError(error, "Không thể tải tổng quan quản trị.");
  }
}

export async function promoteBackupAdmin(
  groupId: string,
  targetUid: string,
  actor: { uid?: string } | string,
): Promise<void> {
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
    if (target.role === "admin") {
      throw new Error("Thành viên này đã là admin phụ.");
    }

    const currentAdmins = members.filter((member) => member.role === "admin");
    if (currentAdmins.length >= MAX_BACKUP_ADMINS) {
      throw new Error(
        `Đã đủ ${MAX_BACKUP_ADMINS} admin phụ. Hãy gỡ một người trước khi đặt thêm.`,
      );
    }

    const firestore = requireDb();
    const batch = writeBatch(firestore);
    batch.set(
      memberDocRef(groupId, targetUid),
      buildRolePatch("admin"),
      { merge: true },
    );

    await batch.commit();
  } catch (error) {
    const code = (error as { code?: string })?.code;
    if (code === "permission-denied") throw error;
    if (error instanceof Error && !code) throw error;
    throw wrapFirestoreError(
      error,
      "Không thể đặt thành viên làm admin phụ.",
    );
  }
}

export async function demoteBackupAdmin(
  groupId: string,
  targetUid: string,
  actor: { uid?: string } | string,
): Promise<void> {
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

    const firestore = requireDb();
    const batch = writeBatch(firestore);
    batch.set(
      memberDocRef(groupId, targetUid),
      buildRolePatch("member"),
      { merge: true },
    );
    await batch.commit();
  } catch (error) {
    const code = (error as { code?: string })?.code;
    if (code === "permission-denied") throw error;
    if (error instanceof Error && !code) throw error;
    throw wrapFirestoreError(error, "Không thể gỡ quyền admin phụ.");
  }
}
