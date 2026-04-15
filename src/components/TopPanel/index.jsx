import React from "react"

const TopPanel = ({ showWebcamLabel = false }) => {
  return (
    <>
      <div id="welcome-container">
        <img
          src="/logo.png"
          alt="Science Centre Singapore Logo"
          className="scs-logo"
        />
        <div id="welcome-text">
          Welcome to
          <br />
          Science Centre Singapore!
        </div>
      </div>

      <video id="webcam-feed" autoPlay muted playsInline />
      {showWebcamLabel ? (
        <div id="webcam-label">AI can make mistakes, so double-check it</div>
      ) : null}
    </>
  )
}

export default TopPanel
