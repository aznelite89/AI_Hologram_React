import { all, fork } from "redux-saga/effects"
/**
 * please add your root saga here after you create new saga
 */
export default function* rootSaga() {
  try {
    yield all([
      // TODO: append more sagas here ...
    ])
  } catch (error) {
    console.debug("Error", error)
  }
}
