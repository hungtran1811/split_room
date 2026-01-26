import { db } from "../config/firebase";
import { GROUP_ID, ALLOWED_EMAILS } from "../config/constants";
import {
  doc,
  getDoc,
  setDoc,
  collection,
  getDocs,
  serverTimestamp,
} from "firebase/firestore";

/**
 * Ensure default group exists, and current user is a member.
 * - groupId fixed: "default"
 * - members stored in subcollection groups/default/members
 */
export async function ensureDefaultGroup(user) {
  const email = (user.email || "").toLowerCase();

  if (!ALLOWED_EMAILS.includes(email)) {
    // không tạo member, không join group
    throw new Error("This account is not allowed to join P102.");
  }

  const groupId = GROUP_ID;
  const groupRef = doc(db, "groups", groupId);

  const groupSnap = await getDoc(groupRef);
  if (!groupSnap.exists()) {
    await setDoc(groupRef, {
      name: "P102",
      createdAt: serverTimestamp(),
    });
  }

  const memberRef = doc(db, "groups", groupId, "members", user.uid);
  await setDoc(
    memberRef,
    {
      uid: user.uid,
      displayName: user.displayName || user.email || "Unknown",
      email: user.email || "",
      photoURL: user.photoURL || "",
      updatedAt: serverTimestamp(),
      createdAt: serverTimestamp(),
    },
    { merge: true },
  );

  return groupId;
}

export async function getMembers(groupId) {
  const membersCol = collection(db, "groups", groupId, "members");
  const snap = await getDocs(membersCol);
  return snap.docs.map((d) => d.data());
}
