import React, { useEffect, useRef } from "react"
import { useDispatch } from "react-redux"
import ActionBtnPanel from "./components/ActionBtnPanel.jsx"
import TopPanel from "./components/TopPanel/index.jsx"
import { HologramEngine } from "./engine/HologramEngine.js"
import { SpeechEngine } from "./engine/SpeechEngine.js"
import { setSpeechState, setConversation } from "./slices/speechSlice"
import {
  setCameraEngine,
  setHologramEngine,
  setSpeechEngine,
} from "./engine/engineRegistry"
import { CameraEngine } from "./engine/CameraEngine"
import KioskGuard from "./kiosk/KioskGuard.js"
import KioskWatchdog from "./kiosk/KioskWatchdog.js"
import { now, shallowEqualObj } from "./util/common.js"

export default function App() {
  const dispatch = useDispatch()

  const hologramRef = useRef(null)
  const speechRef = useRef(null)
  const cameraRef = useRef(null)

  // Throttle buffers (keep React out of hot path)
  const pendingSpeechStateRef = useRef(null)
  const lastSpeechStateRef = useRef(null)

  const pendingConversationRef = useRef(null)
  const lastConversationRef = useRef(null)

  const flushTimerRef = useRef(null)
  const lastFlushAtRef = useRef(0)

  useEffect(() => {
    let cancelled = false
    const containerEl = document.getElementById("container")
    if (!containerEl) return

    const hologram = new HologramEngine({
      backgroundUrl: "/SC_BG.glb",
      avatarUrl: "/Male_Waving_Final.glb",
      showStats: true,
    })
    hologramRef.current = hologram
    setHologramEngine(hologram)
    // -----------------------
    // Throttled Redux flushing
    // -----------------------
    const FLUSH_MS = 250 // 4fps UI updates (good enough for kiosk indicators + chat)
    const scheduleFlush = () => {
      if (flushTimerRef.current) return
      flushTimerRef.current = setTimeout(() => {
        flushTimerRef.current = null
        if (cancelled) return

        // flush speechState (small primitives only)
        const ps = pendingSpeechStateRef.current
        if (ps) {
          pendingSpeechStateRef.current = null
          const last = lastSpeechStateRef.current
          if (!shallowEqualObj(ps, last)) {
            lastSpeechStateRef.current = ps
            dispatch(setSpeechState(ps))
          }
        }

        // flush conversation (avoid dispatch storms)
        const pc = pendingConversationRef.current
        if (pc) {
          pendingConversationRef.current = null

          // If conversation object is recreated often, this still helps a lot:
          // only dispatch when reference changes AND basic shape differs.
          const lastC = lastConversationRef.current
          const changed =
            pc !== lastC &&
            (pc?.sessionId !== lastC?.sessionId ||
              pc?.full?.length !== lastC?.full?.length ||
              pc?.visible?.length !== lastC?.visible?.length)

          if (changed) {
            lastConversationRef.current = pc
            dispatch(setConversation(pc))
          }
        }

        lastFlushAtRef.current = now()
      }, FLUSH_MS)
    }

    ;(async () => {
      try {
        // 1) init hologram
        await hologram.init({ containerEl })
        if (cancelled) return
        hologram.start()

        // 2) init speech
        const speech = new SpeechEngine({
          hologram,

          // buffer + throttle; do NOT dispatch immediately
          onState: (s) => {
            if (cancelled) return
            // keep this SMALL. If SpeechEngine sends a big object, consider pruning it here.
            pendingSpeechStateRef.current = s
            scheduleFlush()
          },

          onConversation: (c) => {
            if (cancelled) return
            pendingConversationRef.current = c
            scheduleFlush()
          },

          onSession: ({ sessionId }) => {
            if (cancelled) return
            // merge into pending speech state, still throttled
            const prev =
              pendingSpeechStateRef.current || lastSpeechStateRef.current || {}
            pendingSpeechStateRef.current = { ...prev, sessionId }
            scheduleFlush()
          },

          onError: (e) => console.error("SpeechEngine error:", e),
        })

        speechRef.current = speech
        setSpeechEngine(speech)
        await speech.init()
        if (cancelled) return

        // 3) init camera
        const videoEl = document.getElementById("webcam-feed")
        const camera = new CameraEngine({
          canTrigger: () => {
            const s = speech.getState?.()
            return !(s?.isListening || s?.isProcessing)
          },
          onPerson: async () => {
            // avoid piling up greetings if detection fires repeatedly
            await speech?.speakGreeting?.()
          },
          onError: (e) => console.error("CameraEngine error:", e),
        })

        cameraRef.current = camera
        setCameraEngine(camera)
        await camera.init({ videoEl })
        if (cancelled) return
        camera.start()
      } catch (e) {
        console.error("❌ App engine init failed:", e)
      }
    })()

    return () => {
      cancelled = true
      setSpeechEngine(null)
      setCameraEngine(null)
      setHologramEngine(null)
      if (flushTimerRef.current) {
        clearTimeout(flushTimerRef.current)
        flushTimerRef.current = null
      }
      // Clear pending buffers
      pendingSpeechStateRef.current = null
      pendingConversationRef.current = null

      try {
        cameraRef.current?.destroy?.()
      } catch (e) {}
      try {
        speechRef.current?.destroy?.()
      } catch (e) {}
      try {
        hologramRef.current?.destroy?.()
      } catch (e) {}
      cameraRef.current = null
      speechRef.current = null
      hologramRef.current = null
    }
  }, [dispatch])

  useEffect(() => {
    const t = setInterval(() => window.__KIOSK_PING__?.(), 20000)
    return () => clearInterval(t)
  }, [])

  return (
    <>
      <KioskGuard enabled={false} />
      <KioskWatchdog enabled={true} />
      <TopPanel />
      <div id="container"></div>
      <ActionBtnPanel />
    </>
  )
}
