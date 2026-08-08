import { useCallback } from "react";
import { useSession } from "../app/SessionContext";
import { resolveMemberLabel } from "../domain/members/nicknames";

export function useMemberLabel() {
  const { nicknames } = useSession();

  return useCallback(
    (memberId: string) => resolveMemberLabel(memberId, nicknames),
    [nicknames],
  );
}
