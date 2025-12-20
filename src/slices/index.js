import speechReducer from "@nrs/slices/speechSlice"
import cameraReducer from "@nrs/slices/cameraSlice"
import feedbackReducer from "@nrs/slices/feedbackSlice"

const rootReducer = {
  speech: speechReducer,
  camera: cameraReducer,
  feedback: feedbackReducer,
  //TODO: append more reducers here
}
export default rootReducer
