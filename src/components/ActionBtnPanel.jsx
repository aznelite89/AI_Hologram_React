import React from "react"
import { useDispatch, useSelector } from "react-redux"
import ChatPanel from "./ChatPanel"
import {
  resetConversation,
  toggleConversationOpen,
} from "../slices/speechSlice"
import { getSpeechEngine } from "../engine/engineRegistry"

const ActionBtnPanel = () => {
  const dispatch = useDispatch()
  const speech = useSelector((state) => state.speech)

  const isListening = speech.get("isListening")
  const isProcessing = speech.get("isProcessing")
  const voiceStatus = speech.get("voiceStatus")
  const isConversationOpen = speech.get("isConversationOpen")

  const visible = speech.get("conversationVisible")?.toJS?.() ?? []
  const full = speech.get("conversationFull")?.toJS?.() ?? []

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

  const onToggleConversation = () => {
    dispatch(toggleConversationOpen())
  }

  return (
    <div id="action-buttons-container">
      {/* Reset */}
      <div className="button-instruction">Tap to Reset Conversation</div>
      <button id="btn-refresh-conversation" onClick={onReset}>
        <i className="fas fa-rotate-right"></i>
      </button>

      {/* Main mic */}
      <div className="button-instruction">Tap Microphone to Talk</div>
      <button id="btn-main-microphone" onClick={onMic}>
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
        full={full}
        voiceStatus={voiceStatus}
        isListening={isListening}
        isProcessing={isProcessing}
        isConversationOpen={isConversationOpen}
        onToggleConversation={onToggleConversation}
        onPushToTalk={onMic}
      />
    </div>
  )
}

export default ActionBtnPanel
