import { createSlice } from "@reduxjs/toolkit"
import { fromJS } from "immutable"

const initialState = fromJS({
  isCameraReady: false,
  isDetecting: false,
  cameraError: null,
})

const cameraSlice = createSlice({
  name: "camera",
  initialState,
  reducers: {
    setCameraState: (state, action) => {
      return state.merge(fromJS({ ...action.payload }))
    },
    resetCameraState: (state) => {
      return state.merge(
        fromJS({
          isCameraReady: false,
          isDetecting: false,
          cameraError: null,
        })
      )
    },
  },
})

export const { setCameraState, resetCameraState } = cameraSlice.actions
export default cameraSlice.reducer
