import createSagaMiddleware from "redux-saga"
import { configureStore } from "@reduxjs/toolkit"
import rootSaga from "@nrs/sagas"
import rootReducer from "@nrs/slices"

const sagaMiddleware = createSagaMiddleware()

const store = configureStore({
  reducer: rootReducer,
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware({
      thunk: false, // noit using thunk
      serializableCheck: false,
    }).concat(sagaMiddleware),
  devTools: process.env.NODE_ENV !== "production",
})

sagaMiddleware.run(rootSaga)

export default store
