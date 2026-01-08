import React, { useEffect, useRef } from "react"
import { useDispatch, useSelector } from "react-redux"
import ActionBtnPanel from "./components/ActionBtnPanel.jsx"
import TopPanel from "./components/TopPanel/index.jsx"
import { HologramEngine } from "./engine/HologramEngine.js"
import { SpeechEngine } from "./engine/SpeechEngine.js"
import {
  setSpeechState,
  setConversation,
  resetConversation,
} from "./slices/speechSlice"
import {
  setCameraEngine,
  setHologramEngine,
  setSpeechEngine,
} from "./engine/engineRegistry"
import { CameraEngine } from "./engine/CameraEngine"
import KioskGuard from "./kiosk/KioskGuard.js"
import KioskWatchdog from "./kiosk/KioskWatchdog.js"
import { ArrayEqual, now, shallowEqualObj } from "./util/common.js"
import { useInactivityReset } from "./hooks/useInactivityReset.js"
import EnginePageTypeController from "./engine/EnginePageTypeController.js"
import { Main, Map } from "./constants/PageType.js"
import MappedinMap from "./components/MappedinMap.jsx"
import { setPageType } from "./slices/commonSlice.js"
import { resetFeedback } from "./slices/feedbackSlice.js"

export default function App() {
  const dispatch = useDispatch()
  const [pageType] = useSelector((state) => {
    return [state.common.get("pageType")]
  }, ArrayEqual)

  const hologramRef = useRef(null)
  const speechRef = useRef(null)
  const cameraRef = useRef(null)
  // idle sleep state (no person 5min + no session)
  const idleSleepAppliedRef = useRef(false)

  // Throttle buffers (keep React out of hot path)
  const pendingSpeechStateRef = useRef(null)
  const lastSpeechStateRef = useRef(null)

  const pendingConversationRef = useRef(null)
  const lastConversationRef = useRef(null)

  const flushTimerRef = useRef(null)
  const lastFlushAtRef = useRef(0)

  const appStartedAtRef = useRef(Date.now())

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
            return !(s?.isListening || s?.isProcessing || s?.isSpeaking)
          },
          // wake instantly whenever a person is seen (even during cooldown)
          onPresence: () => {
            if (idleSleepAppliedRef.current) {
              idleSleepAppliedRef.current = false
              hologramRef.current?.setIdleSleep?.(false)
            }
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

  // idle sleep decision loop (uses camera.lastPersonSeenAt, not greeting cooldown)
  useEffect(() => {
    const CHECK_EVERY_MS = 5000
    const NO_PERSON_MS = 1 * 60 * 1000

    const t = setInterval(() => {
      const speech = speechRef.current
      const holo = hologramRef.current
      const cam = cameraRef.current
      if (!speech || !holo || !cam) return

      const s = speech.getState?.() || {}

      // no current session (you already reset session to null on inactivity)
      const noSession = !s.sessionId

      // don't idle-sleep while system is mid-turn / speaking
      const busy = !!(s.isListening || s.isProcessing || s.isSpeaking)

      const lastSeen = cam.lastPersonSeenAt || 0
      const sinceStart = Date.now() - appStartedAtRef.current
      const noPersonLongEnough = lastSeen
        ? Date.now() - lastSeen >= NO_PERSON_MS
        : sinceStart >= NO_PERSON_MS

      const shouldIdleSleep = noPersonLongEnough && noSession && !busy

      if (shouldIdleSleep !== idleSleepAppliedRef.current) {
        idleSleepAppliedRef.current = shouldIdleSleep
        holo.setIdleSleep?.(shouldIdleSleep)
      }
    }, CHECK_EVERY_MS)

    return () => clearInterval(t)
  }, [])

  useInactivityReset({
    enabled: true,
    timeoutMs: 60000,
    onTimeout: () => {
      speechRef.current?.stop?.()
      speechRef.current?.resetConversation?.()
      dispatch(resetConversation())
      dispatch(resetFeedback())
      if (pageType == Map) dispatch(setPageType({ pageType: Main }))
    },
    isBlocked: () => {
      const s = speechRef.current?.getState?.()
      return !!(s?.isListening || s?.isProcessing || s?.isSpeaking)
    },
  })

  return (
    <>
      <KioskGuard enabled={true} allowWheelInMap={pageType === Map} />
      <KioskWatchdog enabled={true} />
      <EnginePageTypeController />
      {pageType == Main ? <TopPanel /> : null}
      <div id="container"></div>
      {pageType == Map ? <MappedinMap /> : null}
      <ActionBtnPanel />
    </>
  )
}
