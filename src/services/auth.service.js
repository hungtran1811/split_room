import {
  GoogleAuthProvider,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  onAuthStateChanged,
  signInWithRedirect,
  getRedirectResult,
} from "firebase/auth";
import { auth } from "../config/firebase";

const provider = new GoogleAuthProvider();
provider.setCustomParameters({ prompt: "select_account" });

export function watchAuth(callback) {
  return onAuthStateChanged(auth, callback);
}

export async function loginWithEmail(email, password) {
  const cred = await signInWithEmailAndPassword(auth, email, password);
  return cred.user;
}

export async function registerWithEmail(email, password) {
  const cred = await createUserWithEmailAndPassword(auth, email, password);
  return cred.user;
}

export async function loginWithGoogle() {
  try {
    await signInWithPopup(auth, provider);
    return { mode: "popup" };
  } catch (error) {
    if (!shouldFallbackToRedirect(error)) {
      throw error;
    }

    await signInWithRedirect(auth, provider);
    return { mode: "redirect" };
  }
}

export async function resolvePendingGoogleRedirect() {
  try {
    const result = await getRedirectResult(auth);
    return result?.user || null;
  } catch (e) {
    console.error("Redirect login failed:", e);
    throw e;
  }
}

export const handleRedirectResult = resolvePendingGoogleRedirect;

export function getAuthErrorMessage(error) {
  const code = error?.code || "";

  if (code.includes("auth/unauthorized-domain")) {
    return "Domain hiện tại chưa được thêm vào Authorized domains của Firebase.";
  }

  if (code.includes("auth/operation-not-allowed")) {
    return "Google Sign-In chưa được bật trong Firebase Authentication.";
  }

  if (code.includes("auth/popup-blocked")) {
    return "Trình duyệt đã chặn popup đăng nhập Google.";
  }

  if (code.includes("auth/popup-closed-by-user")) {
    return "Bạn đã đóng cửa sổ đăng nhập trước khi hoàn tất.";
  }

  if (code.includes("auth/network-request-failed")) {
    return "Không thể kết nối tới Firebase. Hãy kiểm tra mạng rồi thử lại.";
  }

  return error?.message || "Đăng nhập Google thất bại.";
}

function shouldFallbackToRedirect(error) {
  const code = error?.code || "";

  return (
    code.includes("auth/popup-blocked") ||
    code.includes("auth/operation-not-supported-in-this-environment") ||
    code.includes("auth/web-storage-unsupported")
  );
}

export async function logout() {
  await signOut(auth);
}
