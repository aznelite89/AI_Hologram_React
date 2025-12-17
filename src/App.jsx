import React, { useEffect, useState } from "react"
import { startLegacyApp } from "./legacy/app.js"
import ChatPanel from "./components/ChatPanel.jsx"

export default function App() {
  const [conversation, setConversation] = useState("No Conversation History")
  const [voiceStatus, setVoiceStatus] = useState("Idle")

  useEffect(() => {
    let api
    ;(async () => {
      api = await startLegacyApp()
    })()

    return () => {
      // best-effort cleanup
      try {
        api?.destroy?.()
      } catch (e) {
        console.warn("Legacy destroy failed:", e)
      }
    }
  }, [])

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

      <div id="container"></div>

      <div id="action-buttons-container">
        <div className="button-instruction">Tap to Reset Conversation</div>
        <button id="btn-refresh-conversation" type="button">
          <svg
            width="60"
            height="60"
            viewBox="0 0 24 24"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              d="M17.65 6.35C16.2 4.9 14.21 4 12 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08c-0.82 2.33-3.04 4-5.65 4-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14 0.69 4.22 1.78L13 11h7V4l-2.35 2.35z"
              fill="currentColor"
            />
          </svg>
        </button>

        <div className="button-instruction">Tap Microphone to Talk</div>
        <button id="btn-main-microphone" type="button">
          <i className="fas fa-microphone"></i>
        </button>
        <ChatPanel
          history={conversation}
          voiceStatus={voiceStatus}
          onViewConversation={() => console.log("View conversation")}
          onPushToTalk={() => setVoiceStatus("Listening...")}
        />
      </div>

      <video id="webcam-feed" autoPlay muted playsInline></video>
      <div id="webcam-label">I'm Going Live Soon!</div>
    </>
  )
}
