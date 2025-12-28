import speechReducer from "@nrs/slices/speechSlice"
import cameraReducer from "@nrs/slices/cameraSlice"
import feedbackReducer from "@nrs/slices/feedbackSlice"
import commonReducer from "@nrs/slices/commonSlice"

const rootReducer = {
  speech: speechReducer,
  camera: cameraReducer,
  feedback: feedbackReducer,
  common: commonReducer,
  //TODO: append more reducers here
}
export default rootReducer
