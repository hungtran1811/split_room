// src/services/member.service.js
import { db } from "../config/firebase";
import {
  doc,
  setDoc,
  getDoc,
  onSnapshot,
  serverTimestamp,
  collection,
} from "firebase/firestore";

/**
 * Refresh own profile display fields. Identity/role stay on the existing doc.
 */
export async function upsertMemberProfile(groupId, user) {
  const ref = doc(db, "groups", groupId, "members", user.uid);
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

export async function getMyMemberProfile(groupId, uid) {
  const ref = doc(db, "groups", groupId, "members", uid);
  const snap = await getDoc(ref);
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

export const getCurrentMemberProfile = getMyMemberProfile;

/** Watch profile của chính mình (để set state.memberId) */
export function watchMyMemberProfile(groupId, uid, cb) {
  const ref = doc(db, "groups", groupId, "members", uid);
  return onSnapshot(ref, (snap) => {
    cb(snap.exists() ? { id: snap.id, ...snap.data() } : null);
  });
}

/** (Tuỳ chọn) Watch toàn bộ members trong group */
export function watchGroupMembers(groupId, cb) {
  const ref = collection(db, "groups", groupId, "members");
  return onSnapshot(ref, (snap) => {
    cb(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
  });
}
