import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { User } from "firebase/auth";
import type { Unsubscribe } from "firebase/firestore";
import { firebaseConfigured } from "../config/firebase";
import { GROUP_ID } from "../config/constants";
import {
  comparePeriod,
  currentPeriod,
  periodStorageKey,
  resolveActivePeriod,
} from "../core/period";
import type { MemberProfile } from "../core/roles";
import type { PeriodDoc } from "../types/models";
import {
  resolvePendingGoogleRedirect,
  watchAuth,
} from "../services/auth.service";
import { ensureDefaultGroup } from "../services/group.service";
import {
  upsertMemberProfile,
  watchGroupMembers,
} from "../services/member.service";
import { watchNicknames } from "../services/nickname.service";
import { getPeriod } from "../services/period.service";

export type BootStatus = "loading" | "needs-config" | "error" | "ready" | "signed-out";

type SessionContextValue = {
  user: User | null;
  bootStatus: BootStatus;
  errorMessage: string;
  groupId: string | null;
  memberProfile: MemberProfile | null;
  members: MemberProfile[];
  nicknames: Record<string, string>;
  selectedPeriod: string;
  setSelectedPeriod: (period: string) => void;
  periodDoc: PeriodDoc | null;
  lockedSoft: boolean;
  refreshPeriod: () => Promise<void>;
};

const SessionContext = createContext<SessionContextValue | null>(null);

function readStoredPeriod(): string {
  try {
    const raw = localStorage.getItem(periodStorageKey(GROUP_ID));
    if (raw) return resolveActivePeriod(raw);
  } catch {
    // Ignore storage access failures.
  }
  return currentPeriod();
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [bootStatus, setBootStatus] = useState<BootStatus>(
    firebaseConfigured ? "loading" : "needs-config",
  );
  const [errorMessage, setErrorMessage] = useState("");
  const [groupId, setGroupId] = useState<string | null>(null);
  const [memberProfile, setMemberProfile] = useState<MemberProfile | null>(null);
  const [members, setMembers] = useState<MemberProfile[]>([]);
  const [nicknames, setNicknames] = useState<Record<string, string>>({});
  const [selectedPeriod, setSelectedPeriodState] = useState<string>(readStoredPeriod);
  const [periodDoc, setPeriodDoc] = useState<PeriodDoc | null>(null);

  const groupUnsubRef = useRef<Unsubscribe | null>(null);
  const periodTokenRef = useRef(0);
  const manualPastPeriodRef = useRef(false);
  const trackedCalendarPeriodRef = useRef(currentPeriod());

  const stopGroupSubscriptions = useCallback(() => {
    groupUnsubRef.current?.();
    groupUnsubRef.current = null;
  }, []);

  const setSelectedPeriod = useCallback((period: string) => {
    manualPastPeriodRef.current = comparePeriod(period, currentPeriod()) < 0;
    setSelectedPeriodState(period);
    try {
      localStorage.setItem(periodStorageKey(GROUP_ID), period);
    } catch {
      // Ignore storage write failures and keep runtime state only.
    }
  }, []);

  const refreshPeriod = useCallback(async () => {
    if (!groupId || !selectedPeriod) return;
    const token = ++periodTokenRef.current;
    try {
      const doc = await getPeriod(groupId, selectedPeriod);
      if (token !== periodTokenRef.current) return;
      setPeriodDoc((doc as PeriodDoc | null) || null);
    } catch (error) {
      console.warn("[splitroom] Không thể tải thông tin kỳ.", error);
      if (token !== periodTokenRef.current) return;
      setPeriodDoc(null);
    }
  }, [groupId, selectedPeriod]);

  useEffect(() => {
    if (!firebaseConfigured) return;

    let cancelled = false;

    async function boot() {
      try {
        await resolvePendingGoogleRedirect();
      } catch (error) {
        if (!cancelled) {
          setErrorMessage((error as { message?: string })?.message || "");
        }
      }
    }

    void boot();

    const unsubAuth = watchAuth(async (nextUser) => {
      setUser(nextUser);

      if (!nextUser) {
        stopGroupSubscriptions();
        setGroupId(null);
        setMembers([]);
        setNicknames({});
        setMemberProfile(null);
        setPeriodDoc(null);
        setBootStatus("signed-out");
        return;
      }

      setBootStatus("loading");
      setErrorMessage("");

      try {
        const nextGroupId = await ensureDefaultGroup(nextUser);
        setGroupId(nextGroupId);
        await upsertMemberProfile(nextGroupId, nextUser);

        stopGroupSubscriptions();
        const unsubMembers = watchGroupMembers(nextGroupId, (nextMembers) => {
          const typed = nextMembers as MemberProfile[];
          setMembers(typed);
          const mine =
            typed.find(
              (member) =>
                member.uid === nextUser.uid ||
                member.id === nextUser.uid ||
                String(member.id || "") === nextUser.uid,
            ) || null;
          setMemberProfile(mine);
        });
        const unsubNicknames = watchNicknames(nextGroupId, setNicknames);
        groupUnsubRef.current = () => {
          unsubMembers();
          unsubNicknames();
        };

        setBootStatus("ready");
      } catch (error) {
        console.error("[splitroom] Boot setup failed:", error);
        setErrorMessage((error as { message?: string })?.message || "Đã xảy ra lỗi không xác định.");
        setBootStatus("error");
      }
    });

    return () => {
      cancelled = true;
      unsubAuth();
      stopGroupSubscriptions();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    void refreshPeriod();
  }, [refreshPeriod]);

  useEffect(() => {
    function syncCalendarPeriod() {
      const now = currentPeriod();
      if (now !== trackedCalendarPeriodRef.current) {
        trackedCalendarPeriodRef.current = now;
        manualPastPeriodRef.current = false;
        if (comparePeriod(selectedPeriod, now) < 0) {
          setSelectedPeriod(now);
        }
        return;
      }
      if (
        !manualPastPeriodRef.current &&
        comparePeriod(selectedPeriod, now) < 0
      ) {
        setSelectedPeriod(now);
      }
    }

    syncCalendarPeriod();

    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") syncCalendarPeriod();
    };

    document.addEventListener("visibilitychange", onVisibilityChange);
    const intervalId = window.setInterval(syncCalendarPeriod, 60_000);

    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.clearInterval(intervalId);
    };
  }, [selectedPeriod, setSelectedPeriod]);

  const value: SessionContextValue = {
    user,
    bootStatus,
    errorMessage,
    groupId,
    memberProfile,
    members,
    nicknames,
    selectedPeriod,
    setSelectedPeriod,
    periodDoc,
    lockedSoft: Boolean(periodDoc?.lockedSoft),
    refreshPeriod,
  };

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionContextValue {
  const context = useContext(SessionContext);
  if (!context) {
    throw new Error("useSession phải được dùng trong SessionProvider.");
  }
  return context;
}
