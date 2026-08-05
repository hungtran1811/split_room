import type { ReactNode } from "react";
import { HashRouter, Navigate, Outlet, Route, Routes } from "react-router-dom";
import { firebaseConfigured } from "../config/firebase";
import { AdminPage } from "../pages/AdminPage";
import { DashboardPage } from "../pages/DashboardPage";
import { ExpensesPage } from "../pages/ExpensesPage";
import { LoginPage } from "../pages/LoginPage";
import { PaymentsPage } from "../pages/PaymentsPage";
import { RentPage } from "../pages/RentPage";
import { AppShell } from "./AppShell";
import { useSession } from "./SessionContext";

function BootScreen({ title, subtitle, children }: { title: string; subtitle: string; children?: ReactNode }) {
  return (
    <div className="boot-screen">
      <div className="app-boot__card">
        <h1>{title}</h1>
        <p>{subtitle}</p>
        {children ? <div className="app-boot__actions">{children}</div> : null}
      </div>
    </div>
  );
}

function AuthGate() {
  const { bootStatus, errorMessage } = useSession();

  if (!firebaseConfigured || bootStatus === "needs-config") {
    return (
      <BootScreen
        title="Chưa cấu hình Firebase"
        subtitle="Thiếu VITE_FB_API_KEY hoặc VITE_FB_PROJECT_ID. Sao chép .env.example thành .env.local, điền cấu hình Firebase, rồi chạy lại ứng dụng."
      />
    );
  }

  if (bootStatus === "error") {
    return (
      <BootScreen title="Không thể tải dữ liệu" subtitle={errorMessage || "Đã xảy ra lỗi không xác định."}>
        <button type="button" className="btn btn--primary btn--sm" onClick={() => window.location.reload()}>
          Thử lại
        </button>
      </BootScreen>
    );
  }

  if (bootStatus === "signed-out") {
    return <Navigate to="/login" replace />;
  }

  if (bootStatus !== "ready") {
    return <BootScreen title="Đang tải..." subtitle="Vui lòng chờ trong giây lát." />;
  }

  return <Outlet />;
}

function LoginRoute() {
  const { bootStatus } = useSession();

  if (bootStatus === "ready") {
    return <Navigate to="/dashboard" replace />;
  }

  return <LoginPage />;
}

export function AppRouter() {
  return (
    <HashRouter>
      <Routes>
        <Route path="/login" element={<LoginRoute />} />
        <Route element={<AuthGate />}>
          <Route element={<AppShell />}>
            <Route index element={<Navigate to="/dashboard" replace />} />
            <Route path="dashboard" element={<DashboardPage />} />
            <Route path="expenses" element={<ExpensesPage />} />
            <Route path="payments" element={<PaymentsPage />} />
            <Route path="rent" element={<RentPage />} />
            <Route path="admin" element={<AdminPage />} />
          </Route>
        </Route>
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </HashRouter>
  );
}
