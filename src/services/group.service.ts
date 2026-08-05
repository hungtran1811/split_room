import {
  collection,
  doc,
  getDoc,
  getDocs,
  serverTimestamp,
  writeBatch,
  type Firestore,
} from "firebase/firestore";
import type { User } from "firebase/auth";
import { db } from "../config/firebase";
import { GROUP_ID, ALLOWED_EMAILS } from "../config/constants";
import { resolveMemberIdFromEmail } from "../config/members.map";

function requireDb(): Firestore {
  if (!db) {
    throw new Error("Firestore chưa được cấu hình.");
  }
  return db;
}

export async function ensureDefaultGroup(user: User): Promise<string> {
  const firestore = requireDb();
  const email = (user.email || "").toLowerCase();

  // Client-side allowlist remains a UX guard. Firestore rules are the real access control.
  if (!ALLOWED_EMAILS.includes(email)) {
    throw new Error("This account is not allowed to join P102.");
  }

  const groupId = GROUP_ID;
  const groupRef = doc(firestore, "groups", groupId);
  const groupSnap = await getDoc(groupRef);

  if (!groupSnap.exists()) {
    const memberId = resolveMemberIdFromEmail(email);
    if (!memberId) {
      throw new Error("Email chưa được gán thành viên trong nhóm.");
    }

    const memberRef = doc(firestore, "groups", groupId, "members", user.uid);
    const batch = writeBatch(firestore);
    const now = serverTimestamp();

    batch.set(groupRef, {
      name: "P102",
      createdAt: now,
    });
    batch.set(memberRef, {
      uid: user.uid,
      email: user.email || "",
      displayName: user.displayName || "",
      photoURL: user.photoURL || "",
      memberId,
      role: "owner",
      createdAt: now,
      updatedAt: now,
    });

    await batch.commit();
  }

  return groupId;
}

export async function getMembers(
  groupId: string,
): Promise<Array<Record<string, unknown> & { id: string }>> {
  const firestore = requireDb();
  const membersCol = collection(firestore, "groups", groupId, "members");
  const snap = await getDocs(membersCol);
  return snap.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }));
}
