import {
  GoogleAuthProvider,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  onAuthStateChanged,
  signInWithRedirect,
  getRedirectResult,
  getAuth,
} from "firebase/auth";
import { auth } from "../config/firebase";

const provider = new GoogleAuthProvider();
function isMobile() {
  return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
}

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
  const auth = getAuth();
  const provider = new GoogleAuthProvider();

  if (isMobile()) {
    // ✅ Mobile → redirect
    await signInWithRedirect(auth, provider);
    return;
  } else {
    // ✅ Desktop → popup
    await signInWithPopup(auth, provider);
  }
}

export async function handleRedirectResult() {
  try {
    const result = await getRedirectResult(auth);
    return result?.user || null;
  } catch (e) {
    console.error("Redirect login failed:", e);
    throw e;
  }
}

export async function logout() {
  await signOut(auth);
}
