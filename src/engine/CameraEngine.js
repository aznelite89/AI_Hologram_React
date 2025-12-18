import * as cocoSsd from "@tensorflow-models/coco-ssd"
import "@tensorflow/tfjs"
import "@tensorflow/tfjs-backend-webgl"

const DEFAULTS = {
  detectEveryMs: 2000,
  scoreThreshold: 0.5,
  cooldownMs: 750000, // previous was 500s
}

export class CameraEngine {
  /**
   * @param {object} opts
   * @param {(payload: {score: number, predictions: any[]}) => void} [opts.onPerson]
   * @param {(s: {isCameraReady:boolean,isDetecting:boolean}) => void} [opts.onState]
   * @param {(e:any)=>void} [opts.onError]
   * @param {() => boolean} [opts.canTrigger] - return false if speech is busy etc
   * @param {object} [opts.cfg]
   */
  constructor(opts = {}) {
    this.onPerson = opts.onPerson ?? (() => {})
    this.onState = opts.onState ?? (() => {})
    this.onError = opts.onError ?? ((e) => console.error(e))
    this.canTrigger = opts.canTrigger ?? (() => true)

    this.cfg = { ...DEFAULTS, ...(opts.cfg || {}) }

    this.videoEl = null
    this.stream = null
    this.model = null
    this.timer = null

    this.isCameraReady = false
    this.isDetecting = false

    this.lastPersonDetectedTime = 0
    this._busy = false
  }

  async init({ videoEl }) {
    if (!videoEl) throw new Error("CameraEngine.init requires { videoEl }")
    this.videoEl = videoEl

    this.videoEl.style.display = "none"

    await this._startCamera()
    await this._loadModel()

    this._emitState()
  }

  start() {
    if (!this.videoEl) return
    if (this.timer) clearInterval(this.timer)

    this.timer = setInterval(() => {
      this._tick().catch(this.onError)
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
      if (this.stream) {
        this.stream.getTracks().forEach((t) => t.stop())
      }
    } catch (e) {}
    this.stream = null
    this.videoEl = null
    this.model = null
    this.isCameraReady = false
    this._emitState()
  }

  // --------------------
  // Internals
  // --------------------
  async _startCamera() {
    const v = this.videoEl

    if (!navigator.mediaDevices?.getUserMedia) {
      this.isCameraReady = false
      if (v) v.style.display = "none"
      this._emitState()
      return
    }

    if (v) {
      v.style.display = "none"
      v.autoplay = true
      v.muted = true
      v.playsInline = true
    }

    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: "user",
          width: { ideal: 640 },
          height: { ideal: 480 },
        },
        audio: false,
      })

      v.srcObject = this.stream

      await new Promise((resolve) => {
        if (v.readyState >= 2) return resolve()
        v.onloadedmetadata = () => resolve()
      })

      await v.play()

      v.style.display = "block"

      this.isCameraReady = true
      this._emitState()
    } catch (e) {
      if (v) v.style.display = "none"

      this.isCameraReady = false
      this.stream = null

      this._emitState()
      this.onError?.(e)
    }
  }

  async _loadModel() {
    try {
      this.model = await cocoSsd.load()
    } catch (e) {
      this.model = null
      this.onError(e)
    }
  }

  async _tick() {
    if (!this.model || !this.videoEl) return
    if (!this.videoEl.videoWidth) return
    if (this._busy) return

    this._busy = true
    this.isDetecting = true
    this._emitState()

    try {
      const predictions = await this.model.detect(this.videoEl)

      const personDetections = predictions.filter(
        (p) => p.class === "person" && p.score > this.cfg.scoreThreshold
      )
      if (personDetections.length === 0) return

      const now = Date.now()
      const best = personDetections[0]

      // cooldown + external gating (speech busy etc)
      if (now - this.lastPersonDetectedTime < this.cfg.cooldownMs) return
      if (!this.canTrigger()) return

      this.lastPersonDetectedTime = now
      this.onPerson({ score: best.score, predictions })
    } finally {
      this._busy = false
      this.isDetecting = false
      this._emitState()
    }
  }

  _emitState() {
    this.onState({
      isCameraReady: this.isCameraReady,
      isDetecting: this.isDetecting,
    })
  }
}
