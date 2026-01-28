import { createSlice } from "@reduxjs/toolkit"
import { fromJS } from "immutable"
import { Main } from "../constants/PageType"

const initialState = fromJS({
  pageType: Main,
  language: null
})

const commonSlice = createSlice({
  name: "common",
  initialState,
  reducers: {
    setPageType: (state, action) => {
      return state.merge(fromJS({ ...action.payload }))
    },
    setLanguage: (state, action) => {
      return state.merge(fromJS({ ...action.payload }))
    }
  }
})

export const { setPageType, setLanguage } = commonSlice.actions
export default commonSlice.reducer
