import * as cocoSsd from "@tensorflow-models/coco-ssd"
import "@tensorflow/tfjs"
import "@tensorflow/tfjs-backend-webgl"

const DEFAULTS = {
  detectEveryMs: 2000,
  scoreThreshold: 0.5,
  cooldownMs: 750000, // previously was 50sec
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
    this.cameraError = null

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
    if (!this.videoEl || !this.model) return
    if (this.timer) clearInterval(this.timer)

    this.isDetecting = true
    this._emitState()

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
      this.stream?.getTracks()?.forEach((t) => t.stop())
    } catch {}

    if (this.videoEl) {
      this.videoEl.srcObject = null
      this.videoEl.style.display = "none"
    }

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
      this._emitState()
      return
    }

    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: 640, height: 480 },
        audio: false,
      })

      v.srcObject = this.stream
      v.autoplay = true
      v.muted = true
      v.playsInline = true

      await new Promise((r) => (v.onloadedmetadata = r))
      await v.play()

      v.style.display = "block"
      this.isCameraReady = true
    } catch (e) {
      v.style.display = "none"
      this.isCameraReady = false
      this.cameraError = e
      this.onError(e)
    }

    this._emitState()
  }

  async _loadModel() {
    try {
      this.model = await cocoSsd.load()
    } catch (e) {
      this.model = null
      this.cameraError = e
      this.onError(e)
    }
  }

  async _tick() {
    if (!this.model || !this.videoEl?.videoWidth) return
    if (this._busy) return

    this._busy = true

    try {
      const predictions = await this.model.detect(this.videoEl)

      const people = predictions.filter(
        (p) => p.class === "person" && p.score > this.cfg.scoreThreshold
      )

      if (!people.length) return

      const now = Date.now()
      if (now - this.lastPersonDetectedTime < this.cfg.cooldownMs) return
      if (!this.canTrigger()) return

      this.lastPersonDetectedTime = now
      this.onPerson({ score: people[0].score, predictions })
    } finally {
      this._busy = false
    }
  }

  _emitState() {
    this.onState({
      isCameraReady: this.isCameraReady,
      isDetecting: this.isDetecting,
      cameraError: this.cameraError,
    })
  }
}
