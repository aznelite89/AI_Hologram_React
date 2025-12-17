import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

export function getFirebaseConfigFromEnv() {
  const cfg = {
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
    authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
    appId: import.meta.env.VITE_FIREBASE_APP_ID,
  }
  const ok = Object.values(cfg).every(Boolean)
  return ok ? cfg : null
}

let _db = null;

export function getDb() {
  if (_db) return _db;
  const cfg = getFirebaseConfigFromEnv();
  if (!cfg) return null;
  const app = initializeApp(cfg);
  _db = getFirestore(app);
  return _db
}