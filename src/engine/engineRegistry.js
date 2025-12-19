let speechEngine = null
let cameraEngine = null
let hologramEngine = null

// -------- Speech --------
export const setSpeechEngine = (e) => {
  speechEngine = e
}
export const getSpeechEngine = () => speechEngine

// -------- Camera --------
export const setCameraEngine = (e) => {
  cameraEngine = e
}
export const getCameraEngine = () => cameraEngine

// -------- Hologram --------
export const setHologramEngine = (e) => {
  hologramEngine = e
}
export const getHologramEngine = () => hologramEngine
