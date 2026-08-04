import { db } from "../config/firebase";
import { GROUP_ID, ALLOWED_EMAILS } from "../config/constants";
import { resolveMemberIdFromEmail } from "../config/members.map";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  serverTimestamp,
  writeBatch,
} from "firebase/firestore";

export async function ensureDefaultGroup(user) {
  const email = (user.email || "").toLowerCase();

  // Client-side allowlist remains a UX guard. Firestore rules are the real access control.
  if (!ALLOWED_EMAILS.includes(email)) {
    throw new Error("This account is not allowed to join P102.");
  }

  const groupId = GROUP_ID;
  const groupRef = doc(db, "groups", groupId);
  const groupSnap = await getDoc(groupRef);

  if (!groupSnap.exists()) {
    const memberId = resolveMemberIdFromEmail(email);
    if (!memberId) {
      throw new Error("Email chưa được gán thành viên trong nhóm.");
    }

    const memberRef = doc(db, "groups", groupId, "members", user.uid);
    const batch = writeBatch(db);
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

export async function getMembers(groupId) {
  const membersCol = collection(db, "groups", groupId, "members");
  const snap = await getDocs(membersCol);
  return snap.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }));
}
