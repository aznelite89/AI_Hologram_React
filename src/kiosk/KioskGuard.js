import { useEffect } from "react"

// may add more keys for Science center kiosk if wanna block
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
])

export default function KioskGuard({ enabled = true }) {
  useEffect(() => {
    if (!enabled) return

    const onContextMenu = (e) => e.preventDefault()

    const onKeyDown = (e) => {
      // Block all those Alt/Ctrl/Meta combos commonly used to escape / devtools / refresh..
      if (e.altKey || e.ctrlKey || e.metaKey) {
        e.preventDefault()
        e.stopPropagation()
        return
      }
      if (BLOCK_KEYS.has(e.key)) {
        e.preventDefault()
        e.stopPropagation()
        return
      }
    }

    const onDragStart = (e) => e.preventDefault()

    const onWheel = (e) => {
      // block Ctrl+wheel zoom
      if (e.ctrlKey) e.preventDefault()
    }

    document.addEventListener("contextmenu", onContextMenu, { capture: true })
    window.addEventListener("keydown", onKeyDown, { capture: true })
    document.addEventListener("dragstart", onDragStart, { capture: true })
    window.addEventListener("wheel", onWheel, { passive: false, capture: true })

    return () => {
      document.removeEventListener("contextmenu", onContextMenu, {
        capture: true,
      })
      window.removeEventListener("keydown", onKeyDown, { capture: true })
      document.removeEventListener("dragstart", onDragStart, { capture: true })
      window.removeEventListener("wheel", onWheel, { capture: true })
    }
  }, [enabled])

  return null
}
