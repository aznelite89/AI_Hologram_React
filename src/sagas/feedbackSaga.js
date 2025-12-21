import { takeLatest, call, put, select } from "redux-saga/effects"
import {
  selectFeedback,
  submitFeedbackStart,
  submitFeedbackSuccess,
  submitFeedbackFailure,
} from "@nrs/slices/feedbackSlice"
import { addFeedback } from "@nrs/api/api"

async function postFeedback(payload) {
  try {
    const data = await addFeedback(payload)
    if (!data?.error) {
      console.log("added feedback successfully.")
    } else if (data?.error) {
      console.log("Failed to add session:", data.error)
    }
  } catch (e) {
    console.log("Error upon add session:", e)
  }
}

function* handleSubmitFeedback(action) {
  try {
    const { rating, sessionId } = action.payload || {}

    const payload = {
      sessionId,
      rating,
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
