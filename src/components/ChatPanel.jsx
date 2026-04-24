import React, {
  memo,
  useCallback,
  useMemo,
  useState,
  useEffect,
  useRef
} from "react"
import { censorBadWords } from "../util/common"
import { extractAssistantText, getLastNMessages } from "../util/speech"
import OnScreenKeyboard from "./OnScreenKeyboard"
import MicWave from "./MicWave"
import "@nrs/css/mic.css"
import { useDispatch } from "react-redux"
import { toggleConversationOpen } from "../slices/speechSlice"
import LanguagePickerPopover from "./LanguagePickerPopover"
import { setLanguage } from "../slices/commonSlice"
import langIcon from "@nrs/assets/img/lang.png"
import { trackEvent } from "../util/analytics"

const ChatPanel = ({
  visible = [], // kept for API compatibility
  full = [],
  voiceStatus = "",
  isListening,
  isProcessing,
  isConversationOpen,
  isKeyboardShow,
  onToggleConversation,
  onPushToTalk,
  onSendText
}) => {
  const dispatch = useDispatch()
  const [text, setText] = useState("")
  const historyEndRef = useRef(null)
  const inputRef = useRef(null)
  const LANGUAGES = useMemo(
    () => [
      { code: "en-US", label: "English (US)" },
      { code: "zh-CN", label: "中文（普通话-中国）" },
      { code: "ms-MY", label: "Bahasa Melayu (MY)" },
      { code: "ta-IN", label: "தமிழ் (IN)" },
      { code: "ja-JP", label: "日本語" },
      { code: "ko-KR", label: "한국어" }
    ],
    []
  )
  const langBtnRef = useRef(null)
  const [langOpen, setLangOpen] = useState(false)
  const [lang, setLang] = useState("en-US")

  const handleChange = useCallback((e) => {
    setText(e.target.value)
  }, [])

  const handleSend = useCallback(
    (overrideMsg) => {
      trackEvent("keyboard_input_button_click", {
        screen_name: "chat",
        input_mode: "voice"
      })
      const msg = (overrideMsg ?? text).trim()
      if (!msg || isProcessing) return

      setText("")

      // let React commit/paint first, then start heavy async pipeline
      requestAnimationFrame(() => {
        onSendText?.(msg)
        // keep focus ready for next typing
        inputRef.current?.focus?.()
      })
    },
    [text, isProcessing, onSendText]
  )

  const handleKeyDown = useCallback(
    (e) => {
      if (e.key === "Enter") {
        e.preventDefault()
        handleSend()
      }
    },
    [handleSend]
  )

  const handleOnClickKeyboard = useCallback(() => {
    dispatch(
      toggleConversationOpen({
        isKeyboardShow: true,
        isConversationOpen: false
      })
    )
  }, [dispatch])

  // filter out system, show last 3.
  const renderedMessages = useMemo(() => {
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
      const rawContent = msg?.get("content")
      const displayText = isUser
        ? String(rawContent ?? "")
        : extractAssistantText(rawContent)
      return {
        key:
          msg?.get("id") ??
          `${msg?.get("role") ?? "msg"}-${idx}-${msg?.get("timestamp") ?? ""}`,
        className: isUser ? "chat-bubble user" : "chat-bubble assistant",
        content: censorBadWords(displayText)
      }
    })
  }, [full])

  // Auto-scroll only when panel is open
  useEffect(() => {
    if (!isConversationOpen) return
    historyEndRef?.current?.scrollIntoView({ behavior: "auto" })
  }, [renderedMessages.length, isConversationOpen])

  // useEffect(() => {
  //   if (isConversationOpen) setLangOpen(false)
  // }, [isConversationOpen])
  useEffect(() => {
    if (full?.size === 0) {
      setText("")
      requestAnimationFrame(() => inputRef.current?.focus?.())
    }
  }, [full?.size])

  return (
    <div id="conversation-container">
      <button
        id="btn-language"
        ref={langBtnRef}
        onClick={() => {
          trackEvent("language_selection_button_click", {
            screen_name: "chat",
            input_mode: "voice"
          })
          setLangOpen((v) => !v)
        }}
      >
        <img src={langIcon} height={110} width={110} alt="Language" />
      </button>

      <LanguagePickerPopover
        open={langOpen}
        anchorRef={langBtnRef}
        languages={LANGUAGES}
        value={lang}
        onChange={(code) => {
          setLang(code)
          dispatch(setLanguage({ language: code }))
        }}
        onClose={() => setLangOpen(false)}
      />
      <button
        id="btn-view-conversation"
        type="button"
        onClick={(e) => {
          e.preventDefault()
          const el = document.activeElement
          if (el && typeof el.blur === "function") el.blur()
          onToggleConversation?.()
        }}
      >
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
            ? voiceStatus == "Thinking..." || voiceStatus == "Listening..."
              ? "open processing"
              : "open"
            : "closed"
        }
      >
        <div id="voice-input-controls" className="voice-input-controls">
          <input
            ref={inputRef}
            id="voice-text-input"
            className="voice-text-input"
            type="text"
            placeholder="Type your message..."
            value={text}
            disabled={isProcessing}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            onClick={handleOnClickKeyboard}
            // readOnly
          />

          <button
            type="button"
            id="voice-send-btn"
            className="voice-send-btn"
            onClick={() => handleSend()}
            disabled={isProcessing}
            data-disabled={isProcessing ? "1" : "0"}
          >
            <i className="fas fa-paper-plane"></i>
          </button>

          <button
            type="button"
            id="voice-mic-btn"
            className={"voice-mic-btn " + (isListening ? "listening" : "")}
            onClick={onPushToTalk}
            aria-disabled={isProcessing}
            data-disabled={isProcessing ? "1" : "0"}
          >
            {isProcessing ? (
              <i className="fas fa-spinner fa-spin"></i>
            ) : isListening ? (
              <MicWave active />
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
      {isConversationOpen && isKeyboardShow ? (
        <OnScreenKeyboard
          value={text}
          onChange={(next) => {
            if (isProcessing) return
            setText(next)
            requestAnimationFrame(() => {
              const el = inputRef.current
              if (!el) return
              try {
                const len = next.length
                el.focus?.()
                el.setSelectionRange(len, len)
              } catch {}
            })
          }}
          onEnter={(msg) => {
            handleSend(msg)
          }}
        />
      ) : null}
    </div>
  )
}

export default memo(ChatPanel)
