import { useCallback, useEffect, useRef } from "react"

/**
 * Inactivity reset for kiosk:
 * - Listens to common user activity events.
 * - Resets after `timeoutMs` of inactivity.
 * - Throttles activity updates to avoid excessive work.
 */
export function useInactivityReset({
  enabled = true,
  timeoutMs = 60000, // 1 minutes
  onTimeout,
  // optionall: do not reset while busy (AI processing / TTS speaking etc)
  isBlocked = () => true,
  // optional: extra events (custom DOM events, might need in futere)
  extraEvents = [],
}) {
  const timerRef = useRef(null)
  const lastTouchRef = useRef(0)

  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
  }, [])

  const armTimer = useCallback(() => {
    clearTimer()
    if (!enabled) return
    if (typeof onTimeout !== "function") return

    timerRef.current = setTimeout(() => {
      if (!enabled) return
      if (isBlocked && isBlocked()) {
        // If blocked (e.g. AI is still talking), re-arm and try again.
        armTimer()
        return
      }
      onTimeout()
    }, timeoutMs)
  }, [clearTimer, enabled, onTimeout, timeoutMs, isBlocked])

  const markActive = useCallback(() => {
    // tiny throttle for noisy events like mousemove/touchmove
    const now = Date.now()
    if (now - lastTouchRef.current < 250) return
    lastTouchRef.current = now
    armTimer()
  }, [armTimer])

  useEffect(() => {
    if (!enabled) {
      clearTimer()
      return
    }

    // Start counting as soon as enabled
    armTimer()

    const events = [
      "pointerdown",
      "pointermove",
      "mousedown",
      "mousemove",
      "touchstart",
      "touchmove",
      "keydown",
      "wheel",
      "scroll",
      "click",
      ...extraEvents,
    ]

    // Use capture so it still fires even if something stops propagation
    events.forEach((evt) =>
      window.addEventListener(evt, markActive, { capture: true, passive: true })
    )

    return () => {
      events.forEach((evt) =>
        window.removeEventListener(evt, markActive, { capture: true })
      )
      clearTimer()
    }
  }, [enabled, extraEvents, armTimer, markActive, clearTimer])

  return { markActive, resetInactivityTimer: armTimer }
}
