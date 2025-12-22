import React, { memo, useMemo } from "react"
import { useSelector } from "react-redux"
import { ArrayEqual } from "../util/common"

const QrButton = ({ session }) => {
  const baseUrl = import.meta.env.VITE_APP_BASE || ""
  const [lastFeedback] = useSelector((state) => {
    return [state.feedback.get("lastSubmittedAt")]
  }, ArrayEqual)

  const qrSrc = useMemo(() => {
    if (!baseUrl || !session) return ""
    const targetUrl = `${baseUrl}/?session=${session}`
    return `https://api.qrserver.com/v1/create-qr-code/?size=120x120&data=${encodeURIComponent(
      targetUrl
    )}`
  }, [baseUrl, session])

  if (!session || !qrSrc) return null

  return (
    <button
      id="qr-button"
      className={`${lastFeedback ? "ai-glow" : ""}`}
      type="button"
    >
      <img src={qrSrc} alt="QR code" />
      Scan to move to AI Guide App
    </button>
  )
}

export default memo(QrButton)
