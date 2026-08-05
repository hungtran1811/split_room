import {
  GoogleAuthProvider,
  getRedirectResult,
  onAuthStateChanged,
  signInWithPopup,
  signInWithRedirect,
  signOut,
  type Auth,
  type User,
} from "firebase/auth";
import { auth } from "../config/firebase";
import { disposeLiveDataHub } from "./live-data-hub";

const provider = new GoogleAuthProvider();
provider.setCustomParameters({ prompt: "select_account" });

function requireAuth(): Auth {
  if (!auth) {
    throw new Error("Firebase Auth chưa được cấu hình.");
  }
  return auth;
}

export function watchAuth(callback: (user: User | null) => void): () => void {
  if (!auth) {
    callback(null);
    return () => {};
  }
  return onAuthStateChanged(auth, callback);
}

export async function loginWithGoogle(): Promise<{ mode: "popup" | "redirect" }> {
  const authInstance = requireAuth();
  try {
    await signInWithPopup(authInstance, provider);
    return { mode: "popup" };
  } catch (error) {
    if (!shouldFallbackToRedirect(error)) {
      throw error;
    }

    await signInWithRedirect(authInstance, provider);
    return { mode: "redirect" };
  }
}

export async function resolvePendingGoogleRedirect(): Promise<User | null> {
  const authInstance = requireAuth();
  try {
    const result = await getRedirectResult(authInstance);
    return result?.user || null;
  } catch (error) {
    console.error("Redirect login failed:", error);
    throw error;
  }
}

export function getAuthErrorMessage(error: unknown): string {
  const code = String((error as { code?: string })?.code || "");

  if (code.includes("auth/unauthorized-domain")) {
    return "Domain hiện tại chưa được thêm vào Authorized domains của Firebase.";
  }

  if (code.includes("auth/operation-not-allowed")) {
    return "Google Sign-In chưa được bật trong Firebase Authentication.";
  }

  if (code.includes("auth/popup-blocked")) {
    return "Trình duyệt đã chặn cửa sổ đăng nhập Google.";
  }

  if (code.includes("auth/popup-closed-by-user")) {
    return "Bạn đã đóng cửa sổ đăng nhập trước khi hoàn tất.";
  }

  if (code.includes("auth/network-request-failed")) {
    return "Không thể kết nối tới Firebase. Hãy kiểm tra mạng rồi thử lại.";
  }

  return (error as { message?: string })?.message || "Đăng nhập Google thất bại.";
}

function shouldFallbackToRedirect(error: unknown): boolean {
  const code = String((error as { code?: string })?.code || "");

  return (
    code.includes("auth/popup-blocked") ||
    code.includes("auth/operation-not-supported-in-this-environment") ||
    code.includes("auth/web-storage-unsupported")
  );
}

export async function logout(): Promise<void> {
  disposeLiveDataHub();
  await signOut(requireAuth());
}
