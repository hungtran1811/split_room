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
 * Lưu mapping: uid/email -> memberId (hung/thao/thuy/thinh)
 * role: "admin" | "member"
 */
export async function upsertMemberProfile(
  groupId,
  user,
  { memberId, role = "member" },
) {
  const ref = doc(db, "groups", groupId, "members", user.uid);

  await setDoc(
    ref,
    {
      uid: user.uid,
      email: user.email || "",
      displayName: user.displayName || "",
      photoURL: user.photoURL || "",
      memberId, // ✅ quan trọng
      role, // ✅ admin/member
      updatedAt: serverTimestamp(),
      createdAt: serverTimestamp(),
    },
    { merge: true },
  );
}

export async function getMyMemberProfile(groupId, uid) {
  const ref = doc(db, "groups", groupId, "members", uid);
  const snap = await getDoc(ref);
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

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
