import React, { useEffect, useMemo, useRef, useState } from "react"
import { createPortal } from "react-dom"
import "@nrs/css/LanguagePickerPopover.css"

const LanguagePickerPopover = ({
  open,
  anchorRef,
  languages,
  value,
  onChange,
  onClose,
  title = "Choose your preferred language"
}) => {
  const panelRef = useRef(null)
  const [pos, setPos] = useState({ top: 0, left: 0 })

  const selected = useMemo(
    () => languages.find((l) => l.code === value) ?? languages?.[0],
    [languages, value]
  )

  // Position to the LEFT of anchor (true viewport coords because portal to body)
  useEffect(() => {
    if (!open) return
    const anchor = anchorRef?.current
    const panel = panelRef.current
    if (!anchor || !panel) return

    const compute = () => {
      const a = anchor.getBoundingClientRect()
      const p = panel.getBoundingClientRect()

      const gap = 14
      const desiredLeft = a.left - p.width - gap
      const desiredTop = a.top + a.height / 2 - p.height / 2

      const vw = window.innerWidth
      const vh = window.innerHeight

      const left = Math.max(12, Math.min(desiredLeft, vw - p.width - 12))
      const top = Math.max(12, Math.min(desiredTop, vh - p.height - 12))

      setPos({ left, top })
    }

    // do 2 passes to avoid first-measure issues
    compute()
    requestAnimationFrame(compute)

    window.addEventListener("resize", compute)
    window.addEventListener("scroll", compute, true)
    return () => {
      window.removeEventListener("resize", compute)
      window.removeEventListener("scroll", compute, true)
    }
  }, [open, anchorRef])

  // Outside click
  useEffect(() => {
    if (!open) return
    const onDown = (e) => {
      const panel = panelRef.current
      const anchor = anchorRef?.current
      if (!panel) return
      if (panel.contains(e.target)) return
      if (anchor && anchor.contains(e.target)) return
      onClose?.()
    }
    document.addEventListener("mousedown", onDown)
    document.addEventListener("touchstart", onDown, { passive: true })
    return () => {
      document.removeEventListener("mousedown", onDown)
      document.removeEventListener("touchstart", onDown)
    }
  }, [open, anchorRef, onClose])

  // Esc
  useEffect(() => {
    if (!open) return
    const onKey = (e) => e.key === "Escape" && onClose?.()
    document.addEventListener("keydown", onKey)
    return () => document.removeEventListener("keydown", onKey)
  }, [open, onClose])

  if (!open) return null

  const node = (
    <div className="lpOverlay" aria-hidden="true">
      <div
        ref={panelRef}
        className="lpPanel"
        role="dialog"
        aria-label="Language selector"
        style={{ left: pos.left, top: pos.top }}
      >
        <div className="lpHeader">{title}</div>

        <div className="lpSelected" aria-hidden="true">
          <span className="lpSelectedText">{selected?.label ?? ""}</span>
          <span className="lpChevron">▾</span>
        </div>

        <div className="lpList" role="listbox" aria-activedescendant={value}>
          {languages.map((l) => {
            const active = l.code === value
            return (
              <button
                key={l.code}
                id={l.code}
                type="button"
                role="option"
                aria-selected={active}
                className={"lpItem " + (active ? "isActive" : "")}
                onClick={() => {
                  onChange?.(l.code)
                  onClose?.()
                }}
              >
                <span className="lpItemLabel">{l.label}</span>
                {active ? (
                  <span className="lpCheck" aria-hidden="true">
                    ✓
                  </span>
                ) : (
                  <span className="lpCheckPlaceholder" />
                )}
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )

  // portal to <body> to escape transforms / z-index traps
  return createPortal(node, document.body)
}
export default LanguagePickerPopover
