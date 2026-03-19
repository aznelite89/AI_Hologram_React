import React from "react"
import "@nrs/css/TopPanel.css"

const TopPanel = ({ cameraSignal, videoRef }) => {
  const badgeTitle = cameraSignal?.badgeTitle || "UNKNOWN"
  const badgeTone = cameraSignal?.badgeTone || "unknown"
  const metaText = cameraSignal?.metaText || "No visitor"

  const badgeClass =
    badgeTone === "visitor"
      ? "tp-badge tp-badge--visitor"
      : badgeTone === "kid"
        ? "tp-badge tp-badge--kid"
        : badgeTone === "adult"
          ? "tp-badge tp-badge--adult"
          : "tp-badge tp-badge--unknown"

  return (
    <div className="tp-root">
      <div className="tp-welcome-container">
        <img
          src="/logo.png"
          alt="Science Centre Singapore Logo"
          className="tp-scs-logo"
        />
        <div className="tp-welcome-text">
          Welcome to
          <br />
          Science Centre Singapore!
        </div>
      </div>

      <div className="tp-camera-wrap">
        <div className={badgeClass}>
          <div className="tp-badge__title">{badgeTitle}</div>
          <div className="tp-badge__meta">{metaText}</div>
        </div>

        <div className="tp-camera-frame">
          <video
            ref={videoRef}
            className="tp-webcam-feed"
            autoPlay
            muted
            playsInline
          />
          <div className="tp-webcam-label">
            AI can make mistakes, so double-check it
          </div>
        </div>
      </div>
    </div>
  )
}

export default TopPanel
