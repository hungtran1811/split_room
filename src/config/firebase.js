import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

function resolveAuthDomain() {
  const configuredAuthDomain = import.meta.env.VITE_FB_AUTH_DOMAIN;

  if (typeof window === "undefined") {
    return configuredAuthDomain;
  }

  const currentHost = window.location.host;
  if (currentHost === "splitfam.netlify.app") {
    return currentHost;
  }

  return configuredAuthDomain;
}

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FB_API_KEY,
  authDomain: resolveAuthDomain(),
  projectId: import.meta.env.VITE_FB_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FB_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FB_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FB_APP_ID,
};

export const fbApp = initializeApp(firebaseConfig);
export const auth = getAuth(fbApp);
export const db = getFirestore(fbApp);
