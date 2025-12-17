import React, { useEffect } from "react"
import { startLegacyApp } from "./legacy/app.js"
import ActionBtnPanel from "./components/ActionBtnPanel.jsx"
import TopPanel from "./components/TopPanel/index.jsx"

export default function App() {
  useEffect(() => {
    let api
    ;(async () => {
      api = await startLegacyApp()
    })()

    return () => {
      try {
        api?.destroy?.()
      } catch (e) {
        console.warn("Legacy destroy failed:", e)
      }
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
