import * as cocoSsd from "@tensorflow-models/coco-ssd"
import "@tensorflow/tfjs"
import "@tensorflow/tfjs-backend-webgl"

const DEFAULTS = {
  detectEveryMs: 2000,
  scoreThreshold: 0.5,
  cooldownMs: 750000,
  // For big kiosk / farther subjects..
  detectWidth: 416, // 416/512/640 depending on performance.. 512 is less ~36% pixel to be procesed, 416 around ~2.4x faster
  maxNumBoxes: 3,
  cameraWidth: 640,
  cameraHeight: 480,
  facingMode: "user",
  hideVideo: false,
}

export class CameraEngine {
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
    this._canvas = null
    this._ctx = null
  }

  async init({ videoEl }) {
    if (!videoEl) throw new Error("CameraEngine.init requires { videoEl }")
    this.videoEl = videoEl

    // Only hide if you explicitly want it hidden
    if (this.cfg.hideVideo) this.videoEl.style.display = "none"

    this._canvas = document.createElement("canvas")
    this._ctx = this._canvas.getContext("2d", {
      alpha: false,
      desynchronized: true,
    })

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
      if (this.cfg.hideVideo) this.videoEl.style.display = "none"
    }

    this.stream = null
    this.videoEl = null
    this.model = null
    this.isCameraReady = false
    this._canvas = null
    this._ctx = null
    this._emitState()
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
          height: { ideal: this.cfg.cameraHeight },
        },
        audio: false,
      })

      v.srcObject = this.stream
      v.autoplay = true
      v.muted = true
      v.playsInline = true

      await new Promise((r) => (v.onloadedmetadata = r))
      await v.play()

      if (!this.cfg.hideVideo) v.style.display = "block"

      this.isCameraReady = true
      this.cameraError = null
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

  _drawToSmallCanvas() {
    const v = this.videoEl
    const vw = v?.videoWidth || 0
    const vh = v?.videoHeight || 0
    if (!vw || !vh || !this._canvas || !this._ctx) return null

    const targetW = Math.max(160, this.cfg.detectWidth | 0)
    const scale = targetW / vw
    const dw = Math.max(1, Math.round(vw * scale))
    const dh = Math.max(1, Math.round(vh * scale))

    if (this._canvas.width !== dw) this._canvas.width = dw
    if (this._canvas.height !== dh) this._canvas.height = dh

    this._ctx.drawImage(v, 0, 0, dw, dh)
    return this._canvas
  }

  async _tick() {
    if (!this.model || !this.videoEl?.videoWidth) return
    if (this._busy) return

    this._busy = true
    try {
      const now = Date.now()

      // Early gating for less compute
      if (now - this.lastPersonDetectedTime < this.cfg.cooldownMs) return
      if (!this.canTrigger()) return

      const input = this._drawToSmallCanvas()
      if (!input) return

      const predictions = await this.model.detect(input, this.cfg.maxNumBoxes)

      let bestPerson = null
      for (const p of predictions) {
        if (p.class !== "person") continue
        if (!bestPerson || p.score > bestPerson.score) bestPerson = p
      }

      if (!bestPerson || bestPerson.score <= this.cfg.scoreThreshold) return

      this.lastPersonDetectedTime = now
      console.log(
        `Person detected! Confidence: ${(bestPerson.score * 100).toFixed(1)}%`
      )
      this.onPerson({ score: bestPerson.score, predictions })
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
