import {
  doc,
  setDoc,
  getDoc,
  onSnapshot,
  serverTimestamp,
  collection,
  type Firestore,
  type Unsubscribe,
} from "firebase/firestore";
import type { User } from "firebase/auth";
import { db } from "../config/firebase";

function requireDb(): Firestore {
  if (!db) {
    throw new Error("Firestore chưa được cấu hình.");
  }
  return db;
}

type MemberProfile = Record<string, unknown> & { id: string };

/**
 * Refresh own profile display fields. Identity/role stay on the existing doc.
 */
export async function upsertMemberProfile(groupId: string, user: User): Promise<void> {
  const firestore = requireDb();
  const ref = doc(firestore, "groups", groupId, "members", user.uid);
  const current = await getDoc(ref);

  if (!current.exists()) {
    throw new Error(
      "Tài khoản chưa được thêm vào nhóm. Liên hệ admin chính để được cấp quyền.",
    );
  }

  await setDoc(
    ref,
    {
      displayName: user.displayName || current.data()?.displayName || "",
      photoURL: user.photoURL || current.data()?.photoURL || "",
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );
}

export async function getMyMemberProfile(
  groupId: string,
  uid: string,
): Promise<MemberProfile | null> {
  const firestore = requireDb();
  const ref = doc(firestore, "groups", groupId, "members", uid);
  const snap = await getDoc(ref);
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

export const getCurrentMemberProfile = getMyMemberProfile;

/** Watch profile của chính mình (để set state.memberId) */
export function watchMyMemberProfile(
  groupId: string,
  uid: string,
  cb: (profile: MemberProfile | null) => void,
): Unsubscribe {
  const firestore = requireDb();
  const ref = doc(firestore, "groups", groupId, "members", uid);
  return onSnapshot(ref, (snap) => {
    cb(snap.exists() ? { id: snap.id, ...snap.data() } : null);
  });
}

/** (Tuỳ chọn) Watch toàn bộ members trong group */
export function watchGroupMembers(
  groupId: string,
  cb: (members: MemberProfile[]) => void,
): Unsubscribe {
  const firestore = requireDb();
  const ref = collection(firestore, "groups", groupId, "members");
  return onSnapshot(ref, (snap) => {
    cb(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
  });
}
