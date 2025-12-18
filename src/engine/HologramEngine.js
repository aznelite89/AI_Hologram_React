import * as THREE from "three"
import Stats from "three/examples/jsm/libs/stats.module.js"
import { GLTFLoader } from "three/examples/jsm/Addons.js"

// =======================
// Morph Target Manager
// =======================
class MorphTargetManager {
  constructor(model) {
    this.model = model
    this.blendshapeMeshes = []
    this.currentBlendshapes = {}
    this.targetBlendshapes = {}
    this.isTalking = false
    this.availableBlendshapes = new Set()

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
      console.log(
        "✅ Available blendshapes:",
        Array.from(this.availableBlendshapes)
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
    if (this.availableBlendshapes.has(blendshapeName)) {
      this.targetBlendshapes[blendshapeName] = Math.max(0, Math.min(1, value))
    }
  }

  closeMouth() {
    this.isTalking = false
    this.availableBlendshapes.forEach((name) => {
      const lower = name.toLowerCase()
      if (lower.includes("mouth") || lower.includes("jaw")) {
        this.targetBlendshapes[name] = 0
      }
    })
    this.setBlendshape("mouthClose", 0.2)
    this.setBlendshape("mouthSmileLeft", 0.15)
    this.setBlendshape("mouthSmileRight", 0.15)
  }

  setVisemeInfluence(visemeName, influence) {
    const lowerViseme = String(visemeName || "").toLowerCase()

    // Reset mouth/jaw blendshapes
    this.availableBlendshapes.forEach((name) => {
      const lower = name.toLowerCase()
      if (lower.includes("mouth") || lower.includes("jaw")) {
        this.targetBlendshapes[name] = 0
      }
    })

    if (lowerViseme.includes("sil") || lowerViseme === "viseme_sil") {
      this.isTalking = false
      this.setBlendshape("mouthClose", 0.2)
      this.setBlendshape("mouthSmileLeft", 0.15)
      this.setBlendshape("mouthSmileRight", 0.15)
    } else if (lowerViseme.includes("pp") || lowerViseme === "viseme_pp") {
      this.isTalking = true
      this.setBlendshape("mouthClose", 1.0)
      this.setBlendshape("mouthPucker", 0.2)
    } else if (lowerViseme.includes("ff") || lowerViseme === "viseme_ff") {
      this.isTalking = true
      this.setBlendshape("jawOpen", 0.25)
      this.setBlendshape("mouthFunnel", 0.3)
      this.setBlendshape("mouthRollLower", 0.2)
    } else if (lowerViseme.includes("th") || lowerViseme === "viseme_th") {
      this.isTalking = true
      this.setBlendshape("jawOpen", 0.35)
      this.setBlendshape("mouthStretchLeft", 0.25)
      this.setBlendshape("mouthStretchRight", 0.25)
    } else if (lowerViseme.includes("dd") || lowerViseme === "viseme_dd") {
      this.isTalking = true
      this.setBlendshape("jawOpen", 0.4)
      this.setBlendshape("mouthSmileLeft", 0.1)
      this.setBlendshape("mouthSmileRight", 0.1)
    } else if (lowerViseme.includes("kk") || lowerViseme === "viseme_kk") {
      this.isTalking = true
      this.setBlendshape("jawOpen", 0.5)
    } else if (lowerViseme.includes("ch") || lowerViseme === "viseme_ch") {
      this.isTalking = true
      this.setBlendshape("jawOpen", 0.4)
      this.setBlendshape("mouthFunnel", 0.3)
      this.setBlendshape("mouthPucker", 0.2)
    } else if (lowerViseme.includes("ss") || lowerViseme === "viseme_ss") {
      this.isTalking = true
      this.setBlendshape("jawOpen", 0.2)
      this.setBlendshape("mouthSmileLeft", 0.4)
      this.setBlendshape("mouthSmileRight", 0.4)
      this.setBlendshape("mouthStretchLeft", 0.2)
      this.setBlendshape("mouthStretchRight", 0.2)
    } else if (lowerViseme.includes("nn") || lowerViseme === "viseme_nn") {
      this.isTalking = true
      this.setBlendshape("jawOpen", 0.35)
    } else if (lowerViseme.includes("rr") || lowerViseme === "viseme_rr") {
      this.isTalking = true
      this.setBlendshape("jawOpen", 0.45)
      this.setBlendshape("mouthFunnel", 0.2)
    } else if (lowerViseme.includes("aa") || lowerViseme === "viseme_aa") {
      this.isTalking = true
      this.setBlendshape("jawOpen", 0.85)
      this.setBlendshape("mouthLowerDownLeft", 0.2)
      this.setBlendshape("mouthLowerDownRight", 0.2)
    } else if (lowerViseme.includes("e") || lowerViseme === "viseme_e") {
      this.isTalking = true
      this.setBlendshape("jawOpen", 0.45)
      this.setBlendshape("mouthSmileLeft", 0.35)
      this.setBlendshape("mouthSmileRight", 0.35)
    } else if (lowerViseme.includes("i") || lowerViseme === "viseme_i") {
      this.isTalking = true
      this.setBlendshape("jawOpen", 0.25)
      this.setBlendshape("mouthSmileLeft", 0.7)
      this.setBlendshape("mouthSmileRight", 0.7)
      this.setBlendshape("mouthStretchLeft", 0.3)
      this.setBlendshape("mouthStretchRight", 0.3)
    } else if (lowerViseme.includes("o") || lowerViseme === "viseme_o") {
      this.isTalking = true
      this.setBlendshape("jawOpen", 0.55)
      this.setBlendshape("mouthFunnel", 0.5)
      this.setBlendshape("mouthPucker", 0.3)
    } else if (lowerViseme.includes("u") || lowerViseme === "viseme_u") {
      this.isTalking = true
      this.setBlendshape("jawOpen", 0.35)
      this.setBlendshape("mouthPucker", 0.75)
      this.setBlendshape("mouthFunnel", 0.5)
    } else {
      this.isTalking = true
      this.setBlendshape("jawOpen", influence * 0.6)
      this.setBlendshape("mouthSmileLeft", 0.2)
      this.setBlendshape("mouthSmileRight", 0.2)
    }
  }

  update(delta) {
    const lerpFactor = 10 * delta
    this.availableBlendshapes.forEach((blendshapeName) => {
      if (this.currentBlendshapes[blendshapeName] === undefined) return

      this.currentBlendshapes[blendshapeName] = this.lerp(
        this.currentBlendshapes[blendshapeName],
        this.targetBlendshapes[blendshapeName],
        lerpFactor
      )

      this.blendshapeMeshes.forEach(({ mesh, dictionary }) => {
        const index = dictionary[blendshapeName]
        if (index !== undefined) {
          mesh.morphTargetInfluences[index] =
            this.currentBlendshapes[blendshapeName]
        }
      })
    })
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
    showStats = true,
  } = {}) {
    this.backgroundUrl = backgroundUrl
    this.avatarUrl = avatarUrl
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
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1))
    this.renderer.setSize(window.innerWidth, window.innerHeight)
    this.renderer.shadowMap.enabled = true
    this.renderer.shadowMap.type = THREE.BasicShadowMap

    this.containerEl.appendChild(this.renderer.domElement)

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

    // Dispose renderer + remove canvas
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
    this.morph = null
    this.gaze = null
    this.stats = null
  }

  // Public helpers
  setViseme(visemeName, influence = 1) {
    this.morph?.setVisemeInfluence(visemeName, influence)
  }

  closeMouth() {
    this.morph?.closeMouth()
  }

  // ===================
  // Internal methods
  // ===================
  _tick() {
    this._raf = requestAnimationFrame(() => this._tick())

    const delta = this.clock.getDelta()
    this.mixer?.update(delta)
    this.morph?.update(delta)
    this.gaze?.update(delta)
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
        object.castShadow = window.innerWidth < 1920
        object.receiveShadow = window.innerWidth < 1920

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

    this.morph = new MorphTargetManager(this.model)
    this.gaze = new RPMGazeManager(this.model, this.camera, this.morph)

    // Play embedded animation if present
    if (gltf.animations && gltf.animations.length > 0) {
      console.log(`✅ Found ${gltf.animations.length} animations inside ${url}`)
      const clip = gltf.animations[0]
      const action = this.mixer.clipAction(clip)
      action.play()
    } else {
      console.warn(`⚠️ No embedded animations found in ${url}`)
    }

    return this.model
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
}
