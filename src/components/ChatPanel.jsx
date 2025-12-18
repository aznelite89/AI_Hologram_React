import React from "react"

const ChatPanel = ({
  onViewConversation,
  onPushToTalk,
  voiceStatus = "",
  visible = [],
  sessionId = null,
}) => {
  return (
    <div id="conversation-container">
      <button id="btn-view-conversation" onClick={onViewConversation}>
        <span>
          {/* svg unchanged */}
          <svg width="40" height="40" viewBox="0 0 180 180" fill="none">
            <path
              d="M59.9995 75H60.0745M89.9995 75H90.0745M120 75H120.075M157.5 112.5C157.5 116.478 155.919 120.294 153.106 123.107C150.293 125.92 146.478 127.5 142.5 127.5H52.4995L22.4995 157.5V37.5C22.4995 33.5218 24.0799 29.7064 26.8929 26.8934C29.706 24.0804 33.5213 22.5 37.4995 22.5H142.5C146.478 22.5 150.293 24.0804 153.106 26.8934C155.919 29.7064 157.5 33.5218 157.5 37.5V112.5Z"
              stroke="#ffe457"
              strokeWidth="11"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </span>
        View Full Conversation
      </button>

      <div id="conversation-history-container">
        <div id="conversation-history">
          {visible.length === 0 ? (
            <div>No Conversation History</div>
          ) : (
            visible.map((m, idx) => (
              <div key={idx} className={`msg ${m.role}`}>
                {m.content}
              </div>
            ))
          )}
        </div>

        <div id="conversation-toolbar">
          <div id="voice-status">{voiceStatus}</div>
          {/* optional debug */}
          {sessionId ? (
            <div className="session-pill">Session: {sessionId}</div>
          ) : null}

          <button id="push-to-talk" onClick={onPushToTalk}>
            Start
          </button>
        </div>
      </div>
    </div>
  )
}

export default ChatPanel
