import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore, enableIndexedDbPersistence } from "firebase/firestore";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FB_API_KEY,
  authDomain: import.meta.env.VITE_FB_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FB_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FB_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FB_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FB_APP_ID,
};

export const fbApp = initializeApp(firebaseConfig);
export const auth = getAuth(fbApp);
export const db = getFirestore(fbApp);

if (typeof window !== "undefined") {
  enableIndexedDbPersistence(db).catch((error) => {
    if (error?.code === "failed-precondition") {
      console.warn("[splitroom] Firestore persistence: multiple tabs open");
      return;
    }
    if (error?.code === "unimplemented") {
      console.warn("[splitroom] Firestore persistence not supported");
    }
  });
}
