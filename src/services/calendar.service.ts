import {
  collection, deleteDoc, doc, getDocsFromServer, onSnapshot, orderBy, query,
  runTransaction, serverTimestamp, setDoc, Timestamp, updateDoc, where,
  type Firestore, type Unsubscribe,
} from "firebase/firestore";
import { db } from "../config/firebase";
import { wrapFirestoreError } from "../core/errors";
import { addDaysYmd } from "../domain/calendar/tz";
import { weekBounds } from "../domain/calendar/week";
import { buildCopiedEntries } from "../domain/calendar/copyWeek";
import { calendarEntryKey, calendarKey } from "../domain/calendar/access";
import { validateCalendarEntryInput, type CalendarEntryInput } from "../domain/calendar/validate";
import type { CalendarEntry, CalendarInfo, CalendarRef, CopyWeekResult } from "../domain/calendar/types";
import type { CalendarEntryDoc } from "../types/models";

function requireDb(): Firestore {
  if (!db) throw new Error("Firestore chưa được cấu hình.");
  return db;
}

function entriesCol(groupId: string, calendar: CalendarRef) {
  if (!calendar.id || calendar.id.includes("/")) throw new Error("Lịch không hợp lệ.");
  if (calendar.kind === "group") {
    if (calendar.id !== "group") throw new Error("Lịch nhóm không hợp lệ.");
    return collection(requireDb(), "groups", groupId, "calendarEntries");
  }
  return collection(requireDb(), "groups", groupId, "calendars", calendar.id, "entries");
}

function entryRef(groupId: string, calendar: CalendarRef, entryId: string) {
  return doc(entriesCol(groupId, calendar), entryId);
}

function toMillis(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (value instanceof Date) return value.getTime();
  if (value && typeof (value as { toMillis?: () => number }).toMillis === "function") {
    return (value as { toMillis: () => number }).toMillis();
  }
  return 0;
}

function mapEntry(id: string, calendar: CalendarRef, data: Record<string, unknown>): CalendarEntryDoc {
  return {
    id,
    calendar: { kind: calendar.kind, id: calendar.id },
    uid: String(data.uid || ""),
    title: String(data.title || ""),
    description: String(data.description || ""),
    location: String(data.location || ""),
    startAt: toMillis(data.startAt),
    endAt: toMillis(data.endAt),
    createdAt: data.createdAt,
    updatedAt: data.updatedAt,
  };
}

function weekQuery(groupId: string, calendar: CalendarRef, weekStartMs: number, weekEndMs: number) {
  // Include every interval intersecting the week, including long/overnight entries.
  return query(
    entriesCol(groupId, calendar),
    where("endAt", ">", Timestamp.fromMillis(weekStartMs)),
    where("startAt", "<", Timestamp.fromMillis(weekEndMs)),
    orderBy("endAt", "asc"),
    orderBy("startAt", "asc"),
  );
}

function inWeek(entry: CalendarEntryDoc, weekStartMs: number, weekEndMs: number): boolean {
  return entry.endAt > weekStartMs && entry.startAt < weekEndMs;
}

export function watchCalendarWeek(
  groupId: string,
  calendar: CalendarRef,
  weekStartMs: number,
  weekEndMs: number,
  onChange: (entries: CalendarEntryDoc[]) => void,
  onError: (error: Error) => void,
  onPending?: () => void,
): Unsubscribe {
  return onSnapshot(
    weekQuery(groupId, calendar, weekStartMs, weekEndMs),
    { includeMetadataChanges: true },
    (snapshot) => {
      if (snapshot.metadata.fromCache) {
        onPending?.();
        return;
      }
      // Keep the last confirmed view during writes, without publishing uncommitted data.
      if (snapshot.metadata.hasPendingWrites) return;
      onChange(snapshot.docs
        .map((item) => mapEntry(item.id, calendar, item.data()))
        .filter((entry) => inWeek(entry, weekStartMs, weekEndMs)));
    },
    (error) => onError(wrapFirestoreError(error, "Không tải được lịch tuần này.")),
  );
}

export async function listCalendarWeek(
  groupId: string,
  calendar: CalendarRef,
  weekStartMs: number,
  weekEndMs: number,
): Promise<CalendarEntryDoc[]> {
  try {
    const snapshot = await getDocsFromServer(weekQuery(groupId, calendar, weekStartMs, weekEndMs));
    return snapshot.docs
      .map((item) => mapEntry(item.id, calendar, item.data()))
      .filter((entry) => inWeek(entry, weekStartMs, weekEndMs));
  } catch (error) {
    throw wrapFirestoreError(error, "Không tải được lịch tuần này.");
  }
}

function checkedFields(input: CalendarEntryInput) {
  const checked = validateCalendarEntryInput(input);
  if (!checked.ok) throw new Error(checked.error);
  return {
    title: checked.title,
    description: checked.description,
    location: checked.location,
    startAt: Timestamp.fromMillis(checked.startAt),
    endAt: Timestamp.fromMillis(checked.endAt),
  };
}

export async function createCalendarEntry(
  groupId: string, calendar: CalendarRef, uid: string, input: CalendarEntryInput,
): Promise<string> {
  const fields = checkedFields(input);
  try {
    const ref = doc(entriesCol(groupId, calendar));
    await setDoc(ref, {
      uid, ...fields,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return ref.id;
  } catch (error) {
    throw wrapFirestoreError(error, "Không lưu được lịch bận.");
  }
}

export async function createCalendarEntries(
  groupId: string, calendar: CalendarRef, uid: string, inputs: CalendarEntryInput[],
): Promise<{ added: number; failed: number }> {
  let added = 0;
  let failed = 0;
  for (const input of inputs) {
    try {
      await createCalendarEntry(groupId, calendar, uid, input);
      added += 1;
    } catch {
      failed += 1;
    }
  }
  if (!added && failed) throw new Error("Không lưu được lịch bận.");
  return { added, failed };
}

export async function updateCalendarEntry(
  groupId: string, calendar: CalendarRef, entryId: string, input: CalendarEntryInput,
): Promise<void> {
  const fields = checkedFields(input);
  try {
    await updateDoc(entryRef(groupId, calendar, entryId), {
      ...fields, updatedAt: serverTimestamp(),
    });
  } catch (error) {
    throw wrapFirestoreError(error, "Không cập nhật được lịch bận.");
  }
}

export async function deleteCalendarEntry(
  groupId: string, calendar: CalendarRef, entryId: string,
): Promise<void> {
  try {
    await deleteDoc(entryRef(groupId, calendar, entryId));
  } catch (error) {
    throw wrapFirestoreError(error, "Không xóa được lịch bận.");
  }
}

export async function moveCalendarEntry(
  groupId: string, source: CalendarRef, target: CalendarRef,
  entryId: string, input: CalendarEntryInput,
): Promise<string> {
  if (calendarKey(source) === calendarKey(target)) {
    await updateCalendarEntry(groupId, source, entryId, input);
    return entryId;
  }
  const fields = checkedFields(input);
  try {
    const sourceRef = entryRef(groupId, source, entryId);
    const targetRef = doc(entriesCol(groupId, target));
    await runTransaction(requireDb(), async (transaction) => {
      const snapshot = await transaction.get(sourceRef);
      if (!snapshot.exists()) throw new Error("Lịch bận không còn tồn tại.");
      transaction.set(targetRef, {
        uid: snapshot.data().uid,
        ...fields,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      transaction.delete(sourceRef);
    });
    return targetRef.id;
  } catch (error) {
    throw wrapFirestoreError(error, "Không chuyển được lịch bận. Lịch gốc được giữ nguyên.");
  }
}

export type CopyCandidate = {
  sourceId: string;
  destId: string;
  sourceKey: string;
  destKey: string;
  calendar: CalendarRef;
  uid: string;
  title: string;
  description: string;
  location: string;
  startAt: number;
  endAt: number;
};

export async function previewCopyFromPreviousWeek(
  groupId: string, uid: string, calendars: CalendarInfo[], targetWeekStartYmd: string,
): Promise<CopyCandidate[]> {
  const previousStart = addDaysYmd(weekBounds(targetWeekStartYmd).startYmd, -7);
  const previous = weekBounds(previousStart);
  const listed = (await Promise.all(calendars.map((calendar) =>
    listCalendarWeek(groupId, calendar, previous.startMs, previous.endMs),
  ))).flat();
  const entries: CalendarEntry[] = listed.filter((item) => item.uid === uid);
  return buildCopiedEntries(entries, targetWeekStartYmd).map((item) => ({
    sourceId: item.sourceId,
    destId: item.destId,
    sourceKey: calendarEntryKey({ id: item.sourceId, calendar: item.entry.calendar }),
    destKey: calendarEntryKey({ id: item.destId, calendar: item.entry.calendar }),
    calendar: item.entry.calendar,
    uid: item.entry.uid,
    title: item.entry.title,
    description: item.entry.description,
    location: item.entry.location,
    startAt: item.entry.startAt,
    endAt: item.entry.endAt,
  }));
}

export async function copyPreviousWeekEntries(
  groupId: string, uid: string, calendars: CalendarInfo[],
  targetWeekStartYmd: string, candidates?: CopyCandidate[],
): Promise<CopyWeekResult> {
  const items = candidates ?? await previewCopyFromPreviousWeek(groupId, uid, calendars, targetWeekStartYmd);
  const allowedKeys = new Set(calendars.map(calendarKey));
  const result: CopyWeekResult = { added: 0, skipped: 0, failed: [] };

  for (const candidate of items) {
    const { calendar, sourceId, destId } = candidate;
    const sourceKey = calendarEntryKey({ calendar, id: sourceId });
    const destKey = calendarEntryKey({ calendar, id: destId });
    try {
      if (candidate.uid !== uid || !allowedKeys.has(calendarKey(calendar))) {
        throw new Error("Bạn không còn quyền sao chép lịch này.");
      }
      const status = await runTransaction(requireDb(), async (transaction) => {
        // Re-read the source: stale previews must not copy revoked, moved, or deleted data.
        const source = await transaction.get(entryRef(groupId, calendar, sourceId));
        if (!source.exists() || source.data().uid !== uid) {
          throw new Error("Lịch nguồn không còn tồn tại hoặc không thuộc về bạn.");
        }
        const ref = entryRef(groupId, calendar, destId);
        const destination = await transaction.get(ref);
        if (destination.exists()) return "skipped" as const;
        const current = mapEntry(sourceId, calendar, source.data());
        const copied = buildCopiedEntries([current], targetWeekStartYmd)[0];
        if (!copied || copied.destId !== destId) {
          throw new Error("Lịch nguồn đã đổi tuần. Hãy tải lại bản xem trước.");
        }
        transaction.set(ref, {
          uid,
          ...checkedFields(copied.entry),
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        return "added" as const;
      });
      if (status === "skipped") result.skipped += 1;
      else result.added += 1;
    } catch (error) {
      result.failed.push({
        sourceId, destId, sourceKey, destKey, calendar,
        message: wrapFirestoreError(error, "Không sao chép được lịch này.").message,
      });
    }
  }
  return result;
}
