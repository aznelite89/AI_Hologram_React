import { initializeApp, getApps, getApp } from "firebase/app"
import { getFirestore } from "firebase/firestore"
import { getAnalytics, isSupported } from "firebase/analytics"

export function getFirebaseConfigFromEnv() {
  const cfg = {
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
    authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
    appId: import.meta.env.VITE_FIREBASE_APP_ID,
    storageBucket: "scaiguide.firebasestorage.app",
    messagingSenderId: "65823510518",
    measurementId: "G-SDSW380DSL"
  }

  const ok = Object.values(cfg).every(Boolean)
  return ok ? cfg : null
}

let _app = null
let _db = null
let _analytics = null

export function getFirebaseApp() {
  if (_app) return _app

  const cfg = getFirebaseConfigFromEnv()
  if (!cfg) return null

  _app = getApps().length ? getApp() : initializeApp(cfg)
  return _app
}

export function getDb() {
  if (_db) return _db

  const app = getFirebaseApp()
  if (!app) return null

  _db = getFirestore(app)
  return _db
}

export async function getFirebaseAnalytics() {
  if (_analytics) return _analytics

  const app = getFirebaseApp()
  if (!app) return null

  if (typeof window === "undefined") return null

  const supported = await isSupported()
  if (!supported) return null

  _analytics = getAnalytics(app)
  return _analytics
}
