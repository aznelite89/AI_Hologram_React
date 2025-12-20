import { createSlice } from "@reduxjs/toolkit"
import { fromJS } from "immutable"

const initialState = fromJS({
  phase: "rating", // "rating" | "thankyou"
  selectedRating: null, // 1..5
  selectedLabel: "",
  isSubmitting: false,
  submitError: null,
  lastSubmittedAt: null,
})

const feedbackSlice = createSlice({
  name: "feedback",
  initialState,
  reducers: {
    selectFeedback: (state, action) => {
      const { rating, label } = action.payload || {}
      if (!rating) return state

      return state.merge(
        fromJS({
          selectedRating: Number(rating),
          selectedLabel: label || "",
          phase: "thankyou",
          submitError: null,
        })
      )
    },
    submitFeedbackStart: (state) => {
      return state.merge(
        fromJS({
          isSubmitting: true,
          submitError: null,
        })
      )
    },
    submitFeedbackSuccess: (state) => {
      return state.merge(
        fromJS({
          isSubmitting: false,
          submitError: null,
          lastSubmittedAt: Date.now(),
        })
      )
    },
    submitFeedbackFailure: (state, action) => {
      return state.merge(
        fromJS({
          isSubmitting: false,
          submitError: action.payload || "Submit failed",
        })
      )
    },
    resetFeedback: () => initialState,
  },
})

export const {
  selectFeedback,
  submitFeedbackStart,
  submitFeedbackSuccess,
  submitFeedbackFailure,
  resetFeedback,
} = feedbackSlice.actions

export default feedbackSlice.reducer
