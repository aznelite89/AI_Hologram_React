import { logEvent } from "firebase/analytics"
import { getFirebaseAnalytics } from "../firebase"

export async function trackEvent(eventName, params = {}) {
  try {
    const analytics = await getFirebaseAnalytics()
    if (!analytics) return

    logEvent(analytics, eventName, params)
  } catch (error) {
    console.error("Analytics trackEvent error:", error)
  }
}
