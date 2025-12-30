import { useEffect } from "react"
import { useSelector } from "react-redux"
import { ArrayEqual } from "../util/common"
import { Main, Map } from "../constants/PageType"
import {
  getCameraEngine,
  getHologramEngine,
  getSpeechEngine,
} from "../engine/engineRegistry"

const EnginePageTypeController = () => {
  const [pageType] = useSelector((state) => {
    return [state.common.get("pageType")]
  }, ArrayEqual)

  useEffect(() => {
    const speech = getSpeechEngine()
    const camera = getCameraEngine()
    const holo = getHologramEngine()

    if (pageType === Map) {
      speech?.stop?.() // abort LLM, stop STT, stop audio
      camera?.stop?.() // stop detection interval
      holo?.stop?.() // stop RAF render loop
      // stop camera stream
      camera?.stopStream?.()
      document.documentElement.classList.add("kiosk-map-mode")
    } else {
      document.documentElement.classList.remove("kiosk-map-mode")
      const videoEl = document.getElementById("webcam-feed")
      camera?.setVideoEl?.(videoEl)
      // Resume render
      holo?.start?.()
      // stopped camera stream, start it again
      camera?.startStream?.().then(() => camera?.start?.())
      // resume detection
      camera?.start?.()
    }
  }, [pageType])

  return null
}
export default EnginePageTypeController
