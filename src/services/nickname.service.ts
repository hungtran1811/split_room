import {
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  serverTimestamp,
  setDoc,
  type Firestore,
  type Unsubscribe,
} from "firebase/firestore";
import { db } from "../config/firebase";
import { wrapFirestoreError } from "../core/errors";
import { isRosterMemberId, sanitizeNickname } from "../domain/members/nicknames";

function requireDb(): Firestore {
  if (!db) {
    throw new Error("Firestore chưa được cấu hình.");
  }
  return db;
}

export function watchNicknames(
  groupId: string,
  cb: (nicknames: Record<string, string>) => void,
): Unsubscribe {
  const firestore = requireDb();
  const ref = collection(firestore, "groups", groupId, "nicknames");
  return onSnapshot(
    ref,
    (snap) => {
      const next: Record<string, string> = {};
      for (const item of snap.docs) {
        const nickname = sanitizeNickname(String(item.data()?.nickname || ""));
        if (nickname) next[item.id] = nickname;
      }
      cb(next);
    },
    (error) => {
      console.warn("[splitroom] Không đọc được biệt danh.", error);
      cb({});
    },
  );
}

export async function upsertNickname(
  groupId: string,
  memberId: string,
  nickname: string,
  updatedBy: string,
): Promise<void> {
  if (!isRosterMemberId(memberId)) {
    throw new Error("Thành viên không hợp lệ.");
  }

  const firestore = requireDb();
  const ref = doc(firestore, "groups", groupId, "nicknames", memberId);
  const clean = sanitizeNickname(nickname);

  try {
    if (!clean) {
      await deleteDoc(ref);
      return;
    }

    await setDoc(ref, {
      nickname: clean,
      updatedBy,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    throw wrapFirestoreError(error, "Không lưu được biệt danh.");
  }
}
