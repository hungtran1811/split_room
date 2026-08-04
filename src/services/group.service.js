import { db } from "../config/firebase";
import { GROUP_ID, ALLOWED_EMAILS } from "../config/constants";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  serverTimestamp,
  setDoc,
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
    await setDoc(groupRef, {
      name: "P102",
      createdAt: serverTimestamp(),
    });
  }

  return groupId;
}

export async function getMembers(groupId) {
  const membersCol = collection(db, "groups", groupId, "members");
  const snap = await getDocs(membersCol);
  return snap.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }));
}
