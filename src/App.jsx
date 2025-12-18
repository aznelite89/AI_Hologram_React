import React, { useEffect, useRef } from "react"
import { useDispatch } from "react-redux"
import ActionBtnPanel from "./components/ActionBtnPanel.jsx"
import TopPanel from "./components/TopPanel/index.jsx"

import { HologramEngine } from "./engine/HologramEngine.js"
import { SpeechEngine } from "./engine/SpeechEngine.js"
import { setSpeechState, setConversation } from "./slices/speechSlice"
import { setSpeechEngine } from "./engine/engineRegistry"
import { CameraEngine } from "./engine/CameraEngine"

export default function App() {
  const dispatch = useDispatch()
  const hologramRef = useRef(null)
  const speechRef = useRef(null)
  const cameraRef = useRef(null)

  useEffect(() => {
    const containerEl = document.getElementById("container")

    const hologram = new HologramEngine({
      backgroundUrl: "/SC_BG.glb",
      avatarUrl: "/Male_Waving_Final.glb",
      showStats: true,
    })
    hologramRef.current = hologram

    let cancelled = false

    ;(async () => {
      // initalise Hologram eng
      await hologram.init({ containerEl })
      hologram.start()
      // initalise Speech eng
      const speech = new SpeechEngine({
        hologram,
        onState: (s) => {
          if (cancelled) return
          dispatch(setSpeechState(s))
        },
        onConversation: (c) => {
          if (cancelled) return
          // { visible: [], full: [], sessionId }
          dispatch(setConversation(c))
        },
        onSession: ({ sessionId }) => {
          if (cancelled) return
          dispatch(setSpeechState({ sessionId }))
        },
        onError: (e) => console.error("SpeechEngine error:", e),
      })
      speechRef.current = speech
      setSpeechEngine(speech)
      await speech.init()
      // initalise Camera eng
      const videoEl = document.getElementById("webcam-feed")
      const camera = new CameraEngine({
        // block greeting if SpeechEngine is listening/processing
        canTrigger: () => {
          const s = speech.getState?.()
          return !(s?.isListening || s?.isProcessing)
        },
        // when person detected -> delegate to Speech Engine (separation)
        onPerson: async () => {
          await speech?.speakGreeting?.()
        },
        onError: (e) => console.error("CameraEngine error:", e),
      })
      cameraRef.current = camera
      await camera.init({ videoEl })
      camera.start()
    })()

    return () => {
      cancelled = true
      setSpeechEngine(null)
      try {
        speechRef.current?.destroy?.()
      } catch (e) {}
      try {
        hologramRef.current?.destroy?.()
      } catch (e) {}
      try {
        cameraRef.current?.destroy?.()
      } catch (e) {}
      speechRef.current = null
      hologramRef.current = null
      cameraRef.current = null
    }
  }, [dispatch])

  return (
    <>
      <TopPanel />
      <div id="container"></div>
      <ActionBtnPanel />
    </>
  )
}
