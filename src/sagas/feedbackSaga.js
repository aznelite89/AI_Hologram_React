import { takeLatest, call, put, select } from "redux-saga/effects"
import {
  selectFeedback,
  submitFeedbackStart,
  submitFeedbackSuccess,
  submitFeedbackFailure,
} from "../slices/feedbackSlice"

// example selector (same pattern as your app)
const selectSessionId = (state) => state.speech?.get("sessionId")

async function postFeedback(payload) {
  // Replace with real API / Firestore
  // await fetch("/api/feedback", { method: "POST", body: JSON.stringify(payload) })
  return true
}

function* handleSubmitFeedback(action) {
  try {
    console.log("select session id: ", selectSessionId)
    const { rating, label, sessionId: sidFromAction } = action.payload || {}
    const sessionId = sidFromAction || (yield select(selectSessionId))

    const payload = {
      sessionId,
      rating,
      label,
      source: "kiosk",
      ts: new Date().toISOString(),
    }

    yield put(submitFeedbackStart())
    yield call(postFeedback, payload)
    yield put(submitFeedbackSuccess())
  } catch (err) {
    yield put(submitFeedbackFailure(err?.message || String(err)))
  }
}

export default function* feedbackSaga() {
  yield takeLatest(selectFeedback.type, handleSubmitFeedback)
}
