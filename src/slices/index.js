import speechReducer from "@nrs/slices/speechSlice"
import cameraReducer from "@nrs/slices/cameraSlice"

const rootReducer = {
  speech: speechReducer,
  camera: cameraReducer,
  //TODO: append more reducers here
}
export default rootReducer
