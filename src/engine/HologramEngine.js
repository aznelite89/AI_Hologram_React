import * as THREE from "three"
import Stats from "three/examples/jsm/libs/stats.module.js"
import { GLTFLoader } from "three/examples/jsm/Addons.js"
import { PERF } from "../config/performance"

// =======================
// Morph Target Manager
// =======================
class MorphTargetManager {
  constructor(model) {
    this.model = model
    this.blendshapeMeshes = []
    this.currentBlendshapes = {}
    this.targetBlendshapes = {}
    this.availableBlendshapes = new Set()

    this.active = new Set()
    //talking envelope for jawOpen (matches your plain JS open/close rhythm)
    this.isTalking = false
    this._talkPhase = 0
    this._talkSpeed = 12.0 // higher = faster open/close (roughly like 150ms toggle)
    this._jawMin = 0.25
    this._jawMax = 0.55

    this.findBlendshapeMeshes()
    this.initializeBlendshapes()
  }

  findBlendshapeMeshes() {
    this.model.traverse((object) => {
      if (
        object.isMesh &&
        object.morphTargetInfluences &&
        object.morphTargetInfluences.length > 0 &&
        object.morphTargetDictionary
      ) {
        if (object.material) {
          object.material.morphTargets = true
          if (object.material.isMaterial && object.material.name) {
            object.material = object.material.clone()
          }
        }

        const dictionary = object.morphTargetDictionary
        this.blendshapeMeshes.push({ mesh: object, dictionary })

        Object.keys(dictionary).forEach((name) =>
          this.availableBlendshapes.add(name)
        )
      }
    })

    if (this.blendshapeMeshes.length === 0) {
      console.warn("⚠️ No blendshape meshes found!")
    } else {
      console.log(
        `✅ Found ${this.blendshapeMeshes.length} meshes with blendshapes`
      )
    }
  }

  initializeBlendshapes() {
    this.availableBlendshapes.forEach((name) => {
      this.currentBlendshapes[name] = 0
      this.targetBlendshapes[name] = 0
    })
  }

  setBlendshape(blendshapeName, value) {
    if (!this.availableBlendshapes.has(blendshapeName)) return
    const clamped = Math.max(0, Math.min(1, value))
    this.targetBlendshapes[blendshapeName] = clamped
    this.active.add(blendshapeName)
  }

  // reset mouth/jaw targets (and mark active so active-set lerps down)
  _resetMouthJawTargets() {
    this.availableBlendshapes.forEach((name) => {
      const lower = name.toLowerCase()
      if (lower.includes("mouth") || lower.includes("jaw")) {
        this.targetBlendshapes[name] = 0
        this.active.add(name)
      }
    })
  }

  closeMouth() {
    this.isTalking = false
    this._resetMouthJawTargets()
    this.setBlendshape("mouthClose", 0.2)
    this.setBlendshape("mouthSmileLeft", 0.15)
    this.setBlendshape("mouthSmileRight", 0.15)
  }

  // configure jaw envelope per viseme
  _setTalkJawRange(min, max) {
    this._jawMin = min
    this._jawMax = max
  }

  setVisemeInfluence(visemeName, influence = 1) {
    const v = String(visemeName || "").toLowerCase()

    // reset lip shapes each viseme, but DO NOT “hard set” jawOpen here anymore.
    // Jaw is now driven by the talking envelope in update() for open/close rhythm.
    this._resetMouthJawTargets()

    if (v.includes("sil") || v === "viseme_sil") {
      this.isTalking = false
      this._setTalkJawRange(0.0, 0.0)
      this.setBlendshape("mouthClose", 0.2)
      this.setBlendshape("mouthSmileLeft", 0.15)
      this.setBlendshape("mouthSmileRight", 0.15)
      return
    }

    // default talking envelope (this is the “plain JS” feel)
    this.isTalking = true
    this._setTalkJawRange(0.3, 0.6)

    // Now only set *lip shaping* per viseme:..
    if (v.includes("pp") || v === "viseme_pp") {
      // lips pressed (smaller jaw range)
      this._setTalkJawRange(0.1, 0.25)
      this.setBlendshape("mouthClose", 1.0)
      this.setBlendshape("mouthPucker", 0.2)
    } else if (v.includes("ff") || v === "viseme_ff") {
      this.setBlendshape("mouthFunnel", 0.3)
      this.setBlendshape("mouthRollLower", 0.2)
    } else if (v.includes("th") || v === "viseme_th") {
      this.setBlendshape("mouthStretchLeft", 0.25)
      this.setBlendshape("mouthStretchRight", 0.25)
    } else if (v.includes("dd") || v === "viseme_dd") {
      this.setBlendshape("mouthSmileLeft", 0.1)
      this.setBlendshape("mouthSmileRight", 0.1)
    } else if (v.includes("kk") || v === "viseme_kk") {
      this._setTalkJawRange(0.35, 0.65)
    } else if (v.includes("ch") || v === "viseme_ch") {
      this.setBlendshape("mouthFunnel", 0.3)
      this.setBlendshape("mouthPucker", 0.2)
    } else if (v.includes("ss") || v === "viseme_ss") {
      this._setTalkJawRange(0.15, 0.35)
      this.setBlendshape("mouthSmileLeft", 0.4)
      this.setBlendshape("mouthSmileRight", 0.4)
      this.setBlendshape("mouthStretchLeft", 0.2)
      this.setBlendshape("mouthStretchRight", 0.2)
    } else if (v.includes("nn") || v === "viseme_nn") {
      this._setTalkJawRange(0.25, 0.5)
    } else if (v.includes("rr") || v === "viseme_rr") {
      this.setBlendshape("mouthFunnel", 0.2)
    } else if (v.includes("aa") || v === "viseme_aa") {
      // allow bigger opens, but still rhythmic
      this._setTalkJawRange(0.35, 0.75)
      this.setBlendshape("mouthLowerDownLeft", 0.2)
      this.setBlendshape("mouthLowerDownRight", 0.2)
    } else if (
      v === "viseme_e" ||
      (v.includes("viseme_") && v.endsWith("_e")) ||
      v === "e"
    ) {
      this._setTalkJawRange(0.25, 0.55)
      this.setBlendshape("mouthSmileLeft", 0.35)
      this.setBlendshape("mouthSmileRight", 0.35)
    } else if (v.includes("viseme_i") || v.endsWith("_i")) {
      this._setTalkJawRange(0.15, 0.35)
      this.setBlendshape("mouthSmileLeft", 0.7)
      this.setBlendshape("mouthSmileRight", 0.7)
      this.setBlendshape("mouthStretchLeft", 0.3)
      this.setBlendshape("mouthStretchRight", 0.3)
    } else if (v.includes("viseme_o") || v.endsWith("_o")) {
      this._setTalkJawRange(0.25, 0.6)
      this.setBlendshape("mouthFunnel", 0.5)
      this.setBlendshape("mouthPucker", 0.3)
    } else if (v.includes("viseme_u") || v.endsWith("_u")) {
      this._setTalkJawRange(0.2, 0.5)
      this.setBlendshape("mouthPucker", 0.75)
      this.setBlendshape("mouthFunnel", 0.5)
    } else {
      // generic talk
      this.setBlendshape("mouthSmileLeft", 0.2)
      this.setBlendshape("mouthSmileRight", 0.2)
      // influence can gently scale jaw range
      const s = Math.max(0.7, Math.min(1.0, influence))
      this._setTalkJawRange(0.25 * s, 0.6 * s)
    }
  }

  update(delta) {
    // jaw open/close envelope while talking
    if (this.isTalking && this.availableBlendshapes.has("jawOpen")) {
      this._talkPhase += delta * this._talkSpeed
      // 0..1
      const env = (Math.sin(this._talkPhase) + 1) * 0.5
      const jaw = this._jawMin + (this._jawMax - this._jawMin) * env
      this.setBlendshape("jawOpen", jaw)
    }
    // -------------------------------------------------------------

    const lerpFactor = 10 * delta
    const EPS = 0.001

    const activeNow = Array.from(this.active)
    if (activeNow.length === 0) return

    for (const blendshapeName of activeNow) {
      const cur = this.currentBlendshapes[blendshapeName] ?? 0
      const tgt = this.targetBlendshapes[blendshapeName] ?? 0

      const next = this.lerp(cur, tgt, lerpFactor)
      this.currentBlendshapes[blendshapeName] = next

      for (const { mesh, dictionary } of this.blendshapeMeshes) {
        const index = dictionary[blendshapeName]
        if (index !== undefined) mesh.morphTargetInfluences[index] = next
      }

      if (Math.abs(next - tgt) < EPS) {
        this.currentBlendshapes[blendshapeName] = tgt
        this.active.delete(blendshapeName)
      }
    }
  }

  lerp(a, b, t) {
    return a + (b - a) * Math.min(t, 1)
  }
}

// =======================
// Gaze Manager
// =======================
class RPMGazeManager {
  constructor(model, camera, morphManager) {
    this.model = model
    this.camera = camera
    this.morphManager = morphManager

    this.neck = null
    this.head = null
    this.leftEye = null
    this.rightEye = null

    this.eyeBlinkTimer = 0
    this.nextBlinkTime = 3

    this.findBones()
  }

  findBones() {
    this.model.traverse((object) => {
      if (object.isBone) {
        if (object.name === "Neck") this.neck = object
        if (object.name === "Head") this.head = object
        if (object.name === "LeftEye") this.leftEye = object
        if (object.name === "RightEye") this.rightEye = object
      }
    })
  }

  update(delta) {
    if (this.head && this.leftEye && this.rightEye) {
      const targetPos = this.camera.position.clone()

      if (this.neck) {
        const lookAtMatrix = new THREE.Matrix4()
        lookAtMatrix.lookAt(
          targetPos,
          this.head.getWorldPosition(new THREE.Vector3()),
          new THREE.Vector3(0, 1, 0)
        )
        const targetQuaternion = new THREE.Quaternion().setFromRotationMatrix(
          lookAtMatrix
        )

        this.neck.quaternion.slerp(targetQuaternion, 4.0 * delta)
        this.neck.rotation.x = THREE.MathUtils.clamp(
          this.neck.rotation.x,
          -0.4,
          0.4
        )
        this.neck.rotation.y = THREE.MathUtils.clamp(
          this.neck.rotation.y,
          -0.8,
          0.8
        )
        this.neck.rotation.z = 0
      }

      this.leftEye.lookAt(targetPos)
      this.rightEye.lookAt(targetPos)
    }

    this.handleBlink(delta)
  }

  handleBlink(delta) {
    if (!this.morphManager) return
    this.eyeBlinkTimer += delta
    if (this.eyeBlinkTimer >= this.nextBlinkTime) {
      this.eyeBlinkTimer = 0
      this.nextBlinkTime = 2 + Math.random() * 4
      this.performBlink()
    }
  }

  performBlink() {
    this.morphManager.setBlendshape("eyeBlinkLeft", 1)
    this.morphManager.setBlendshape("eyeBlinkRight", 1)
    setTimeout(() => {
      this.morphManager.setBlendshape("eyeBlinkLeft", 0)
      this.morphManager.setBlendshape("eyeBlinkRight", 0)
    }, 150)
  }
}

// =======================
// Hologram Engine
// =======================
export class HologramEngine {
  constructor({
    backgroundUrl = "/SC_BG.glb",
    avatarUrl = "/Male_Waving_Final.glb",
    talkingAvatarUrl = "/male_talking.glb", // animation-only source
    sleepAvatarUrl = "/male_sleeping.glb",
    showStats = true,
    onAvatarTap = null,
  } = {}) {
    this.backgroundUrl = backgroundUrl
    this.avatarUrl = avatarUrl
    this.talkingAvatarUrl = talkingAvatarUrl
    this.sleepAvatarUrl = sleepAvatarUrl
    this.showStats = showStats

    this.containerEl = null
    this.renderer = null
    this.scene = null
    this.camera = null
    this.clock = null
    this.mixer = null
    this.animationGroup = null

    this.stats = null
    this.model = null
    this.morph = null
    this.gaze = null

    // sleeping model, actions
    this.sleepModel = null
    this._awakeAction = null
    this._talkAction = null // ADDED
    this._sleepAction = null
    this._isSleeping = false
    this._quietCheckAcc = 0

    // multi-reason sleep flags (quiet-hours OR idle)
    this._sleepQuiet = false
    this._sleepIdle = false

    // talk state + fade
    this._isTalkingAnim = false
    this._fadeSeconds = 0.18
    // tap listen for speak
    this.onAvatarTap = typeof onAvatarTap === "function" ? onAvatarTap : null
    this._raycaster = new THREE.Raycaster()
    this._pointerNdc = new THREE.Vector2()
    this._tapTargets = []
    this._tapCooldownUntil = 0
    this._onPointerDown = this._onPointerDown.bind(this)

    this._raf = 0
    this._onResize = this._onResize.bind(this)
  }

  async init({ containerEl }) {
    if (!containerEl)
      throw new Error("HologramEngine.init requires containerEl")
    this.containerEl = containerEl

    // Clear container (prevents duplicate canvases during HMR)
    this.containerEl.innerHTML = ""

    this.renderer = new THREE.WebGLRenderer({
      antialias: false,
      alpha: false,
      powerPreference: "high-performance",
      precision: "lowp",
      stencil: false,
      logarithmicDepthBuffer: false,
    })
    console.log("LOW POWER DEVICE: ", PERF.LOW_POWER)
    console.log("PERF: ", PERF)
    this.renderer.setPixelRatio(PERF.PIXEL_RATIO)
    this.renderer.setSize(window.innerWidth, window.innerHeight)
    this.renderer.shadowMap.enabled = true
    this.renderer.shadowMap.type = THREE.BasicShadowMap

    this.containerEl.appendChild(this.renderer.domElement)

    this.renderer.domElement.addEventListener(
      "pointerdown",
      this._onPointerDown,
      { passive: true }
    )

    this.camera = new THREE.PerspectiveCamera(
      39,
      window.innerWidth / window.innerHeight,
      0.1,
      10
    )
    this.camera.position.set(0, 1.6, 2.3)
    this.camera.lookAt(0, 0.8, 0)

    this.clock = new THREE.Clock()
    this.animationGroup = new THREE.AnimationObjectGroup()
    this.mixer = new THREE.AnimationMixer(this.animationGroup)

    this.scene = new THREE.Scene()
    this.scene.background = new THREE.Color(0xffffff)

    // Lights
    const hemiLight = new THREE.HemisphereLight(0xffffff, 0x444444, 0.6)
    hemiLight.position.set(0, 20, 0)
    this.scene.add(hemiLight)

    const dirLight = new THREE.DirectionalLight(0xffffff)
    dirLight.position.set(0, 2, 5)
    dirLight.castShadow = true
    dirLight.shadow.camera.top = 1.2
    dirLight.shadow.camera.bottom = -0.3
    dirLight.shadow.camera.left = -0.8
    dirLight.shadow.camera.right = 0.8
    dirLight.shadow.camera.near = 0.5
    dirLight.shadow.camera.far = 20
    dirLight.shadow.bias = -0.003
    dirLight.intensity = 2.5
    this.scene.add(dirLight)

    // Ground
    const groundGeometry = new THREE.PlaneGeometry(100, 100)
    const groundMaterial = new THREE.MeshStandardMaterial({
      color: 0x808080,
      roughness: 0.8,
      metalness: 0.2,
      transparent: true,
      opacity: 0.5,
    })
    const groundMesh = new THREE.Mesh(groundGeometry, groundMaterial)
    groundMesh.rotation.x = -Math.PI / 2
    groundMesh.receiveShadow = true
    this.scene.add(groundMesh)

    await this._loadBackground(this.backgroundUrl)
    await this._loadAvatar(this.avatarUrl)

    // load talking GLB animation only.. (do not add its scene)
    await this._loadTalkingAnimation(this.talkingAvatarUrl)

    await this._loadSleepAvatar(this.sleepAvatarUrl)
    this._freezeMaterials()

    if (this.showStats) {
      this.stats = new Stats()
      this.containerEl.appendChild(this.stats.dom)
    }

    window.addEventListener("resize", this._onResize)
    this._onResize()
  }

  start() {
    if (this._raf) return
    this._tick()
  }

  stop() {
    if (this._raf) cancelAnimationFrame(this._raf)
    this._raf = 0
  }

  destroy() {
    this.stop()
    window.removeEventListener("resize", this._onResize)

    try {
      this.renderer?.domElement?.removeEventListener(
        "pointerdown",
        this._onPointerDown
      )
    } catch {}

    if (this.renderer) {
      this.renderer.dispose()
      const canvas = this.renderer.domElement
      canvas?.parentNode?.removeChild(canvas)
    }

    if (this.stats?.dom) this.stats.dom.remove()

    this.renderer = null
    this.scene = null
    this.camera = null
    this.clock = null
    this.mixer = null
    this.animationGroup = null

    this.model = null
    this.sleepModel = null

    this.morph = null
    this.gaze = null
    this.stats = null

    this._awakeAction = null
    this._talkAction = null
    this._sleepAction = null
    this._isTalkingAnim = false
    this._isSleeping = false
    this._quietCheckAcc = 0
    // reset sleep reason flags
    this._sleepQuiet = false
    this._sleepIdle = false
  }

  setViseme(visemeName, influence = 1) {
    // ignore visemes while sleeping
    if (this._isSleeping) return
    this.morph?.setVisemeInfluence(visemeName, influence)
  }

  closeMouth() {
    // ignore closeMouth while sleeping
    if (this._isSleeping) return
    this.morph?.closeMouth()
  }

  // ===================
  //talking animation controls (same avatar, different clip)
  // ===================
  startTalkingAnimation() {
    if (this._isSleeping) return
    if (!this._talkAction || !this._awakeAction) return
    if (this._isTalkingAnim) return
    this._isTalkingAnim = true

    try {
      //ensure awake is running (crossFade needs both alive)
      this._awakeAction.enabled = true
      this._awakeAction.setEffectiveWeight(1)
      this._awakeAction.setLoop(THREE.LoopRepeat, Infinity)
      if (!this._awakeAction.isRunning()) this._awakeAction.play()

      // start talk
      this._talkAction.enabled = true
      this._talkAction.setEffectiveTimeScale(1)
      this._talkAction.setEffectiveWeight(1)
      this._talkAction.setLoop(THREE.LoopRepeat, Infinity)
      this._talkAction.reset()
      this._talkAction.play()

      // fade
      this._awakeAction.crossFadeTo(this._talkAction, this._fadeSeconds, false)
    } catch (e) {
      // ignore
    }
  }

  stopTalkingAnimation() {
    if (!this._isTalkingAnim) return
    this._isTalkingAnim = false
    if (!this._talkAction || !this._awakeAction) return

    try {
      // guarantee awake will take over again
      this._awakeAction.enabled = true
      this._awakeAction.setLoop(THREE.LoopRepeat, Infinity)
      this._awakeAction.reset()
      this._awakeAction.play()

      //fade talk -> awake
      this._talkAction.crossFadeTo(this._awakeAction, this._fadeSeconds, false)
      // stop talk after fade
      setTimeout(() => {
        try {
          this._talkAction?.stop()
        } catch (e) {}
      }, Math.ceil(this._fadeSeconds * 1000) + 80)
    } catch (e) {
      // ignore
    }
  }

  // ===================
  // Public idle sleep control (used by CameraEngine + session state)
  // ===================
  setIdleSleep(shouldSleep) {
    const next = !!shouldSleep
    if (this._sleepIdle === next) return
    this._sleepIdle = next
    this._applySleepMode()
  }

  // ===================
  // Internal methods
  // ===================
  _tick() {
    this._raf = requestAnimationFrame(() => this._tick())

    const delta = this.clock.getDelta()

    // throttle quiet-hours check (once per ~10s)
    this._quietCheckAcc += delta
    if (this._quietCheckAcc >= 10.0) {
      this._quietCheckAcc = 0

      // quiet-hours is one sleep reason; final sleep is OR of reasons
      this._sleepQuiet = this._isQuietHoursGMT8(new Date())
      this._applySleepMode()
    }

    this.mixer?.update(delta)

    // freeze morph/gaze while sleeping
    if (!this._isSleeping) {
      this.morph?.update(delta)
      this.gaze?.update(delta)
    }

    this.stats?.update()
    this.renderer.render(this.scene, this.camera)
  }

  _onResize() {
    if (!this.camera || !this.renderer) return

    this.camera.aspect = window.innerWidth / window.innerHeight
    this.camera.updateProjectionMatrix()

    this.renderer.setSize(window.innerWidth, window.innerHeight)

    // keep your behavior:
    this.camera.position.set(0, 1.2, 3)
    this.camera.lookAt(0, 1, 0)
  }

  async _loadBackground(modelPath) {
    const loader = new GLTFLoader()
    return new Promise((resolve, reject) => {
      loader.load(
        modelPath,
        (gltf) => {
          const background = gltf.scene

          background.traverse((child) => {
            if (child.isMesh) {
              child.castShadow = false
              child.receiveShadow = true
              if (child.material) {
                child.material.flatShading = true
                child.material.needsUpdate = true
              }
            }
          })

          background.position.set(0, 0, -2)
          background.rotation.y = Math.PI

          this.scene.add(background)
          console.log("Background loaded successfully")
          resolve(background)
        },
        undefined,
        (error) => reject(error)
      )
    })
  }

  async _loadAvatar(url) {
    const loader = new GLTFLoader()
    const gltf = await loader.loadAsync(url)
    this.model = gltf.scene

    this.model.traverse((object) => {
      if (object.isMesh) {
        // preserve your existing behavior, but gate by PERF.SHADOWS
        const canShadow = !!PERF.SHADOWS && window.innerWidth < 1920
        object.castShadow = canShadow
        object.receiveShadow = canShadow

        if (object.material) {
          object.material.envMapIntensity = 0.3
          const newMaterial = object.material.clone()
          newMaterial.morphTargets = true

          if (object.material.map) {
            object.material.map.generateMipmaps = true
            object.material.map.minFilter = THREE.LinearMipmapLinearFilter
            object.material.map.anisotropy =
              this.renderer.capabilities.getMaxAnisotropy()
          }

          object.material = newMaterial
        }
      }
    })

    this.scene.add(this.model)
    this.animationGroup.add(this.model)
    this._tapTargets = [this.model]

    this.morph = new MorphTargetManager(this.model)
    this.gaze = new RPMGazeManager(this.model, this.camera, this.morph)

    // Play embedded animation if present
    if (gltf.animations && gltf.animations.length > 0) {
      console.log(`Found ${gltf.animations.length} animations inside ${url}`)
      const clip = gltf.animations[0]
      this._awakeAction = this.mixer.clipAction(clip, this.model)
      this._awakeAction.enabled = true
      this._awakeAction.clampWhenFinished = false
      this._awakeAction.setLoop(THREE.LoopRepeat, Infinity)
      this._awakeAction.reset()
      this._awakeAction.play()
    } else {
      console.warn(`No embedded animations found in ${url}`)
    }
    return this.model
  }

  // load talking animation clip from separate GLB and apply to same avatar model
  async _loadTalkingAnimation(url) {
    if (!url) return
    const loader = new GLTFLoader()
    const gltf = await loader.loadAsync(url)

    if (gltf.animations && gltf.animations.length > 0) {
      console.log(`✅ Found ${gltf.animations.length} animations inside ${url}`)
      const clip = gltf.animations[0]

      if (this.model) {
        this._talkAction = this.mixer.clipAction(clip, this.model)

        //prep talk action but do not auto-play
        this._talkAction.enabled = true
        this._talkAction.clampWhenFinished = false
        this._talkAction.setLoop(THREE.LoopRepeat, Infinity)
        this._talkAction.stop()
      }
    } else {
      console.warn(`⚠️ No embedded animations found in ${url}`)
    }
  }

  async _loadSleepAvatar(url) {
    const loader = new GLTFLoader()
    const gltf = await loader.loadAsync(url)

    this.sleepModel = gltf.scene
    this.sleepModel.visible = false // hidden by default

    this.sleepModel.traverse((object) => {
      if (object.isMesh) {
        const canShadow = !!PERF.SHADOWS && window.innerWidth < 1920
        object.castShadow = canShadow
        object.receiveShadow = canShadow

        if (object.material) {
          object.material.envMapIntensity = 0.3
          const newMaterial = object.material.clone()
          newMaterial.morphTargets = true
          object.material = newMaterial
        }
      }
    })

    this.scene.add(this.sleepModel)
    this.animationGroup.add(this.sleepModel)

    if (gltf.animations && gltf.animations.length > 0) {
      console.log(`Found ${gltf.animations.length} animations inside ${url}`)
      const clip = gltf.animations[0]
      this._sleepAction = this.mixer.clipAction(clip, this.sleepModel)
      this._sleepAction.stop() // do not auto play
    } else {
      console.warn(`No embedded animations found in ${url}`)
    }

    // apply initial mode immediately (in case app starts at night)
    this._sleepQuiet = this._isQuietHoursGMT8(new Date())
    this._applySleepMode()

    return this.sleepModel
  }

  // -------- Quiet hours (GMT+8) --------
  _getNowGMT8(date = new Date()) {
    // Convert local time -> UTC -> GMT+8
    const utcMs = date.getTime() + date.getTimezoneOffset() * 60_000
    return new Date(utcMs + 8 * 60 * 60_000)
  }

  _isQuietHoursGMT8(date = new Date()) {
    const d = this._getNowGMT8(date)
    const h = d.getHours()
    return h >= 19 || h < 7 // quite hour setup here..
  }

  _applySleepMode() {
    const shouldSleep = !!(this._sleepQuiet || this._sleepIdle)
    if (this._isSleeping === shouldSleep) return
    this._isSleeping = shouldSleep

    if (this.model) this.model.visible = !shouldSleep
    if (this.sleepModel) this.sleepModel.visible = shouldSleep

    if (shouldSleep) {
      // stop talking + gaze updates
      this.morph?.closeMouth()
      if (this.morph) this.morph.isTalking = false

      // ensure talk animation stops
      this._isTalkingAnim = false
      if (this._talkAction) this._talkAction.stop()

      if (this._awakeAction) this._awakeAction.stop()
      if (this._sleepAction) {
        this._sleepAction.reset()
        this._sleepAction.play()
      }
    } else {
      if (this._sleepAction) this._sleepAction.stop()
      if (this._awakeAction) {
        this._awakeAction.reset()
        this._awakeAction.play()
      }
    }
  }

  _freezeMaterials() {
    if (!this.scene) return
    this.scene.traverse((object) => {
      if (object.material) {
        object.material.needsUpdate = false
        object.matrixAutoUpdate = false
        object.updateMatrix()
      }
    })
  }
  // tap detection..
  _onPointerDown(e) {
    if (!this.onAvatarTap) return
    if (this._isSleeping) return

    const now = Date.now()
    if (now < this._tapCooldownUntil) return
    this._tapCooldownUntil = now + 3000

    if (!this._tapTargets?.length || !this.camera || !this.renderer) return

    const canvas = this.renderer.domElement
    const rect = canvas.getBoundingClientRect()

    const clientX = e.clientX ?? e.touches?.[0]?.clientX
    const clientY = e.clientY ?? e.touches?.[0]?.clientY
    if (typeof clientX !== "number" || typeof clientY !== "number") return

    const x = ((clientX - rect.left) / rect.width) * 2 - 1
    const y = -(((clientY - rect.top) / rect.height) * 2 - 1)
    this._pointerNdc.set(x, y)

    this._raycaster.setFromCamera(this._pointerNdc, this.camera)
    const hits = this._raycaster.intersectObjects(this._tapTargets, true)

    if (hits?.length) {
      try {
        this.onAvatarTap()
      } catch (err) {
        console.warn("onAvatarTap error:", err)
      }
    }
  }
}
