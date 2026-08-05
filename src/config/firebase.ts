import { initializeApp, type FirebaseApp } from "firebase/app";
import { getAuth, type Auth } from "firebase/auth";
import {
  getFirestore,
  enableIndexedDbPersistence,
  type Firestore,
} from "firebase/firestore";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FB_API_KEY,
  authDomain: import.meta.env.VITE_FB_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FB_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FB_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FB_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FB_APP_ID,
};

const hasFirebaseConfig = Boolean(
  firebaseConfig.apiKey && firebaseConfig.projectId,
);

if (!hasFirebaseConfig && typeof console !== "undefined") {
  console.error(
    "[splitroom] Thiếu VITE_FB_API_KEY / VITE_FB_PROJECT_ID. Sao chép .env.example thành .env.local và điền cấu hình Firebase.",
  );
}

export const fbApp: FirebaseApp | null = hasFirebaseConfig
  ? initializeApp(firebaseConfig)
  : null;
export const auth: Auth | null = fbApp ? getAuth(fbApp) : null;
export const db: Firestore | null = fbApp ? getFirestore(fbApp) : null;
export const firebaseConfigured = hasFirebaseConfig;

if (fbApp && db && typeof window !== "undefined") {
  enableIndexedDbPersistence(db).catch((error: { code?: string }) => {
    if (error?.code === "failed-precondition") {
      console.warn("[splitroom] Firestore persistence: multiple tabs open");
      return;
    }
    if (error?.code === "unimplemented") {
      console.warn("[splitroom] Firestore persistence not supported");
    }
  });
}
