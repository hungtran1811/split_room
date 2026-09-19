import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  where,
  type Firestore,
  type Unsubscribe,
} from "firebase/firestore";
import { db } from "../config/firebase";
import { wrapFirestoreError } from "../core/errors";
import { addDaysYmd } from "../domain/calendar/tz";
import { weekBounds } from "../domain/calendar/week";
import { buildCopiedEntries } from "../domain/calendar/copyWeek";
import {
  validateCalendarEntryInput,
  type CalendarEntryInput,
} from "../domain/calendar/validate";
import type { CalendarEntry, CopyWeekResult } from "../domain/calendar/types";
import type { CalendarEntryDoc } from "../types/models";

function requireDb(): Firestore {
  if (!db) {
    throw new Error("Firestore chưa được cấu hình.");
  }
  return db;
}

function entriesCol(groupId: string) {
  return collection(requireDb(), "groups", groupId, "calendarEntries");
}

function entryRef(groupId: string, entryId: string) {
  return doc(requireDb(), "groups", groupId, "calendarEntries", entryId);
}

function toMillis(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (value instanceof Date) return value.getTime();
  if (value && typeof (value as { toMillis?: () => number }).toMillis === "function") {
    return (value as { toMillis: () => number }).toMillis();
  }
  return 0;
}

function mapEntry(id: string, data: Record<string, unknown>): CalendarEntryDoc {
  return {
    id,
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

function weekQuery(groupId: string, weekStartMs: number, weekEndMs: number) {
  return query(
    entriesCol(groupId),
    where("endAt", ">", Timestamp.fromMillis(weekStartMs)),
    where("startAt", "<", Timestamp.fromMillis(weekEndMs)),
    orderBy("endAt", "asc"),
    orderBy("startAt", "asc"),
  );
}

export function watchCalendarWeek(
  groupId: string,
  weekStartMs: number,
  weekEndMs: number,
  onChange: (entries: CalendarEntryDoc[]) => void,
  onError: (error: Error) => void,
): Unsubscribe {
  return onSnapshot(
    weekQuery(groupId, weekStartMs, weekEndMs),
    (snap) => {
      onChange(snap.docs.map((item) => mapEntry(item.id, item.data())));
    },
    (error) => {
      onError(wrapFirestoreError(error, "Không tải được lịch nhóm tuần này."));
    },
  );
}

export async function listCalendarWeek(
  groupId: string,
  weekStartMs: number,
  weekEndMs: number,
): Promise<CalendarEntryDoc[]> {
  try {
    const snap = await getDocs(weekQuery(groupId, weekStartMs, weekEndMs));
    return snap.docs.map((item) => mapEntry(item.id, item.data()));
  } catch (error) {
    throw wrapFirestoreError(error, "Không tải được lịch nhóm tuần này.");
  }
}

export async function createCalendarEntry(
  groupId: string,
  uid: string,
  input: CalendarEntryInput,
): Promise<string> {
  const checked = validateCalendarEntryInput(input);
  if (!checked.ok) throw new Error(checked.error);

  const ref = doc(entriesCol(groupId));
  try {
    await setDoc(ref, {
      uid,
      title: checked.title,
      description: checked.description,
      location: checked.location,
      startAt: Timestamp.fromMillis(checked.startAt),
      endAt: Timestamp.fromMillis(checked.endAt),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return ref.id;
  } catch (error) {
    throw wrapFirestoreError(error, "Không lưu được lịch bận.");
  }
}

export async function updateCalendarEntry(
  groupId: string,
  entryId: string,
  input: CalendarEntryInput,
): Promise<void> {
  const checked = validateCalendarEntryInput(input);
  if (!checked.ok) throw new Error(checked.error);

  try {
    await updateDoc(entryRef(groupId, entryId), {
      title: checked.title,
      description: checked.description,
      location: checked.location,
      startAt: Timestamp.fromMillis(checked.startAt),
      endAt: Timestamp.fromMillis(checked.endAt),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    throw wrapFirestoreError(error, "Không cập nhật được lịch bận.");
  }
}

export async function deleteCalendarEntry(groupId: string, entryId: string): Promise<void> {
  try {
    await deleteDoc(entryRef(groupId, entryId));
  } catch (error) {
    throw wrapFirestoreError(error, "Không xóa được lịch bận.");
  }
}

export type CopyCandidate = {
  sourceId: string;
  destId: string;
  uid: string;
  title: string;
  description: string;
  location: string;
  startAt: number;
  endAt: number;
};

export async function previewCopyFromPreviousWeek(
  groupId: string,
  uid: string,
  targetWeekStartYmd: string,
): Promise<CopyCandidate[]> {
  const previousStart = addDaysYmd(weekBounds(targetWeekStartYmd).startYmd, -7);
  const previous = weekBounds(previousStart);
  const listed = await listCalendarWeek(groupId, previous.startMs, previous.endMs);
  const asEntries: CalendarEntry[] = listed.map((item) => ({
    id: item.id,
    uid: item.uid,
    title: item.title,
    description: item.description,
    location: item.location,
    startAt: item.startAt,
    endAt: item.endAt,
  }));

  return buildCopiedEntries(asEntries, targetWeekStartYmd)
    .filter((item) => item.entry.uid === uid)
    .map((item) => ({
      sourceId: item.sourceId,
      destId: item.destId,
      uid: item.entry.uid,
      title: item.entry.title,
      description: item.entry.description,
      location: item.entry.location,
      startAt: item.entry.startAt,
      endAt: item.entry.endAt,
    }));
}

function sourceIdFromCopy(destId: string, targetWeekStartYmd: string, fallback: string): string {
  const suffix = `__${targetWeekStartYmd}`;
  if (destId.endsWith(suffix)) return destId.slice(0, -suffix.length);
  return fallback;
}

export async function copyPreviousWeekEntries(
  groupId: string,
  uid: string,
  targetWeekStartYmd: string,
  candidates?: CopyCandidate[],
): Promise<CopyWeekResult> {
  const items =
    candidates && candidates.length
      ? candidates
      : await previewCopyFromPreviousWeek(groupId, uid, targetWeekStartYmd);

  const result: CopyWeekResult = { added: 0, skipped: 0, failed: [] };
  const firestore = requireDb();

  for (const candidate of items) {
    const destId = candidate.destId;
    const sourceId = candidate.sourceId || sourceIdFromCopy(destId, targetWeekStartYmd, destId);
    try {
      const status = await runTransaction(firestore, async (tx) => {
        const ref = entryRef(groupId, destId);
        const snap = await tx.get(ref);
        if (snap.exists()) return "skipped" as const;
        tx.set(ref, {
          uid,
          title: candidate.title,
          description: candidate.description,
          location: candidate.location,
          startAt: Timestamp.fromMillis(candidate.startAt),
          endAt: Timestamp.fromMillis(candidate.endAt),
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        return "added" as const;
      });
      if (status === "skipped") result.skipped += 1;
      else result.added += 1;
    } catch (error) {
      result.failed.push({
        sourceId,
        destId,
        message: wrapFirestoreError(error, "Không sao chép được lịch này.").message,
      });
    }
  }

  return result;
}
