import {
  collection,
  doc,
  getDocsFromServer,
  onSnapshot,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  where,
  type Firestore,
  type Unsubscribe,
} from "firebase/firestore";
import { db } from "../config/firebase";
import { wrapFirestoreError } from "../core/errors";
import type { CalendarInfo } from "../domain/calendar/types";

function requireDb(): Firestore {
  if (!db) throw new Error("Firestore chưa được cấu hình.");
  return db;
}

function calendarsCol(groupId: string) {
  return collection(requireDb(), "groups", groupId, "calendars");
}

function calendarDoc(groupId: string, calendarId: string) {
  return doc(calendarsCol(groupId), calendarId);
}

function checkedName(name: string): string {
  const value = String(name || "").replace(/\s+/g, " ").trim();
  if (!value || value.length > 80) throw new Error("Tên lịch phải có từ 1 đến 80 ký tự.");
  return value;
}

function checkedMembers(ownerUid: string, memberUids: string[], minimum = 1): string[] {
  const values = [...new Set([ownerUid, ...memberUids])].sort();
  if (values.length < minimum || values.some((uid) => !uid || uid.includes("/"))) {
    throw new Error("Hãy chọn ít nhất một thành viên để chia sẻ lịch.");
  }
  return values;
}

async function groupMemberUids(groupId: string): Promise<Set<string>> {
  const snapshot = await getDocsFromServer(collection(requireDb(), "groups", groupId, "members"));
  return new Set(snapshot.docs.map((item) => item.id));
}

async function verifyGroupMembers(groupId: string, memberUids: string[]): Promise<void> {
  const activeUids = await groupMemberUids(groupId);
  if (memberUids.some((uid) => !activeUids.has(uid))) {
    throw new Error("Danh sách thành viên đã thay đổi. Hãy chọn lại người được xem lịch.");
  }
}

export async function ensurePrivateCalendar(groupId: string, uid: string): Promise<void> {
  const ref = calendarDoc(groupId, `private_${uid}`);
  try {
    await runTransaction(requireDb(), async (transaction) => {
      const snapshot = await transaction.get(ref);
      if (snapshot.exists()) return;
      transaction.set(ref, {
        kind: "private",
        name: "Cá nhân",
        ownerUid: uid,
        memberUids: [uid],
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    });
  } catch (error) {
    throw wrapFirestoreError(error, "Không khởi tạo được lịch cá nhân.");
  }
}

export function watchCalendars(
  groupId: string,
  uid: string,
  onChange: (calendars: CalendarInfo[]) => void,
  onError: (error: Error) => void,
  onPending?: () => void,
): Unsubscribe {
  const readable = query(calendarsCol(groupId), where("memberUids", "array-contains", uid));
  return onSnapshot(
    readable,
    { includeMetadataChanges: true },
    (snapshot) => {
      // Cached/local metadata must never establish a calendar's authorization.
      if (snapshot.metadata.fromCache) {
        onPending?.();
        return;
      }
      // Do not grant provisional audiences, or close the editor during its own save.
      if (snapshot.metadata.hasPendingWrites) return;
      const calendars: CalendarInfo[] = snapshot.docs.flatMap((item) => {
        const data = item.data();
        if (data.kind !== "private" && data.kind !== "shared") return [];
        return [{
          id: item.id,
          kind: data.kind,
          name: String(data.name || ""),
          ownerUid: String(data.ownerUid || ""),
          memberUids: Array.isArray(data.memberUids) ? data.memberUids.map(String) : [],
        }];
      });
      onChange(calendars);
    },
    (error) => onError(wrapFirestoreError(error, "Không tải được danh sách lịch.")),
  );
}

export async function createSharedCalendar(
  groupId: string,
  uid: string,
  name: string,
  memberUids: string[],
): Promise<string> {
  const checked = checkedName(name);
  const members = checkedMembers(uid, memberUids, 2);
  try {
    await verifyGroupMembers(groupId, members);
    const ref = doc(calendarsCol(groupId));
    await setDoc(ref, {
      kind: "shared",
      name: checked,
      ownerUid: uid,
      memberUids: members,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return ref.id;
  } catch (error) {
    throw wrapFirestoreError(error, "Không tạo được lịch chia sẻ.");
  }
}

export async function updateSharedCalendar(
  groupId: string,
  calendarId: string,
  name: string,
  memberUids: string[],
): Promise<void> {
  const checked = checkedName(name);
  try {
    const activeUids = await groupMemberUids(groupId);
    await runTransaction(requireDb(), async (transaction) => {
      const ref = calendarDoc(groupId, calendarId);
      const snapshot = await transaction.get(ref);
      if (!snapshot.exists() || snapshot.data().kind !== "shared") {
        throw new Error("Lịch chia sẻ không còn tồn tại.");
      }
      const members = checkedMembers(String(snapshot.data().ownerUid || ""), memberUids);
      const previous = new Set<string>(snapshot.data().memberUids || []);
      if (members.some((uid) => !previous.has(uid) && !activeUids.has(uid))) {
        throw new Error("Danh sách thành viên đã thay đổi. Hãy chọn lại người được xem lịch.");
      }
      transaction.update(ref, {
        name: checked,
        memberUids: members,
        updatedAt: serverTimestamp(),
      });
    });
  } catch (error) {
    throw wrapFirestoreError(error, "Không cập nhật được lịch chia sẻ.");
  }
}
