import type { ReactNode } from "react";
import { ToastProvider } from "../shared/ui/Toast";
import { SessionProvider } from "./SessionContext";

export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <ToastProvider>
      <SessionProvider>{children}</SessionProvider>
    </ToastProvider>
  );
}
