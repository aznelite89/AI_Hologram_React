import { useEffect, useRef } from "react"

export default function KioskWatchdog({
  enabled = true,
  pingEveryMs = 50000,
  maxNoPingMs = 200000,
}) {
  const lastPingRef = useRef(Date.now())

  useEffect(() => {
    if (!enabled) return

    // App should call window.__KIOSK_PING__() periodically when healthy (e.g. in root render loop / key screens)
    window.__KIOSK_PING__ = () => {
      lastPingRef.current = Date.now()
    }

    const onError = () => window.location.reload()
    const onRejection = () => window.location.reload()

    window.addEventListener("error", onError)
    window.addEventListener("unhandledrejection", onRejection)

    const t = setInterval(() => {
      const delta = Date.now() - lastPingRef.current
      if (delta > maxNoPingMs) {
        window.location.reload()
      }
    }, pingEveryMs)

    return () => {
      delete window.__KIOSK_PING__
      clearInterval(t)
      window.removeEventListener("error", onError)
      window.removeEventListener("unhandledrejection", onRejection)
    }
  }, [enabled, pingEveryMs, maxNoPingMs])

  return null
}
