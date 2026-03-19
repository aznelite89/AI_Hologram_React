import React, { useEffect, useRef, useState } from "react"
import { useDispatch, useSelector } from "react-redux"
import ActionBtnPanel from "./components/ActionBtnPanel.jsx"
import TopPanel from "./components/TopPanel/index.jsx"
import { HologramEngine } from "./engine/HologramEngine.js"
import { SpeechEngine } from "./engine/SpeechEngine.js"
import {
  setSpeechState,
  setConversation,
  resetConversation
} from "./slices/speechSlice"
import {
  setCameraEngine,
  setHologramEngine,
  setSpeechEngine
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

  const [pageType, conversation, language] = useSelector((state) => {
    return [
      state.common.get("pageType"),
      state.speech.get("conversationFull"),
      state.common.get("language")
    ]
  }, ArrayEqual)

  const [cameraSignal, setCameraSignal] = useState({
    hasPerson: false,
    hasFace: false,
    category: "unknown",
    categoryScore: 0,
    estimatedAge: null,
    badgeTitle: "UNKNOWN",
    badgeTone: "unknown",
    metaText: "No visitor"
  })

  const hologramRef = useRef(null)
  const speechRef = useRef(null)
  const cameraRef = useRef(null)
  const videoElRef = useRef(null)

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
      onAvatarTap: () => {
        const speech = speechRef.current
        speech?.speakCoachLine?.(
          "Hey! Press the green microphone button to talk to me!"
        )
      }
    })

    hologramRef.current = hologram
    setHologramEngine(hologram)

    const FLUSH_MS = 250

    const scheduleFlush = () => {
      if (flushTimerRef.current) return

      flushTimerRef.current = setTimeout(() => {
        flushTimerRef.current = null
        if (cancelled) return

        const ps = pendingSpeechStateRef.current
        if (ps) {
          pendingSpeechStateRef.current = null
          const last = lastSpeechStateRef.current
          if (!shallowEqualObj(ps, last)) {
            lastSpeechStateRef.current = ps
            dispatch(setSpeechState(ps))
          }
        }

        const pc = pendingConversationRef.current
        if (pc) {
          pendingConversationRef.current = null
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
        await hologram.init({ containerEl })
        if (cancelled) return
        hologram.start()

        const speech = new SpeechEngine({
          hologram,
          cfg: { lang: language || "en-US" },
          onState: (s) => {
            if (cancelled) return
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
            const prev =
              pendingSpeechStateRef.current || lastSpeechStateRef.current || {}
            pendingSpeechStateRef.current = { ...prev, sessionId }
            scheduleFlush()
          },
          onError: (e) => console.error("SpeechEngine error:", e)
        })

        speechRef.current = speech
        setSpeechEngine(speech)

        await speech.init()
        if (cancelled) return

        const camera = new CameraEngine({
          cfg: {
            detectEveryMs: 220,
            presenceEveryMs: 1200,
            cooldownMs: 750000,

            cameraWidth: 640,
            cameraHeight: 480,
            facingMode: "user",

            minDetectionConfidence: 0.65,
            minSuppressionThreshold: 0.3,

            presenceHistorySize: 6,
            minStablePresenceVotes: 3,

            signalChangeMinMs: 700,
            requireKnownCategoryForGreeting: false
          },

          canTrigger: () => {
            const s = speech.getState?.()
            return !(s?.isListening || s?.isProcessing || s?.isSpeaking)
          },

          onSignalChange: (next) => {
            if (cancelled) return

            setCameraSignal((prev) => {
              const same =
                prev.hasPerson === next.hasPerson &&
                prev.hasFace === next.hasFace &&
                prev.badgeTitle === next.badgeTitle &&
                prev.badgeTone === next.badgeTone &&
                prev.metaText === next.metaText &&
                prev.category === next.category &&
                prev.estimatedAge === next.estimatedAge

              return same ? prev : next
            })
          },

          onPerson: async (payload) => {
            console.log("Greeting trigger:", payload.badgeTitle)
            await speech?.speakGreeting?.()
          },

          onState: (s) => {
            console.log("[CameraEngine state]", s)
          },

          onError: (e) => {
            console.error("CameraEngine error:", e)
          }
        })

        cameraRef.current = camera
        setCameraEngine(camera)

        await camera.init({ videoEl: videoElRef.current })
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

      pendingSpeechStateRef.current = null
      pendingConversationRef.current = null

      try {
        cameraRef.current?.destroy?.()
      } catch {}

      try {
        speechRef.current?.destroy?.()
      } catch {}

      try {
        hologramRef.current?.destroy?.()
      } catch {}

      cameraRef.current = null
      speechRef.current = null
      hologramRef.current = null
    }
  }, [dispatch])

  useEffect(() => {
    const speech = speechRef.current
    if (!speech) return
    speech.setLanguage?.(language || "en-US")
  }, [language])

  useEffect(() => {
    const t = setInterval(() => window.__KIOSK_PING__?.(), 20000)
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
    }
  })

  return (
    <>
      <KioskGuard enabled={false} allowWheelInMap={pageType === Map} />
      <KioskWatchdog enabled={true} />
      <EnginePageTypeController />

      {pageType == Main ? (
        <TopPanel cameraSignal={cameraSignal} videoRef={videoElRef} />
      ) : null}

      <div id="container"></div>
      {pageType == Map ? <MappedinMap /> : null}
      <ActionBtnPanel />
    </>
  )
}
