import React, {
  memo,
  useCallback,
  useMemo,
  useState,
  useEffect,
  useRef,
} from "react"
import { censorBadWords } from "../util/common"
import { getLastNMessages } from "../util/speech"

const ChatPanel = ({
  visible = [], // kept for API compatibility
  full = [],
  voiceStatus = "",
  isListening,
  isProcessing,
  isConversationOpen,
  onToggleConversation,
  onPushToTalk,
  onSendText,
}) => {
  const [text, setText] = useState("")
  const historyEndRef = useRef(null)

  const handleChange = useCallback((e) => {
    setText(e.target.value)
  }, [])

  const handleSend = useCallback(() => {
    const msg = text.trim()
    if (!msg || isProcessing) return
    setText("")
    //let React commit/pain first, then start heavy async pipeline
    requestAnimationFrame(() => {
      onSendText?.(msg)
    })
  }, [text, isProcessing, onSendText])

  const handleKeyDown = useCallback(
    (e) => {
      if (e.key === "Enter") handleSend()
    },
    [handleSend]
  )

  // oonly touch a small tail, filter out system, show last 3.
  const renderedMessages = useMemo(() => {
    // take a small tail so can filter "system" and still have last 3
    const tail = getLastNMessages(full, 12)

    const filtered = []
    for (let i = 0; i < tail.length; i++) {
      const msg = tail[i]
      if (!msg || msg.get("role") === "system") continue
      filtered.push(msg)
    }

    const last3 = filtered.slice(-3)

    return last3.map((msg, idx) => {
      const isUser = msg?.get("role") === "user"
      return {
        key:
          msg?.get("id") ??
          `${msg?.get("role") ?? "msg"}-${idx}-${msg?.get("timestamp") ?? ""}`,
        className: isUser ? "chat-bubble user" : "chat-bubble assistant",
        // Censor once here. do not censor on engine
        content: censorBadWords(msg?.get("content") ?? ""),
      }
    })
  }, [full])

  // Auto-scroll only when panel is open
  useEffect(() => {
    if (!isConversationOpen) return
    historyEndRef.current?.scrollIntoView({ behavior: "auto" })
  }, [renderedMessages.length, isConversationOpen])

  return (
    <div id="conversation-container">
      <button id="btn-view-conversation" onClick={onToggleConversation}>
        <span>
          <svg
            width="40"
            height="40"
            viewBox="0 0 180 180"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            style={{ color: "#ffe457" }}
          >
            <path
              d="M59.9995 75H60.0745M89.9995 75H90.0745M120 75H120.075M157.5 112.5C157.5 116.478 155.919 120.294 153.106 123.107C150.293 125.92 146.478 127.5 142.5 127.5H52.4995L22.4995 157.5V37.5C22.4995 33.5218 24.0799 29.7064 26.8929 26.8934C29.706 24.0804 33.5213 22.5 37.4995 22.5H142.5C146.478 22.5 150.293 24.0804 153.106 26.8934C155.919 29.7064 157.5 33.5218 157.5 37.5V112.5Z"
              stroke="#ffe457"
              strokeWidth="11"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </span>
        {isConversationOpen ? "Hide Conversation" : "View Full Conversation"}
      </button>

      <div
        id="conversation-history-container"
        className={
          isConversationOpen
            ? isProcessing
              ? "open processing"
              : "open"
            : "closed"
        }
      >
        <div id="voice-input-controls" className="voice-input-controls">
          <input
            id="voice-text-input"
            className="voice-text-input"
            type="text"
            placeholder="Type your message..."
            value={text}
            disabled={isProcessing}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
          />

          <button
            type="button"
            id="voice-send-btn"
            className="voice-send-btn"
            onClick={handleSend}
            disabled={isProcessing}
            data-disabled={isProcessing ? "1" : "0"}
          >
            <i className="fas fa-paper-plane"></i>
          </button>

          <button
            type="button"
            id="voice-mic-btn"
            className="voice-mic-btn"
            onClick={onPushToTalk}
            aria-disabled={isProcessing}
            data-disabled={isProcessing ? "1" : "0"}
          >
            {isProcessing ? (
              <i className="fas fa-spinner fa-spin"></i>
            ) : isListening ? (
              <i className="fas fa-microphone-slash"></i>
            ) : (
              <i className="fas fa-microphone"></i>
            )}
          </button>
        </div>

        <div id="conversation-history">
          {renderedMessages.length === 0
            ? "No Conversation History"
            : renderedMessages.map((m) => (
                <div key={m.key} className={m.className}>
                  {m.content}
                </div>
              ))}
          <div ref={historyEndRef} />
        </div>

        <div id="conversation-toolbar">
          <div id="voice-status">{voiceStatus}</div>

          <button id="push-to-talk" onClick={onPushToTalk}>
            {isProcessing
              ? "Processing..."
              : isListening
              ? "Listening..."
              : "Start"}
          </button>
        </div>
      </div>
    </div>
  )
}

export default memo(ChatPanel)
