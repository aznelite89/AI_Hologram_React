import { useEffect } from "react"

const BLOCK_KEYS = new Set([
  "Escape",
  "F1",
  "F2",
  "F3",
  "F4",
  "F5",
  "F6",
  "F7",
  "F8",
  "F9",
  "F10",
  "F11",
  "F12",
  "+",
  "=",
  "-",
  "_",
  "0",
])

export default function KioskGuard({ enabled = true, allowWheelInMap = true }) {
  useEffect(() => {
    if (!enabled) return

    const isInMap = (target) => {
      const mapEl = document.getElementById("map")
      return !!(mapEl && target && mapEl.contains(target))
    }

    const onContextMenu = (e) => e.preventDefault()

    const onKeyDown = (e) => {
      // Block browser zoom shortcuts and escape combos
      const key = e.key
      const zoomCombo =
        (e.ctrlKey || e.metaKey) &&
        (key === "+" || key === "=" || key === "-" || key === "0")

      if (
        zoomCombo ||
        e.altKey ||
        e.ctrlKey ||
        e.metaKey ||
        BLOCK_KEYS.has(key)
      ) {
        e.preventDefault()
        e.stopPropagation()
      }
    }

    const onWheel = (e) => {
      // If in map mode and wheel inside map, allow it (so map can zoom)
      if (allowWheelInMap && isInMap(e.target)) return

      // Otherwise block wheel to prevent any zoom/scroll affecting hologram/page
      e.preventDefault()
      e.stopPropagation()
    }

    // iOS Safari pinch gesture events (some browsers)
    const onGesture = (e) => {
      e.preventDefault()
      e.stopPropagation()
    }

    // Also block double-tap zoom (some browsers)
    let lastTouchEnd = 0
    const onTouchEnd = (e) => {
      const now = Date.now()
      if (now - lastTouchEnd <= 300) {
        e.preventDefault()
      }
      lastTouchEnd = now
    }

    document.addEventListener("contextmenu", onContextMenu, { capture: true })
    window.addEventListener("keydown", onKeyDown, { capture: true })
    window.addEventListener("wheel", onWheel, { passive: false, capture: true })

    document.addEventListener("gesturestart", onGesture, {
      passive: false,
      capture: true,
    })
    document.addEventListener("gesturechange", onGesture, {
      passive: false,
      capture: true,
    })
    document.addEventListener("gestureend", onGesture, {
      passive: false,
      capture: true,
    })

    document.addEventListener("touchend", onTouchEnd, {
      passive: false,
      capture: true,
    })

    return () => {
      document.removeEventListener("contextmenu", onContextMenu, {
        capture: true,
      })
      window.removeEventListener("keydown", onKeyDown, { capture: true })
      window.removeEventListener("wheel", onWheel, { capture: true })

      document.removeEventListener("gesturestart", onGesture, { capture: true })
      document.removeEventListener("gesturechange", onGesture, {
        capture: true,
      })
      document.removeEventListener("gestureend", onGesture, { capture: true })

      document.removeEventListener("touchend", onTouchEnd, { capture: true })
    }
  }, [enabled, allowWheelInMap])

  return null
}
