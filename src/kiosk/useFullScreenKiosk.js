import { useCallback, useEffect, useRef, useState } from "react"

export function useFullscreenKiosk({ enabled = true } = {}) {
  const [isFullscreen, setIsFullscreen] = useState(!!document.fullscreenElement)
  const retryTimer = useRef(null)

  const request = useCallback(async () => {
    if (!enabled) return false
    try {
      if (!document.fullscreenElement) {
        await document.documentElement.requestFullscreen()
      }
      return true
    } catch {
      return false
    }
  }, [enabled])

  useEffect(() => {
    if (!enabled) return

    const onFsChange = () => {
      const on = !!document.fullscreenElement
      setIsFullscreen(on)
      console.debug("FULL SCREEN CHANGE...")
      // if fullscreen got dropped, retry after a short delay
      if (!on) {
        clearTimeout(retryTimer.current)
        retryTimer.current = setTimeout(() => request(), 300)
      }
    }

    document.addEventListener("fullscreenchange", onFsChange)
    return () => {
      document.removeEventListener("fullscreenchange", onFsChange)
      clearTimeout(retryTimer.current)
    }
  }, [enabled, request])

  return { isFullscreen, requestFullscreen: request }
}
