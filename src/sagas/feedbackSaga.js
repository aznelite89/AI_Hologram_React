import { takeLatest, call, put, select } from "redux-saga/effects"
import {
  selectFeedback,
  submitFeedbackStart,
  submitFeedbackSuccess,
  submitFeedbackFailure,
} from "../slices/feedbackSlice"

async function postFeedback(payload) {
  // TODO: Replace with real API / Firestore sooon..
  // await fetch("/api/feedback", { method: "POST", body: JSON.stringify(payload) })
  return true
}

function* handleSubmitFeedback(action) {
  try {
    const { rating, label, sessionId } = action.payload || {}

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
