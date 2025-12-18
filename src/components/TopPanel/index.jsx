import React from "react"

const TopPanel = () => {
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
      <div id="webcam-label">I'm Going Live Soon!</div>
    </>
  )
}

export default TopPanel
