import { useState } from "react";
import { firebaseConfigured } from "../config/firebase";
import { getAuthErrorMessage, loginWithGoogle } from "../services/auth.service";

export function LoginPage() {
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);

  if (!firebaseConfigured) {
    return (
      <div className="login-page">
        <div className="login-card">
          <div className="login-card__brand">Split Room</div>
          <p className="login-card__subtitle">
            Thiếu VITE_FB_API_KEY hoặc VITE_FB_PROJECT_ID. Sao chép .env.example thành .env.local, điền
            cấu hình Firebase, rồi chạy lại ứng dụng.
          </p>
        </div>
      </div>
    );
  }

  async function handleLogin() {
    setMessage("");
    setPending(true);
    try {
      await loginWithGoogle();
    } catch (error) {
      setMessage(getAuthErrorMessage(error));
      setPending(false);
    }
  }

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-card__brand">Split Room</div>
        <p className="login-card__subtitle">Đăng nhập bằng Google để quản lý chi tiêu chung của nhóm.</p>
        <button
          type="button"
          className="login-card__google"
          disabled={pending}
          onClick={() => void handleLogin()}
        >
          <svg width="18" height="18" viewBox="0 0 18 18">
            <path
              fill="#4285F4"
              d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.9c1.7-1.57 2.7-3.88 2.7-6.62z"
            />
            <path
              fill="#34A853"
              d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.9-2.26c-.8.55-1.84.87-3.06.87-2.36 0-4.36-1.6-5.08-3.74H.9v2.34A9 9 0 0 0 9 18z"
            />
            <path
              fill="#FBBC05"
              d="M3.92 10.69A5.4 5.4 0 0 1 3.64 9c0-.59.1-1.16.28-1.69V4.97H.9A9 9 0 0 0 0 9c0 1.45.35 2.83.9 4.03z"
            />
            <path
              fill="#EA4335"
              d="M9 3.58c1.32 0 2.5.46 3.44 1.35l2.57-2.57C13.46.9 11.43 0 9 0A9 9 0 0 0 .9 4.97l3.02 2.34C4.64 5.18 6.64 3.58 9 3.58z"
            />
          </svg>
          Đăng nhập với Google
        </button>
        <div className="login-card__message">{message}</div>
      </div>
    </div>
  );
}
