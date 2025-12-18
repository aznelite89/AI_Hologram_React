import { createSlice } from "@reduxjs/toolkit"
import { fromJS } from "immutable"

const initialState = fromJS({
  isProcessing: false,
  isListening: false,
  conversationHistory: [],
  lastInteractionTime: Date.now(),
})

const speechSlice = createSlice({
  name: "chat",
  initialState,
  reducers: {
    setIsProcessing: (state, action) => {
      return state.merge(
        fromJS({
          isProcessing: action.payload,
        })
      )
    },
    setIsListening: (state, action) => {
      return state.merge(
        fromJS({
          isListening: action.payload,
        })
      )
    },
    addConversationHistory: (state) => {
      return state
    },
    addConversationHistorySuccess: (state, action) => {
      return state.merge(
        fromJS({
          ...action.payload,
        })
      )
    },
    setConversationHistory: (state, action) => {
      return state.merge(
        fromJS({
          ...action.payload,
        })
      )
    },
    setLastInteractionTime: (state, action) => {
      return state.merge(
        fromJS({
          lastInteractionTime: action.payload,
        })
      )
    },
  },
})

export const {
  setIsProcessing,
  setIsListening,
  addConversationHistory,
  addConversationHistorySuccess,
  setConversationHistory,
  setLastInteractionTime,
} = speechSlice.actions

export default speechSlice.reducer
