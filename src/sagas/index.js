import { all, fork } from "redux-saga/effects"
import feedbackSaga from "./feedbackSaga"
/**
 * please add your root saga here after you create new saga
 */
export default function* rootSaga() {
  try {
    yield all([
      fork(feedbackSaga),
      // TODO: append more sagas here ...
    ])
  } catch (error) {
    console.debug("Error", error)
  }
}
