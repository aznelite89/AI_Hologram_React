import { createSlice } from "@reduxjs/toolkit"
import { fromJS } from "immutable"

const initialState = fromJS({
  isListening: false,
  isProcessing: false,
  voiceStatus: "Idle",
  conversationVisible: [],
  conversationFull: [],
  sessionId: null,
  isConversationOpen: false,
})

const speechSlice = createSlice({
  name: "speech",
  initialState,
  reducers: {
    setSpeechState: (state, action) => {
      return state.merge(
        fromJS({
          ...action.payload,
        })
      )
    },
    setConversation: (state, action) => {
      return state.merge(
        fromJS({
          conversationVisible: action.payload.visible,
          conversationFull: action.payload.full,
          sessionId: action.payload.sessionId ?? null,
        })
      )
    },
    resetConversation: (state) => {
      return state.merge(
        fromJS({
          conversationVisible: [],
          conversationFull: [],
          sessionId: null,
        })
      )
    },
    toggleConversationOpen: (state) => {
      return state.update("isConversationOpen", (v) => !v)
    },
  },
})

export const {
  setSpeechState,
  setConversation,
  resetConversation,
  toggleConversationOpen,
} = speechSlice.actions

export default speechSlice.reducer
