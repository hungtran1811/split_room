import { useEffect, useRef, useState } from "react";
import { subscribeLiveMonthData, type LiveMonthSnapshot } from "../services/live-data-hub";

const EMPTY_SNAPSHOT: LiveMonthSnapshot = {
  expenses: [],
  payments: [],
  rent: null,
  expensesReady: false,
  paymentsReady: false,
  rentReady: false,
  groupId: "",
  period: "",
};

let hookInstanceCounter = 0;

export function useLiveMonth(
  consumerId: string,
  groupId: string | null | undefined,
  period: string | null | undefined,
): LiveMonthSnapshot {
  const instanceIdRef = useRef<number>(0);
  if (!instanceIdRef.current) {
    instanceIdRef.current = ++hookInstanceCounter;
  }

  const [snapshot, setSnapshot] = useState<LiveMonthSnapshot>(EMPTY_SNAPSHOT);

  useEffect(() => {
    if (!groupId || !period) {
      setSnapshot(EMPTY_SNAPSHOT);
      return;
    }

    setSnapshot(EMPTY_SNAPSHOT);

    const unsubscribe = subscribeLiveMonthData({
      consumerId: `${consumerId}-${instanceIdRef.current}`,
      groupId,
      period,
      onUpdate: (payload) => setSnapshot(payload),
    });

    return unsubscribe;
  }, [consumerId, groupId, period]);

  return snapshot;
}
