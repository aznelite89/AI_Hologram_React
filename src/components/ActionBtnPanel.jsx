import React from "react"
import { useDispatch, useSelector } from "react-redux"
import ChatPanel from "./ChatPanel"
import { resetConversation } from "../slices/speechSlice"
import { getSpeechEngine } from "../engine/engineRegistry"

const ActionBtnPanel = () => {
  const dispatch = useDispatch()
  const speech = useSelector((state) => state.speech) // must match your store key

  const isListening = speech.get("isListening")
  const isProcessing = speech.get("isProcessing")
  const voiceStatus = speech.get("voiceStatus")
  const sessionId = speech.get("sessionId")

  const visibleList = speech.get("conversationVisible")
  const visible = visibleList?.toJS?.() ?? []

  const onReset = () => {
    const engine = getSpeechEngine()
    engine?.stop?.()
    engine?.resetConversation?.()
    dispatch(resetConversation())
  }

  const onMic = () => {
    const engine = getSpeechEngine()
    engine?.toggleListening?.()
  }

  return (
    <div id="action-buttons-container">
      <div className="button-instruction">Tap to Reset Conversation</div>
      <button id="btn-refresh-conversation" type="button" onClick={onReset}>
        {/* svg unchanged */}
        <svg width="60" height="60" viewBox="0 0 24 24" fill="none">
          <path
            d="M17.65 6.35C16.2 4.9 14.21 4 12 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08c-0.82 2.33-3.04 4-5.65 4-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14 0.69 4.22 1.78L13 11h7V4l-2.35 2.35z"
            fill="currentColor"
          />
        </svg>
      </button>

      <div className="button-instruction">Tap Microphone to Talk</div>
      <button id="btn-main-microphone" type="button" onClick={onMic}>
        {isProcessing ? (
          <i className="fas fa-spinner fa-spin"></i>
        ) : isListening ? (
          <i className="fas fa-microphone-slash"></i>
        ) : (
          <i className="fas fa-microphone"></i>
        )}
      </button>

      <ChatPanel
        visible={visible}
        voiceStatus={voiceStatus}
        sessionId={sessionId}
        onViewConversation={() => console.log("View conversation")}
        onPushToTalk={onMic}
      />
    </div>
  )
}

export default ActionBtnPanel
