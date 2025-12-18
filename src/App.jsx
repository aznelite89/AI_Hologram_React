import React, { useEffect, useRef } from "react"
import ActionBtnPanel from "./components/ActionBtnPanel.jsx"
import TopPanel from "./components/TopPanel/index.jsx"
import { HologramEngine } from "./engine/HologramEngine.js"
import { SpeechEngine } from "./engine/SpeechEngine.js"

export default function App() {
  const hologramRef = useRef(null)
  const speechRef = useRef(null)

  useEffect(() => {
    const containerEl = document.getElementById("container")

    const hologram = new HologramEngine({
      backgroundUrl: "/SC_BG.glb",
      avatarUrl: "/Male_Waving_Final.glb",
      showStats: true,
    })
    hologramRef.current = hologram
    ;(async () => {
      await hologram.init({ containerEl })
      hologram.start()

      const speech = new SpeechEngine({
        hologram,
        onState: (s) => console.log("[SpeechState]", s),
        onConversation: (c) => console.log("[Conversation]", c.visible),
        onSession: ({ sessionId }) => console.log("[Session]", sessionId),
      })
      speechRef.current = speech
      await speech.init()
    })()

    return () => {
      speechRef.current?.destroy()
      hologramRef.current?.destroy()
      speechRef.current = null
      hologramRef.current = null
    }
  }, [])

  return (
    <>
      <TopPanel />
      <div id="container"></div>
      <ActionBtnPanel />
    </>
  )
}
