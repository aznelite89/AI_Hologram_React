import "./style.css"
import * as THREE from "three"
import Stats from "three/examples/jsm/libs/stats.module.js"
import { GLTFLoader } from "three/examples/jsm/Addons.js"
import { LipSyncTTS } from "./lipsync"
import { openAIAPiKey } from "./apikey"
import { geminiAPIKey } from "./apikey"
import { getNewSession } from "./api/api"
import { getDb } from "./api/firebase"
import { censorBadWords, isMobileEnv, toIsoWithOffset } from "./util/common"

// ========== IMPORTS - TENSORFLOW AND COCO-SSD ==========
import * as cocoSsd from "@tensorflow-models/coco-ssd"
import "@tensorflow/tfjs"
import "@tensorflow/tfjs-backend-webgl"
// =======================================================
console.log("RUNNING src/main.js")

// ========== DOCUMENT CONTENT - LOAD ONCE ==========
let documentContent = ""

async function loadDocumentContent() {
  try {
    const response = await fetch("sciencecenter.txt")
    documentContent = await response.text()
    console.log("✅ Science Center document loaded successfully")
  } catch (error) {
    console.error("❌ Error loading sciencecenter.txt:", error)
    documentContent = ""
  }
}
// ==================================================

// ========== LIP SYNC SETUP ==========
async function setupLipSyncTTS() {
  const lipSyncTTS = new LipSyncTTS()
  let t
  lipSyncTTS.setOnVisemeChange((viseme, features) => {
    if (t) clearTimeout(t)
    morphTargetManager.setVisemeInfluence(viseme, 1.0)
    t = setTimeout(() => {
      morphTargetManager.setVisemeInfluence("viseme_sil", 1.0)
    }, 500)
  })
  return lipSyncTTS
}
// ====================================

// ========== SPEECH RESPONSE ==========
async function speakResponse(text, lipSyncTTS) {
  try {
    await speakWithElevenLabs(text)
  } catch (error) {
    console.error("Error in speakResponse:", error)
    speakResponseFallback(text)
  }
}
// =====================================

// ========== GLOBAL VARIABLES ==========
let scene, renderer, camera, stats, animationGroup
let model, mixer, clock
let currentAvatar
let idleAction
let lipSyncTTS
let currentSession

let chatCountTrusthold = 3

// Person detection variables
let personDetectionModel = null
let detectionInterval = null
let lastPersonDetectedTime = 0
let personDetectionCooldown = 750000 // 500 seconds cooldown
let isProcessingDetection = false

// Voice recognition variables
let recognition
let isListening = false
let isProcessing = false
let conversationHistory = []
let speechSynthesis = window.speechSynthesis

//auto-refresh after inactivity variables
let inactivityTimeout = null
const INACTIVITY_DURATION = 750000 // 30 seconds in milliseconds

// ======================================

// ========== MORPH TARGET MANAGER ==========
// ========== COMPLETE ARKIT BLENDSHAPE MORPH TARGET MANAGER ==========
class morphTargetManager {
  constructor(model) {
    this.model = model
    this.blendshapeMeshes = [] // Store all meshes with blendshapes
    this.currentBlendshapes = {} // Track current blendshape values
    this.targetBlendshapes = {} // Target blendshape values
    this.isTalking = false

    // Store the actual blendshape names found in the model
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

        // Store mesh info
        this.blendshapeMeshes.push({
          mesh: object,
          dictionary: dictionary,
        })

        // Collect all available blendshape names
        Object.keys(dictionary).forEach((name) => {
          this.availableBlendshapes.add(name)
        })

        console.log(
          `✅ Found mesh with ${Object.keys(dictionary).length} blendshapes:`,
          Object.keys(dictionary)
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
        `✅ Available blendshapes:`,
        Array.from(this.availableBlendshapes)
      )
    }
  }

  initializeBlendshapes() {
    // Initialize all available blendshapes to 0
    this.availableBlendshapes.forEach((name) => {
      this.currentBlendshapes[name] = 0
      this.targetBlendshapes[name] = 0
    })
  }

  setBlendshape(blendshapeName, value) {
    // Check if this blendshape exists in the model
    if (this.availableBlendshapes.has(blendshapeName)) {
      this.targetBlendshapes[blendshapeName] = Math.max(0, Math.min(1, value))
    }
  }

  // LEGACY SUPPORT - Keep old methods for compatibility
  setMouthOpen(influence) {
    this.isTalking = influence > 0
    this.setBlendshape("jawOpen", influence * 0.7)
    this.setBlendshape("mouthSmileLeft", 0.2)
    this.setBlendshape("mouthSmileRight", 0.2)
  }

  setMouthClose(influence) {
    this.isTalking = false
    this.setBlendshape("mouthClose", influence)
    this.setBlendshape("jawOpen", 0)
  }

  closeMouth() {
    this.isTalking = false
    // Reset all mouth-related blendshapes
    this.availableBlendshapes.forEach((name) => {
      if (
        name.toLowerCase().includes("mouth") ||
        name.toLowerCase().includes("jaw")
      ) {
        this.targetBlendshapes[name] = 0
      }
    })
    // Set subtle neutral expression
    this.setBlendshape("mouthClose", 0.2)
    this.setBlendshape("mouthSmileLeft", 0.15)
    this.setBlendshape("mouthSmileRight", 0.15)
  }

  // Viseme to ARKit blendshape mapping
  setVisemeInfluence(visemeName, influence) {
    const lowerViseme = visemeName.toLowerCase()

    // Reset all mouth blendshapes first
    this.availableBlendshapes.forEach((name) => {
      if (
        name.toLowerCase().includes("mouth") ||
        name.toLowerCase().includes("jaw")
      ) {
        this.targetBlendshapes[name] = 0
      }
    })

    // Map visemes to ARKit blendshapes based on phonetic sounds
    if (lowerViseme.includes("sil") || lowerViseme === "viseme_sil") {
      // Silence - neutral/closed mouth
      this.isTalking = false
      this.setBlendshape("mouthClose", 0.2)
      this.setBlendshape("mouthSmileLeft", 0.15)
      this.setBlendshape("mouthSmileRight", 0.15)
    } else if (lowerViseme.includes("pp") || lowerViseme === "viseme_pp") {
      // PP/B/M sound - lips pressed together
      this.isTalking = true
      this.setBlendshape("mouthClose", 1.0)
      this.setBlendshape("mouthPucker", 0.2)
    } else if (lowerViseme.includes("ff") || lowerViseme === "viseme_ff") {
      // FF/V sound - bottom lip to teeth
      this.isTalking = true
      this.setBlendshape("jawOpen", 0.25)
      this.setBlendshape("mouthFunnel", 0.3)
      this.setBlendshape("mouthRollLower", 0.2)
    } else if (lowerViseme.includes("th") || lowerViseme === "viseme_th") {
      // TH sound - tongue between teeth
      this.isTalking = true
      this.setBlendshape("jawOpen", 0.35)
      this.setBlendshape("mouthStretchLeft", 0.25)
      this.setBlendshape("mouthStretchRight", 0.25)
    } else if (lowerViseme.includes("dd") || lowerViseme === "viseme_dd") {
      // DD/T/N sound - tongue to roof
      this.isTalking = true
      this.setBlendshape("jawOpen", 0.4)
      this.setBlendshape("mouthSmileLeft", 0.1)
      this.setBlendshape("mouthSmileRight", 0.1)
    } else if (lowerViseme.includes("kk") || lowerViseme === "viseme_kk") {
      // KK/G sound - back of tongue
      this.isTalking = true
      this.setBlendshape("jawOpen", 0.5)
    } else if (lowerViseme.includes("ch") || lowerViseme === "viseme_ch") {
      // CH/J/SH sound
      this.isTalking = true
      this.setBlendshape("jawOpen", 0.4)
      this.setBlendshape("mouthFunnel", 0.3)
      this.setBlendshape("mouthPucker", 0.2)
    } else if (lowerViseme.includes("ss") || lowerViseme === "viseme_ss") {
      // SS/Z sound - teeth together, slight smile
      this.isTalking = true
      this.setBlendshape("jawOpen", 0.2)
      this.setBlendshape("mouthSmileLeft", 0.4)
      this.setBlendshape("mouthSmileRight", 0.4)
      this.setBlendshape("mouthStretchLeft", 0.2)
      this.setBlendshape("mouthStretchRight", 0.2)
    } else if (lowerViseme.includes("nn") || lowerViseme === "viseme_nn") {
      // NN/L sound
      this.isTalking = true
      this.setBlendshape("jawOpen", 0.35)
    } else if (lowerViseme.includes("rr") || lowerViseme === "viseme_rr") {
      // RR sound - slightly rounded
      this.isTalking = true
      this.setBlendshape("jawOpen", 0.45)
      this.setBlendshape("mouthFunnel", 0.2)
    } else if (lowerViseme.includes("aa") || lowerViseme === "viseme_aa") {
      // AA sound (father) - wide open
      this.isTalking = true
      this.setBlendshape("jawOpen", 0.85)
      this.setBlendshape("mouthLowerDownLeft", 0.2)
      this.setBlendshape("mouthLowerDownRight", 0.2)
    } else if (lowerViseme.includes("e") || lowerViseme === "viseme_e") {
      // E sound (bet) - medium open with smile
      this.isTalking = true
      this.setBlendshape("jawOpen", 0.45)
      this.setBlendshape("mouthSmileLeft", 0.35)
      this.setBlendshape("mouthSmileRight", 0.35)
    } else if (lowerViseme.includes("i") || lowerViseme === "viseme_i") {
      // I/EE sound (feet) - wide smile
      this.isTalking = true
      this.setBlendshape("jawOpen", 0.25)
      this.setBlendshape("mouthSmileLeft", 0.7)
      this.setBlendshape("mouthSmileRight", 0.7)
      this.setBlendshape("mouthStretchLeft", 0.3)
      this.setBlendshape("mouthStretchRight", 0.3)
    } else if (lowerViseme.includes("o") || lowerViseme === "viseme_o") {
      // O sound (boat) - rounded
      this.isTalking = true
      this.setBlendshape("jawOpen", 0.55)
      this.setBlendshape("mouthFunnel", 0.5)
      this.setBlendshape("mouthPucker", 0.3)
    } else if (lowerViseme.includes("u") || lowerViseme === "viseme_u") {
      // U sound (boot) - very rounded
      this.isTalking = true
      this.setBlendshape("jawOpen", 0.35)
      this.setBlendshape("mouthPucker", 0.75)
      this.setBlendshape("mouthFunnel", 0.5)
    } else {
      // Default talking mouth - generic open
      this.isTalking = true
      this.setBlendshape("jawOpen", influence * 0.6)
      this.setBlendshape("mouthSmileLeft", 0.2)
      this.setBlendshape("mouthSmileRight", 0.2)
    }
  }

  update(delta) {
    const lerpFactor = 10 * delta // Fast interpolation for responsive lip sync

    // Update all blendshapes with smooth interpolation
    this.availableBlendshapes.forEach((blendshapeName) => {
      if (this.currentBlendshapes[blendshapeName] !== undefined) {
        this.currentBlendshapes[blendshapeName] = this.lerp(
          this.currentBlendshapes[blendshapeName],
          this.targetBlendshapes[blendshapeName],
          lerpFactor
        )

        // Apply to all meshes that have this blendshape
        this.blendshapeMeshes.forEach(({ mesh, dictionary }) => {
          const index = dictionary[blendshapeName]
          if (index !== undefined) {
            mesh.morphTargetInfluences[index] =
              this.currentBlendshapes[blendshapeName]
          }
        })
      }
    })
  }

  lerp(a, b, t) {
    return a + (b - a) * Math.min(t, 1)
  }
}
// ==========================================

// ========== ANIMATION MANAGER ==========
class AnimationManager {
  constructor(mixer, animationGroup) {
    this.mixer = mixer
    this.animationGroup = animationGroup
    this.animations = new Map()
    this.currentAction = null
    this.previousAction = null

    this.animationQueue = []
    this.currentAnimationIndex = 0
    this.isAutoCycling = false
    this.cycleTimer = null
    this.defaultAnimationDuration = 5000
  }

  addAnimation(name, clip) {
    const action = this.mixer.clipAction(clip)
    action.setLoop(THREE.LoopRepeat)
    this.animations.set(name, action)
    return action
  }

  playAnimation(name, crossfadeDuration = 0.5) {
    const action = this.animations.get(name)
    if (!action) {
      console.warn(`Animation "${name}" not found`)
      return
    }

    this.previousAction = this.currentAction
    this.currentAction = action

    if (this.previousAction && this.previousAction !== this.currentAction) {
      this.previousAction.fadeOut(crossfadeDuration)
    }

    this.currentAction
      .reset()
      .setEffectiveTimeScale(1)
      .setEffectiveWeight(1)
      .fadeIn(crossfadeDuration)
      .play()
  }

  setupAnimationCycle(animationNames) {
    this.animationQueue = [...animationNames]
    this.currentAnimationIndex = 0
    this.updateCycleDisplay()
  }

  startAutoCycle(duration = this.defaultAnimationDuration) {
    if (this.animationQueue.length === 0) {
      console.warn("No animations in queue to cycle through")
      return
    }

    this.isAutoCycling = true
    this.defaultAnimationDuration = duration

    this.playNextInCycle()

    this.cycleTimer = setInterval(() => {
      this.playNextInCycle()
    }, duration)

    this.updateCycleDisplay()
  }

  stopAutoCycle() {
    this.isAutoCycling = false
    if (this.cycleTimer) {
      clearInterval(this.cycleTimer)
      this.cycleTimer = null
    }
    this.updateCycleDisplay()
  }

  playNextInCycle() {
    if (this.animationQueue.length === 0) return

    const animationName = this.animationQueue[this.currentAnimationIndex]
    this.playAnimation(animationName)

    this.currentAnimationIndex =
      (this.currentAnimationIndex + 1) % this.animationQueue.length
    this.updateCycleDisplay()
  }

  updateCycleDisplay() {
    const displayElement = document.getElementById("cycle-status")
    if (displayElement) {
      if (this.animationQueue.length === 0) {
        displayElement.innerHTML =
          '<div style="color: #888;">No animations loaded</div>'
      } else if (this.isAutoCycling) {
        const currentAnim =
          this.animationQueue[
            (this.currentAnimationIndex - 1 + this.animationQueue.length) %
              this.animationQueue.length
          ]
        displayElement.innerHTML = `
          <div style="color: #4CAF50; font-weight: bold;">🔄 Auto-cycling Active</div>
          <div style="color: #ccc; font-size: 12px;">Current: ${currentAnim}</div>
          <div style="color: #ccc; font-size: 12px;">Queue: ${this.animationQueue.join(
            " → "
          )}</div>
        `
      } else {
        displayElement.innerHTML = `
          <div style="color: #FF9800; font-weight: bold;">⏸️ Auto-cycling Paused</div>
          <div style="color: #ccc; font-size: 12px;">Queue: ${this.animationQueue.join(
            " → "
          )}</div>
        `
      }
    }
  }

  getAnimationNames() {
    return Array.from(this.animations.keys())
  }

  removeAnimation(name) {
    const action = this.animations.get(name)
    if (action) {
      action.stop()
      this.animations.delete(name)
    }
  }

  clearAnimations() {
    this.stopAutoCycle()
    this.animations.forEach((action) => action.stop())
    this.animations.clear()
    this.currentAction = null
    this.previousAction = null
    this.animationQueue = []
    this.currentAnimationIndex = 0
  }
}

let animationManager

// ========== SPEECH RECOGNITION ==========
function initSpeechRecognition() {
  if (!("webkitSpeechRecognition" in window)) {
    console.warn("Speech recognition not supported in this browser")
    return
  }

  recognition = new webkitSpeechRecognition()
  recognition.continuous = false
  recognition.interimResults = false
  recognition.lang = "en-US"

  recognition.onstart = () => {
    isListening = true
    updateVoiceStatus("Listening...")
    updatePushToTalkButton()
  }

  recognition.onresult = async (event) => {
    const transcript = Array.from(event.results)
      .map((result) => result[0])
      .map((result) => result.transcript)
      .join("")

    console.log("Transcript received:", transcript)
    updateVoiceStatus(`Heard: "${transcript}"`)

    isListening = false
    updatePushToTalkButton()

    await processUserSpeech(transcript)
  }

  recognition.onerror = (event) => {
    console.error("Speech recognition error:", event.error)
    updateVoiceStatus("Error: " + event.error)
    isListening = false
    updatePushToTalkButton()
  }

  recognition.onend = () => {
    isListening = false
    updateVoiceStatus("Ready to talk")
    updatePushToTalkButton()
  }
}

function startListening() {
  if (!isListening) {
    recognition.start()
    isListening = true
  }
}

function stopListening() {
  if (isListening) {
    recognition.stop()
    isListening = false
    updateVoiceStatus("Processing...")
  }
}

function toggleListening() {
  if (isListening) {
    stopListening()
  } else {
    startListening()
  }
}

function updateVoiceStatus(message) {
  const status = document.getElementById("voice-status")
  if (status) {
    status.textContent = message
  }
}

// ========================================

// ========== PROCESS USER SPEECH ==========
async function processUserSpeech(transcript) {
  if (isProcessing) {
    console.log("Already processing, ignoring new input")
    return
  }

  isProcessing = true
  updatePushToTalkButton()

  try {
    updateVoiceStatus("Thinking...")

    addToConversationHistory("user", transcript)

    const systemPrompt = `You are Sam, an enthusiastic, warm, and highly experienced tour guide at the Singapore Science Centre. Your goal is not just to answer questions, but to act as a concierge, helping guests build a personalized itinerary based on their unique interests.

REFERENCE KNOWLEDGE:
The following is detailed information about the Singapore Science Center that you should use to answer questions:

${documentContent}

STRICT RESPONSE GUIDELINES:
1. KEEP IT SHORT: Your response will be spoken aloud. Limit answers to 2-3 sentences (approx 40 words).
2. NO LISTS: Do not use bullet points or numbered lists. Mention only the top 1 or 2 most relevant exhibits at a time.
3. CONVERSATIONAL: Write for the ear, not the eye. Use natural language, contractions, and a friendly tone.
4. ONE STEP AT A TIME: Do not dump a full schedule. Suggest the next best stop, get their agreement, and then move on.

CONVERSATION FLOW & HEURISTICS:
1. DISCOVER: If the guest is new, ask about their party (e.g., "Are you visiting with children today?") or their interests (e.g., "Do you prefer space, nature, or fears?") to tailor your suggestions.
2. SIMPLIFY: Explain scientific concepts simply, focusing on the "wow" factor rather than dry stats.
3. GUIDE: Connect exhibits logically. If they enjoy the Kinetic Garden, suggest they head inside to the Mechanics exhibit next.
4. ENGAGE: Always end with a short, relevant question to keep the tour moving (e.g., "Does that sound like fun, or would you prefer something quieter?").
5. TICKETING: when calculating ticket prices, always start by asking the user if they are Singaporean or PR. Always calculate based on peak prices.
6. ASSISTANCE: if user asks you for assistance outside your knowledge, always ask them to go to the Visitor Service Center (VSC) or ticketing counter.

IMPORTANT: Base your answers on the reference knowledge provided above.`

    // Filter out any "system" messages from the conversation history for Gemini
    const contents = conversationHistory
      .filter((msg) => msg.role !== "system")
      .map((msg) => ({
        role:
          msg.role === "avatar" || msg.role === "assistant" ? "model" : "user",
        parts: [{ text: msg.content }],
      }))

    console.log("📤 Sending to Gemini - Contents length:", contents.length)

    // Call Gemini API
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${geminiAPIKey}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          contents: contents,
          systemInstruction: {
            parts: [{ text: systemPrompt }],
          },
          generationConfig: {
            maxOutputTokens: 350,
            temperature: 0.6,
          },
          safetySettings: [
            {
              category: "HARM_CATEGORY_HARASSMENT",
              threshold: "BLOCK_NONE",
            },
            {
              category: "HARM_CATEGORY_HATE_SPEECH",
              threshold: "BLOCK_NONE",
            },
            {
              category: "HARM_CATEGORY_SEXUALLY_EXPLICIT",
              threshold: "BLOCK_NONE",
            },
            {
              category: "HARM_CATEGORY_DANGEROUS_CONTENT",
              threshold: "BLOCK_NONE",
            },
          ],
        }),
      }
    )

    if (!response.ok) {
      const errorText = await response.text()
      console.error("❌ Gemini API Error:", errorText)
      throw new Error(
        `Gemini API Error: ${response.status} ${response.statusText}`
      )
    }

    const data = await response.json()

    let aiResponse = null

    if (data.candidates?.[0]?.content?.parts?.[0]?.text) {
      aiResponse = data.candidates[0].content.parts[0].text
    } else if (data.candidates?.[0]?.text) {
      aiResponse = data.candidates[0].text
    } else if (data.text) {
      aiResponse = data.text
    } else if (data.candidates?.[0]?.output) {
      aiResponse = data.candidates[0].output
    }

    if (!aiResponse) {
      console.error("❌ No text found in response.")
      console.error(
        "❌ Full response structure:",
        JSON.stringify(data, null, 2)
      )
      aiResponse =
        "I apologize, but I'm having trouble generating a response right now. Could you try rephrasing your question?"
    }

    addToConversationHistory("assistant", aiResponse)

    const sanitizedResponse = aiResponse
      .replace(/\*/g, "") // Remove asterisks
      .replace(/[_~`#]/g, "") // Remove markdown formatting characters
      .replace(/\[.*?\]/g, "") // Remove square brackets and content (links/references)
      .replace(/\s+/g, " ") // Normalize whitespace
      .trim() // Remove leading/trailing whitespace

    updateVoiceStatus("Speaking...")

    await speakResponse(sanitizedResponse, lipSyncTTS)

    updateVoiceStatus("Ready to talk - Click microphone to speak")
  } catch (error) {
    console.error("❌ Error processing speech:", error)
    updateVoiceStatus("Error occurred - Click microphone to try again")

    // Provide fallback response
    const fallbackResponse =
      "I'm having technical difficulties. Could you please try again?"
    await speakResponse(fallbackResponse, lipSyncTTS)
  } finally {
    isProcessing = false
    updatePushToTalkButton()
  }
}
// =========================================

// ========== FALLBACK TTS ==========
function speakResponseFallback(text) {
  if ("speechSynthesis" in window) {
    const utterance = new SpeechSynthesisUtterance(text)
    utterance.rate = 0.9
    utterance.pitch = 1
    utterance.volume = 0.8
    speechSynthesis.speak(utterance)
  }
}
// ==================================

// ========== PERSON DETECTION ==========
async function initializePersonDetection() {
  try {
    console.log("Loading person detection model...")
    personDetectionModel = await cocoSsd.load()
    console.log("Person detection model loaded successfully!")
    return true
  } catch (error) {
    console.error("Error loading person detection model:", error)
    return false
  }
}

function startPersonDetection() {
  const videoElement = document.getElementById("webcam-feed")

  if (!videoElement) {
    console.error("Webcam video element not found")
    return
  }

  if (detectionInterval) {
    clearInterval(detectionInterval)
  }

  detectionInterval = setInterval(async () => {
    await detectPerson(videoElement)
  }, 2000)

  console.log("Person detection started")
}

function stopPersonDetection() {
  if (detectionInterval) {
    clearInterval(detectionInterval)
    detectionInterval = null
    console.log("Person detection stopped")
  }
}

async function detectPerson(videoElement) {
  if (
    !personDetectionModel ||
    !videoElement.videoWidth ||
    isProcessingDetection
  ) {
    return
  }

  try {
    const predictions = await personDetectionModel.detect(videoElement)

    const personDetections = predictions.filter(
      (prediction) => prediction.class === "person" && prediction.score > 0.5
    )

    if (personDetections.length > 0) {
      const currentTime = Date.now()

      if (
        currentTime - lastPersonDetectedTime > personDetectionCooldown &&
        !isListening &&
        !isProcessing
      ) {
        console.log(
          `Person detected! Confidence: ${(
            personDetections[0].score * 100
          ).toFixed(1)}%`
        )
        lastPersonDetectedTime = currentTime

        await handlePersonDetected()
      } else if (isListening || isProcessing) {
        console.log(
          "Person detected but conversation is active - skipping greeting"
        )
      }
    }
  } catch (error) {
    console.error("Error during person detection:", error)
  }
}

async function handlePersonDetected() {
  if (isProcessingDetection || isListening || isProcessing) {
    console.log(
      "Skipping greeting - conversation or detection already in progress"
    )
    return
  }

  isProcessingDetection = true
  isProcessing = true
  updatePushToTalkButton()

  try {
    console.log("Generating greeting for detected person...")

    updateVoiceStatus("Someone detected! Saying hello...")

    const greeting = await generateGreeting()

    updateVoiceStatus("Speaking greeting...")

    await speakWithElevenLabs(greeting)

    updateVoiceStatus("Ready to talk - Click microphone to speak")

    console.log("Greeting completed successfully")
  } catch (error) {
    console.error("Error handling person detection:", error)
    updateVoiceStatus("Ready to talk - Click microphone to speak")
  } finally {
    isProcessingDetection = false
    isProcessing = false
    updatePushToTalkButton()
  }
}

async function generateGreeting() {
  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${openAIAPiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content:
              "You are a friendly AI tour guide at the Singapore Science Center. Generate a short, natural greeting (1-2 sentences max). Make your greetings witty and comical.",
          },
          {
            role: "user",
            content:
              "Someone just appeared in front of you. Greet them with a science joke or quip, direct then to press the red microphone button to talk to you, and scan the QR code that will appear shortly to bring you around the Science Center on their mobile phones.",
          },
        ],
        max_tokens: 150,
        temperature: 0.8,
      }),
    })

    if (!response.ok) {
      throw new Error(`OpenAI API error: ${response.status}`)
    }

    const data = await response.json()
    return data.choices[0].message.content.trim()
  } catch (error) {
    console.error("Error generating greeting:", error)
    return "Hello! It's great to see you!"
  }
}
// ======================================

// ========== ELEVENLABS INTEGRATION ==========
async function speakWithElevenLabs(text) {
  const ELEVENLABS_API_KEY =
    "dec42414e8fdbf435c76ded22d6b4af6a4222f7d6f65c3894e468c365fce000f"
  const VOICE_ID = "aFxDLa1A1dSRlzW8nziT"

  console.log("🎤 Starting ElevenLabs TTS...")
  console.log("📝 Text to speak:", text)

  try {
    const url = `https://api.elevenlabs.io/v1/text-to-speech/${VOICE_ID}`
    console.log("🌐 Calling URL:", url)

    const response = await fetch(url, {
      method: "POST",
      headers: {
        Accept: "audio/mpeg",
        "Content-Type": "application/json",
        "xi-api-key": ELEVENLABS_API_KEY,
      },
      body: JSON.stringify({
        text: text,
        model_id: "eleven_monolingual_v1",
        voice_settings: {
          stability: 0.5,
          similarity_boost: 0.75,
        },
      }),
    })

    console.log("📡 Response status:", response.status)
    console.log("📡 Response ok:", response.ok)

    if (!response.ok) {
      const errorText = await response.text()
      console.error("❌ ElevenLabs API Error Response:", errorText)
      throw new Error(`ElevenLabs API error: ${response.status} - ${errorText}`)
    }

    console.log("✅ ElevenLabs API call successful!")

    const audioBlob = await response.blob()
    console.log("🎵 Audio blob size:", audioBlob.size, "bytes")

    if (audioBlob.size === 0) {
      throw new Error("Received empty audio blob from ElevenLabs")
    }

    const audioUrl = URL.createObjectURL(audioBlob)
    console.log("🔗 Audio URL created:", audioUrl)

    const audio = new Audio(audioUrl)

    console.log("▶️ Starting audio playback...")
    await audio.play()

    if (morphTargetManager) {
      console.log("👄 Starting lip sync animation...")
      animateLipsWhileSpeaking(audio)
    }

    await new Promise((resolve, reject) => {
      audio.onended = () => {
        console.log("✅ Audio playback completed")
        resolve()
      }
      audio.onerror = (error) => {
        console.error("❌ Audio playback error:", error)
        reject(error)
      }
    })

    URL.revokeObjectURL(audioUrl)
    console.log("🧹 Cleaned up audio URL")
  } catch (error) {
    console.error("❌ ERROR in speakWithElevenLabs:", error)
    console.error("❌ Error stack:", error.stack)

    console.log("⚠️ Falling back to browser speech synthesis...")
    speakResponseFallback(text)
  }
}

function animateLipsWhileSpeaking(audio) {
  if (!morphTargetManager) return
  let toggle = false

  const lipSyncInterval = setInterval(() => {
    if (audio.paused || audio.ended) {
      clearInterval(lipSyncInterval)
      morphTargetManager.closeMouth()
      return
    }

    if (toggle) {
      // Wide open mouth
      morphTargetManager.setBlendshape("jawOpen", 0.7)
      morphTargetManager.setBlendshape("mouthSmileLeft", 0.2)
      morphTargetManager.setBlendshape("mouthSmileRight", 0.2)
    } else {
      // Slightly open mouth
      morphTargetManager.setBlendshape("jawOpen", 0.3)
      morphTargetManager.setBlendshape("mouthSmileLeft", 0.15)
      morphTargetManager.setBlendshape("mouthSmileRight", 0.15)
    }

    toggle = !toggle
  }, 150)

  audio.onended = () => {
    clearInterval(lipSyncInterval)
    morphTargetManager.closeMouth()
  }
}
// ============================================

// ========== WEBCAM SETUP ==========
async function setupWebcamFeed() {
  const videoElement = document.getElementById("webcam-feed")

  if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true })
      videoElement.srcObject = stream

      videoElement.onloadedmetadata = async () => {
        const modelLoaded = await initializePersonDetection()

        if (modelLoaded) {
          startPersonDetection()
        } else {
          console.warn("Person detection could not be initialized")
        }
      }
    } catch (error) {
      console.error("Error accessing webcam:", error)
      videoElement.style.display = "none"
    }
  } else {
    console.warn("Webcam access not supported by this browser.")
    videoElement.style.display = "none"
  }
}
// ==================================

// ========== CONVERSATION HISTORY MANAGEMENT ==========
const MAX_HISTORY_LENGTH = 20
const CONVERSATION_TIMEOUT = 300000

let lastInteractionTime = Date.now()

function addToConversationHistory(role, content) {
  const currentTime = Date.now()

  if (currentTime - lastInteractionTime > CONVERSATION_TIMEOUT) {
    resetConversationHistory()
    updateVoiceStatus("Conversation context reset due to inactivity")
  }

  lastInteractionTime = currentTime
  resetInactivityTimer()

  conversationHistory.push({
    role: role,
    content: content,
    timestamp: toIsoWithOffset(currentTime),
  })

  if (conversationHistory.length > chatCountTrusthold) {
    console.log("Current session: ", currentSession)
    if (!currentSession) {
      generateSession()
    }
  }
  if (conversationHistory.length > MAX_HISTORY_LENGTH + 1) {
    conversationHistory.splice(1, 2)
  }

  updateConversationDisplay()
}

async function generateSession() {
  try {
    console.log("history: ", conversationHistory)
    const data = await getNewSession(conversationHistory)
    if (data.ok) {
      console.log("session data: ", data)
      currentSession = data.session_id
      initialiseQRFeedbackUI(currentSession)
    } else {
      console.log("Failed to fetch session: , ", data)
    }
  } catch (error) {
    alert("error while generating new session: ", error)
  }
}

function initialiseQRFeedbackUI(session) {
  const baseUrl = import.meta.env.VITE_APP_BASE,
    qrCodeUI = `<button id="qr-button">
  <img src="https://api.qrserver.com/v1/create-qr-code/?size=120x120&data=${baseUrl}/?session=${session}" />
  Scan to move to AI Guide App
  </button>`

  const feedbackContainer = document.getElementById("feedback-container")

  if (!feedbackContainer) throw new Error("feedback-container does not exist")

  feedbackContainer.innerHTML = qrCodeUI
}

function resetConversationHistory() {
  conversationHistory = []
  updateConversationDisplay()
}

function updateConversationDisplay() {
  const conversationElement = document.getElementById("conversation-history")
  if (!conversationElement) return

  const visibleHistory = conversationHistory
    .slice(-3)
    .filter((msg) => msg.role !== "system")

  conversationElement.innerHTML = visibleHistory
    .map((msg) => {
      const isUser = msg.role === "user"
      const bgStyle = isUser
        ? "background: transparent; color: white; margin-left: auto; text-align: right;"
        : "background: #FFFFFF40; color: #FFE457; margin-right: auto; "

      return `
      <div style="
        margin: 5px 0;
        padding: 8px 12px;
        border-radius: 5px;
        ${bgStyle}
      ">
        ${censorBadWords(msg.content)}
      </div>
    `
    })
    .join("")

  conversationElement.scrollTop = conversationElement.scrollHeight
}
// =====================================================

// =================AUTO-REFRESH ON INACTIVITY=======================

function resetInactivityTimer() {
  // Clear existing timeout
  if (inactivityTimeout) {
    clearTimeout(inactivityTimeout)
  }

  // Set new timeout
  inactivityTimeout = setTimeout(() => {
    console.log("30 seconds of inactivity detected. Refreshing page...")
    location.reload()
  }, INACTIVITY_DURATION)

  console.log("Inactivity timer reset on main.jsx")
}

function startInactivityMonitoring() {
  // Start the initial timer
  resetInactivityTimer()

  // Reset timer on any user interaction
  const events = [
    "mousedown",
    "mousemove",
    "keypress",
    "scroll",
    "touchstart",
    "click",
  ]

  events.forEach((event) => {
    document.addEventListener(event, resetInactivityTimer, true)
  })

  console.log("Inactivity monitoring started")
}

function stopInactivityMonitoring() {
  if (inactivityTimeout) {
    clearTimeout(inactivityTimeout)
    inactivityTimeout = null
  }
  console.log("Inactivity monitoring stopped")
}
// ================================================

// ========== MAIN MICROPHONE BUTTON SETUP ==========
function setupMainMicrophoneButton() {
  const mainMicButton = document.getElementById("btn-main-microphone")

  if (!mainMicButton) {
    console.error("Main microphone button not found")
    return
  }

  mainMicButton.addEventListener("click", () => {
    console.log(
      "Main mic button clicked. Current state - isListening:",
      isListening,
      "isProcessing:",
      isProcessing,
      "isProcessingDetection:",
      isProcessingDetection
    )

    if (isListening) {
      console.log("Stopping listening...")
      if (recognition) {
        recognition.stop()
      }
      isListening = false
      updateVoiceStatus("Stopped listening")
      updateMainMicrophoneButton()
    } else if (isProcessing || isProcessingDetection) {
      console.log("Stopping speech...")
      if (lipSyncTTS) {
        lipSyncTTS.stop()
      }
      speechSynthesis.cancel()

      const audioElements = document.querySelectorAll("audio")
      audioElements.forEach((audio) => {
        audio.pause()
        audio.currentTime = 0
      })

      isProcessing = false
      isProcessingDetection = false
      updateVoiceStatus("Ready to talk")
      updateMainMicrophoneButton()
    } else {
      console.log("Starting listening...")
      startListening()
    }
  })
}

function updateMainMicrophoneButton() {
  const mainMicButton = document.getElementById("btn-main-microphone")

  if (mainMicButton) {
    mainMicButton.classList.remove("listening", "processing")

    if (isListening) {
      mainMicButton.innerHTML = '<i class="fas fa-microphone-slash"></i>'
      mainMicButton.classList.add("listening")
    } else if (isProcessing) {
      mainMicButton.innerHTML = '<i class="fas fa-spinner fa-spin"></i>'
      mainMicButton.classList.add("processing")
    } else {
      mainMicButton.innerHTML = '<i class="fas fa-microphone"></i>'
    }
  }
}
// ==================================================

// ========== REFRESH BUTTON SETUP ==========
function setupRefreshButton() {
  const refreshButton = document.getElementById("btn-refresh-conversation")

  if (!refreshButton) {
    console.error("Refresh button not found")
    return
  }

  refreshButton.addEventListener("click", () => {
    console.log("Refresh button clicked - reloading application...")

    // Optional: Show a brief confirmation
    refreshButton.innerHTML = '<i class="fas fa-spinner fa-spin"></i>'

    // Small delay for visual feedback, then reload
    setTimeout(() => {
      location.reload()
    }, 300)
  })
}
// ==========================================

// ========== AVATAR LOADING ==========
async function loadAvatar(url) {
  const loader = new GLTFLoader()
  const gltf = await loader.loadAsync(url)
  model = gltf.scene

  model.traverse(function (object) {
    if (object.isMesh) {
      object.castShadow = window.innerWidth < 1920
      object.receiveShadow = window.innerWidth < 1920

      if (object.material) {
        object.material.envMapIntensity = 0.3
        const newMaterial = object.material.clone()
        newMaterial.morphTargets = true

        // Optimize texture settings
        if (object.material.map) {
          object.material.map.generateMipmaps = true
          object.material.map.minFilter = THREE.LinearMipmapLinearFilter
          object.material.map.anisotropy =
            renderer.capabilities.getMaxAnisotropy()
        }

        object.material = newMaterial
      }
    }
  })

  scene.add(model)
  animationGroup.add(model)

  morphTargetManager = new morphTargetManager(model)
  window.gazeManager = new RPMGazeManager(model, camera, morphTargetManager)

  // Check if the avatar file itself has animations and play the first one
  if (gltf.animations && gltf.animations.length > 0) {
    console.log(`✅ Found ${gltf.animations.length} animations inside ${url}`)
    const clip = gltf.animations[0]
    const action = mixer.clipAction(clip)
    action.play()
  } else {
    console.warn(`⚠️ No embedded animations found in ${url}`)
  }
  // ------------------------------------------------

  return model
}

function filterAnimation(animation) {
  animation.tracks = animation.tracks.filter((track) => {
    const name = track.name
    return name.endsWith("Hips.position") || name.endsWith(".quaternion")
  })
  return animation
}
// ====================================

//===================OPTIMIZE MATERIAL LOADING=================================
function freezeMaterials() {
  scene.traverse((object) => {
    if (object.material) {
      object.material.needsUpdate = false
      object.matrixAutoUpdate = false // Don't recalculate matrix every frame
      object.updateMatrix() // Calculate once, then freeze
    }
  })
}
//=============================================================================

// ========== UI INTERFACE CREATION ==========
function createVoiceInterface() {
  const conversationButton = document.getElementById("btn-view-conversation")
  const conversationHistoryContainer = document.getElementById(
    "conversation-history-container"
  )

  conversationHistoryContainer.style.position = "fixed"
  conversationHistoryContainer.style.pointerEvents = "none"

  if (isMobileEnv()) conversationHistoryContainer.classList.add("mobile")

  conversationHistoryContainer.style.display = "none"

  // Create input controls container at the top
  const inputControls = document.createElement("div")
  inputControls.id = "voice-input-controls"
  inputControls.style.cssText = `
    display: flex;
    gap: 10px;
    padding: 15px;
    background: rgba(255, 255, 255, 0.95);
    border-bottom: 1px solid #ddd;
    align-items: center;
  `
  // Create textbox
  const textInput = document.createElement("input")
  textInput.type = "text"
  textInput.id = "voice-text-input"
  textInput.placeholder = "Type your message..."
  textInput.style.cssText = `
    flex: 1;
    padding: 10px;
    border: 1px solid #ccc;
    border-radius: 5px;
    font-size: 14px;
  `

  // Create send button
  const sendButton = document.createElement("button")
  sendButton.innerHTML = '<i class="fas fa-paper-plane"></i>'
  sendButton.style.cssText = `
    width: 45px;
    height: 45px;
    border-radius: 50%;
    border: none;
    background: #4CAF50;
    color: white;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  `

  // Create microphone button
  const micButton = document.getElementById("push-to-talk").cloneNode(true)
  micButton.style.cssText = `
    width: 45px;
    height: 45px;
    border-radius: 50%;
    border: none;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  `

  inputControls.appendChild(textInput)
  inputControls.appendChild(sendButton)
  inputControls.appendChild(micButton)

  // Insert at the beginning of the modal
  conversationHistoryContainer.insertBefore(
    inputControls,
    conversationHistoryContainer.firstChild
  )

  // Handle text input submission
  textInput.addEventListener("keypress", async (e) => {
    if (e.key === "Enter" && textInput.value.trim() && !isProcessing) {
      const message = textInput.value.trim()
      textInput.value = ""
      await processUserSpeech(message)
    }
  })

  sendButton.onclick = async () => {
    if (textInput.value.trim() && !isProcessing) {
      const message = textInput.value.trim()
      textInput.value = ""
      await processUserSpeech(message)
    }
  }

  conversationButton.addEventListener("click", () => {
    const isHidden = conversationHistoryContainer.style.display === "none"
    if (isHidden) {
      conversationHistoryContainer.style.display = "block"
      conversationHistoryContainer.style.pointerEvents = "auto"
    } else {
      conversationHistoryContainer.style.display = "none"
      conversationHistoryContainer.style.pointerEvents = "none"
    }
  })

  // Microphone button functionality
  micButton.addEventListener("click", () => {
    console.log(
      "Button clicked. Current state - isListening:",
      isListening,
      "isProcessing:",
      isProcessing,
      "isProcessingDetection:",
      isProcessingDetection
    )

    if (isListening) {
      console.log("Stopping listening...")
      if (recognition) {
        recognition.stop()
      }
      isListening = false
      updateVoiceStatus("Stopped listening")
      updatePushToTalkButton()
    } else if (isProcessing || isProcessingDetection) {
      console.log("Stopping speech...")
      if (lipSyncTTS) {
        lipSyncTTS.stop()
      }
      speechSynthesis.cancel()

      const audioElements = document.querySelectorAll("audio")
      audioElements.forEach((audio) => {
        audio.pause()
        audio.currentTime = 0
      })

      isProcessing = false
      isProcessingDetection = false
      updateVoiceStatus("Ready to talk")
      updatePushToTalkButton()
    } else {
      console.log("Starting listening...")
      startListening()
    }
  })

  updateVoiceStatus("...")
  updatePushToTalkButton()
}

function updatePushToTalkButton() {
  const buttons = [
    document.getElementById("push-to-talk"),
    document.querySelector("#voice-input-controls button:last-child"),
  ]

  buttons.forEach((button) => {
    if (button) {
      if (isListening) {
        button.innerHTML = '<i class="fas fa-microphone-slash"></i>'
        button.classList.add("listening")
      } else if (isProcessing) {
        button.innerHTML = '<i class="fas fa-spinner fa-spin"></i>'
        button.classList.remove("listening")
      } else {
        button.innerHTML = '<i class="fas fa-microphone"></i>'
        button.classList.remove("listening")
      }
    }
  })
  updateMainMicrophoneButton()
}
// ================================================================
//============LOAD BACKGROUND ASSETS===============================

async function loadBackground(modelPath) {
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

        // Position the background behind the character
        background.position.set(0, 0, -2) // Negative Z moves it back

        // Rotate by 90 degrees (Math.PI / 2 radians = 90 degrees)
        background.rotation.y = Math.PI

        // Optional: Adjust scale if needed
        // background.scale.set(1, 1, 1)

        scene.add(background)
        console.log("Background loaded successfully")
        resolve(background)
      },
      (progress) => {
        console.log(
          `Loading background: ${(
            (progress.loaded / progress.total) *
            100
          ).toFixed(2)}%`
        )
      },
      (error) => {
        console.error("Error loading background:", error)
        reject(error)
      }
    )
  })
}

//=============================================================
//===============GAZE MANAGER==================================

class RPMGazeManager {
  constructor(model, camera, morphManager) {
    this.model = model
    this.camera = camera
    this.morphManager = morphManager // Uses your existing manager

    this.neck = null
    this.head = null
    this.leftEye = null
    this.rightEye = null

    // Settings
    this.maxHeadRotation = 0.8 // Limit how far head turns
    this.eyeBlinkTimer = 0
    this.nextBlinkTime = 3
    this.isBlinking = false

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
    // 1. LOOK AT LOGIC (Bones)
    if (this.head && this.leftEye && this.rightEye) {
      const targetPos = this.camera.position.clone()

      // --- NECK/HEAD ---
      // We calculate rotation based on camera position
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

        // Smoothly rotate neck (slerp)
        // We use a low factor (2.0 * delta) to make it look heavy/natural
        this.neck.quaternion.slerp(targetQuaternion, 4.0 * delta)

        // Clamp rotation so he doesn't break his neck
        // Adjust these values if he looks too stiff or too loose
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

      // --- EYES ---
      // Eyes track perfectly instantly
      this.leftEye.lookAt(targetPos)
      this.rightEye.lookAt(targetPos)
    }

    // 2. BLINK LOGIC (Using your existing MorphManager)
    this.handleBlink(delta)
  }

  handleBlink(delta) {
    if (!this.morphManager) return

    this.eyeBlinkTimer += delta

    if (this.eyeBlinkTimer >= this.nextBlinkTime) {
      // Start a blink
      this.eyeBlinkTimer = 0
      this.nextBlinkTime = 2 + Math.random() * 4 // Random time 2-6s
      this.performBlink()
    }
  }

  performBlink() {
    // We send the command to your existing manager
    // We set it to 1 (closed)
    this.morphManager.setBlendshape("eyeBlinkLeft", 1)
    this.morphManager.setBlendshape("eyeBlinkRight", 1)

    // Quickly open it back up after 150ms
    setTimeout(() => {
      this.morphManager.setBlendshape("eyeBlinkLeft", 0)
      this.morphManager.setBlendshape("eyeBlinkRight", 0)
    }, 150)
  }
}

//=========================================================

// ========== INITIALIZATION ==========
async function init() {
  // Load the document content first
  await loadDocumentContent()

  const container = document.getElementById("container")

  renderer = new THREE.WebGLRenderer({
    antialias: false,
    alpha: false,
    powerPreference: "high-performance",
    precision: "lowp",
    stencil: false,
    logarithmicDepthBuffer: false,
  })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1))
  renderer.setSize(window.innerWidth, window.innerHeight)
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = THREE.BasicShadowMap
  //renderer.shadowMap.autoUpdate = false
  //renderer.shadowMap.type = THREE.PCFSoftShadowMap

  container.appendChild(renderer.domElement)

  camera = new THREE.PerspectiveCamera(
    39,
    window.innerWidth / window.innerHeight,
    0.1,
    10
  )

  //const controls = new OrbitControls(camera, renderer.domElement)
  //controls.target.set(0, 0.8, 0)
  //controls.update()

  camera.position.set(0, 1.6, 2.3)
  camera.lookAt(0, 0.8, 0)

  clock = new THREE.Clock()
  animationGroup = new THREE.AnimationObjectGroup()
  mixer = new THREE.AnimationMixer(animationGroup)

  animationManager = new AnimationManager(mixer, animationGroup)

  scene = new THREE.Scene()
  scene.background = new THREE.Color(0xffffff)
  //scene.fog = new THREE.Fog(0xc0c0c0, 20, 50)

  const hemiLight = new THREE.HemisphereLight(0xffffff, 0x444444, 0.6)
  hemiLight.position.set(0, 20, 0)
  scene.add(hemiLight)

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
  scene.add(dirLight)

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
  scene.add(groundMesh)

  await loadBackground("/SC_BG.glb")

  lipSyncTTS = await setupLipSyncTTS()

  currentAvatar = await loadAvatar("/Male_Waving_Final.glb")
  freezeMaterials()

  stats = new Stats()
  container.appendChild(stats.dom)

  await setupWebcamFeed()
  setupMainMicrophoneButton()
  setupRefreshButton()

  initSpeechRecognition()
  createVoiceInterface()

  //await loadPredefinedAnimations()

  window.addEventListener("resize", onWindowResize)
  onWindowResize()

  animate()
  getDb()

  startInactivityMonitoring()
}
// ====================================

// ========== WINDOW RESIZE ==========
async function onWindowResize() {
  console.log("window resize....")
  console.log("is mobile environment: ", isMobileEnv())
  console.debug("window width: ", window.innerWidth)
  console.debug("window height: ", window.innerHeight)
  camera.aspect = window.innerWidth / window.innerHeight
  camera.updateProjectionMatrix()

  renderer.setSize(window.innerWidth, window.innerHeight)

  camera.position.set(0, 1.2, 3)
  camera.lookAt(0, 1, 0)
}
// ===================================

// ========== ANIMATION LOOP ==========
function animate() {
  requestAnimationFrame(animate)

  const mixerUpdateDelta = clock.getDelta()

  mixer.update(mixerUpdateDelta)

  if (morphTargetManager) {
    morphTargetManager.update(mixerUpdateDelta)
  }

  if (window.gazeManager) {
    window.gazeManager.update(mixerUpdateDelta)
  }

  stats.update()

  renderer.render(scene, camera)
}
// ====================================

// ========== INITIALIZATION CALL ==========
await init()

if (document.querySelector("#buttonOpen"))
  document.querySelector("#buttonOpen").addEventListener("click", openIframe)
// =========================================
