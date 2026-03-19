import { FaceDetector, FilesetResolver } from "@mediapipe/tasks-vision"

const DEFAULTS = {
  detectEveryMs: 220,
  cooldownMs: 750000,
  presenceEveryMs: 1200,

  cameraWidth: 640,
  cameraHeight: 480,
  facingMode: "user",

  visionBasePath: "/models/mediapipe/wasm",
  faceDetectorModelPath: "/models/mediapipe/blaze_face_short_range.tflite",

  minDetectionConfidence: 0.65,
  minSuppressionThreshold: 0.3,

  presenceHistorySize: 6,
  minStablePresenceVotes: 3,

  signalChangeMinMs: 700,
  requireKnownCategoryForGreeting: false
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value))
}

function normalizeBaseUrl(url) {
  return (url || "").replace(/\/+$/, "")
}

export class CameraEngine {
  constructor(opts = {}) {
    this.onPerson = opts.onPerson ?? (() => {})
    this.onPresence = opts.onPresence ?? (() => {})
    this.onSignalChange = opts.onSignalChange ?? (() => {})
    this.onState = opts.onState ?? (() => {})
    this.onError = opts.onError ?? ((e) => console.error(e))
    this.canTrigger = opts.canTrigger ?? (() => true)

    this.cfg = { ...DEFAULTS, ...(opts.cfg || {}) }

    this.videoEl = null
    this.stream = null
    this.timer = null
    this.faceDetector = null

    this.isCameraReady = false
    this.isDetecting = false
    this.cameraError = null
    this.modelsLoaded = false

    this.lastPersonDetectedTime = 0
    this.lastPersonSeenAt = 0
    this._lastPresenceCheckAt = 0
    this._busy = false

    this._presenceHistory = []
    this._lastStableHasFace = false

    this._lastSignalKey = ""
    this._lastSignalAt = 0
  }

  async init({ videoEl }) {
    if (!videoEl) throw new Error("CameraEngine.init requires { videoEl }")

    this.videoEl = videoEl

    await this._startCamera()
    await this._loadModels()

    const now = Date.now()
    this.lastPersonSeenAt = now
    this._lastPresenceCheckAt = now
    this._emitState()
  }

  start() {
    if (!this.videoEl || !this.faceDetector) return
    if (this.timer) clearInterval(this.timer)

    this.isDetecting = true
    this._emitState()

    this.timer = setInterval(() => {
      this._tick().catch((e) => this.onError(e))
    }, this.cfg.detectEveryMs)
  }

  stop() {
    if (this.timer) {
      clearInterval(this.timer)
      this.timer = null
    }
    this.isDetecting = false
    this._emitState()
  }

  destroy() {
    this.stop()

    try {
      this.stream?.getTracks()?.forEach((t) => t.stop())
    } catch {}

    if (this.videoEl) {
      this.videoEl.srcObject = null
    }

    this.videoEl = null
    this.stream = null
    this.faceDetector = null

    this.isCameraReady = false
    this.modelsLoaded = false
    this.cameraError = null

    this._presenceHistory = []
    this._lastStableHasFace = false
    this._lastSignalKey = ""
    this._lastSignalAt = 0

    this._emitState()
  }

  stopStream() {
    try {
      this.stream?.getTracks()?.forEach((t) => t.stop())
    } catch {}

    this.stream = null
    if (this.videoEl) this.videoEl.srcObject = null

    this.isCameraReady = false
    this._emitState()
  }

  async startStream() {
    if (!this.videoEl) return
    if (this.stream) return
    await this._startCamera()
  }

  async _startCamera() {
    const v = this.videoEl

    if (!navigator.mediaDevices?.getUserMedia) {
      this.isCameraReady = false
      this._emitState()
      return
    }

    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: this.cfg.facingMode,
          width: { ideal: this.cfg.cameraWidth },
          height: { ideal: this.cfg.cameraHeight }
        },
        audio: false
      })

      v.srcObject = this.stream
      v.autoplay = true
      v.muted = true
      v.playsInline = true

      await new Promise((resolve) => {
        v.onloadedmetadata = resolve
      })

      await v.play()

      this.isCameraReady = true
      this.cameraError = null
    } catch (e) {
      this.isCameraReady = false
      this.cameraError = e
      this.onError(e)
    }

    this._emitState()
  }

  async _assertAsset(url) {
    const res = await fetch(url, { cache: "no-store" })
    if (!res.ok) {
      throw new Error(`Asset not found: ${url} (HTTP ${res.status})`)
    }
  }

  async _loadModels() {
    try {
      const vision = await FilesetResolver.forVisionTasks(
        "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision/wasm"
      )

      this.faceDetector = await FaceDetector.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath:
            "https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/latest/blaze_face_short_range.tflite"
        },
        runningMode: "VIDEO",
        minDetectionConfidence: this.cfg.minDetectionConfidence,
        minSuppressionThreshold: this.cfg.minSuppressionThreshold
      })

      this.modelsLoaded = true
      console.log("✅ MediaPipe Face Detector loaded (CDN)")
    } catch (e) {
      this.modelsLoaded = false
      this.cameraError = e

      this.onError(new Error(`MediaPipe CDN load failed: ${e.message}`))
    }

    this._emitState()
  }

  _pushPresenceVote(hasFace) {
    const size = Math.max(1, this.cfg.presenceHistorySize | 0)
    this._presenceHistory.push(hasFace ? 1 : 0)
    if (this._presenceHistory.length > size) {
      this._presenceHistory.shift()
    }
  }

  _getStablePresence(rawHasFace) {
    this._pushPresenceVote(rawHasFace)

    const yesVotes = this._presenceHistory.reduce((sum, n) => sum + n, 0)
    const noVotes = this._presenceHistory.length - yesVotes

    if (yesVotes >= this.cfg.minStablePresenceVotes) {
      this._lastStableHasFace = true
      return true
    }

    if (noVotes >= this.cfg.minStablePresenceVotes) {
      this._lastStableHasFace = false
      return false
    }

    return this._lastStableHasFace
  }

  _pickBestDetection(detections) {
    if (!Array.isArray(detections) || detections.length === 0) return null

    let best = null
    let bestScore = -1

    for (const detection of detections) {
      const score = detection?.categories?.[0]?.score ?? 0
      if (score > bestScore) {
        best = detection
        bestScore = score
      }
    }

    return best
  }

  _toFaceBox(detection) {
    const bb = detection?.boundingBox
    const vw = this.videoEl?.videoWidth || 0
    const vh = this.videoEl?.videoHeight || 0

    if (!bb || !vw || !vh) return null

    const x = clamp(bb.originX ?? 0, 0, vw)
    const y = clamp(bb.originY ?? 0, 0, vh)
    const w = clamp(bb.width ?? 0, 0, vw - x)
    const h = clamp(bb.height ?? 0, 0, vh - y)

    return { x, y, w, h }
  }

  _buildBadgePayload({ hasFace, score, faceBox, now, inCooldown }) {
    const stableHasFace = this._getStablePresence(hasFace)

    const category = "unknown"
    const categoryScore = 0

    return {
      hasPerson: stableHasFace,
      hasFace: stableHasFace,
      score: score ?? 0,
      faceScore: score ?? 0,
      faceBox: stableHasFace ? faceBox : null,

      category,
      categoryScore,
      estimatedAge: null,

      badgeTitle: stableHasFace ? "VISITOR" : "UNKNOWN",
      badgeTone: stableHasFace ? "visitor" : "unknown",
      metaText: stableHasFace ? "Face detected" : "No visitor",

      seenAt: now,
      inCooldown
    }
  }

  _emitSignalChange(payload) {
    const key = `${payload.hasFace}|${payload.badgeTitle}|${payload.badgeTone}|${payload.metaText}`
    const now = Date.now()

    if (key === this._lastSignalKey) return
    if (now - this._lastSignalAt < this.cfg.signalChangeMinMs) return

    this._lastSignalKey = key
    this._lastSignalAt = now

    try {
      this.onSignalChange({
        hasPerson: payload.hasPerson,
        hasFace: payload.hasFace,
        category: payload.category,
        categoryScore: payload.categoryScore,
        estimatedAge: payload.estimatedAge,
        badgeTitle: payload.badgeTitle,
        badgeTone: payload.badgeTone,
        metaText: payload.metaText,
        seenAt: payload.seenAt
      })
    } catch {}
  }

  async _tick() {
    if (!this.faceDetector || !this.videoEl?.videoWidth) return
    if (this._busy) return

    this._busy = true

    try {
      const now = Date.now()
      const inCooldown = now - this.lastPersonDetectedTime < this.cfg.cooldownMs

      if (inCooldown) {
        const pe = Math.max(500, this.cfg.presenceEveryMs | 0)
        if (now - this._lastPresenceCheckAt < pe) return
        this._lastPresenceCheckAt = now
      }

      const mpResult = this.faceDetector.detectForVideo(
        this.videoEl,
        performance.now()
      )

      const detections = mpResult?.detections || []
      const best = this._pickBestDetection(detections)

      if (!best) {
        const payload = this._buildBadgePayload({
          hasFace: false,
          score: 0,
          faceBox: null,
          now,
          inCooldown
        })

        try {
          this.onPresence(payload)
        } catch {}

        this._emitSignalChange(payload)
        return
      }

      const score = best?.categories?.[0]?.score ?? 0
      const faceBox = this._toFaceBox(best)

      this.lastPersonSeenAt = now

      const payload = this._buildBadgePayload({
        hasFace: true,
        score,
        faceBox,
        now,
        inCooldown
      })

      try {
        this.onPresence(payload)
      } catch {}

      this._emitSignalChange(payload)

      if (inCooldown) return
      if (!this.canTrigger()) return

      if (
        this.cfg.requireKnownCategoryForGreeting &&
        payload.category === "unknown"
      ) {
        return
      }

      this.lastPersonDetectedTime = now

      console.log(
        `[CameraEngine] face=${(score * 100).toFixed(1)}% badge=${payload.badgeTitle}`
      )

      this.onPerson(payload)
    } finally {
      this._busy = false
    }
  }

  _emitState() {
    this.onState({
      isCameraReady: this.isCameraReady,
      isDetecting: this.isDetecting,
      cameraError: this.cameraError,
      modelsLoaded: this.modelsLoaded,
      lastStableHasFace: this._lastStableHasFace
    })
  }
}
