import { useEffect, useState } from "react";

function msUntilNextMinute(now: number): number {
  return 60_000 - (now % 60_000) + 50;
}

/** Cập nhật mỗi phút (và khi tab được mở lại) để đường giờ hiện tại / tuần hiện tại theo thời gian thật. */
export function useNowMs(): number {
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    let intervalId = 0;

    function tick() {
      setNowMs(Date.now());
    }

    const timeoutId = window.setTimeout(() => {
      tick();
      intervalId = window.setInterval(tick, 60_000);
    }, msUntilNextMinute(Date.now()));

    function onResume() {
      if (document.visibilityState === "hidden") return;
      tick();
    }

    document.addEventListener("visibilitychange", onResume);
    window.addEventListener("focus", onResume);

    return () => {
      window.clearTimeout(timeoutId);
      window.clearInterval(intervalId);
      document.removeEventListener("visibilitychange", onResume);
      window.removeEventListener("focus", onResume);
    };
  }, []);

  return nowMs;
}
