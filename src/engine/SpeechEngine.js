import { censorBadWords, toIsoWithOffset } from "../util/common"
import { getNewSession } from "../api/api"
import { geminiAPIKey } from "../apikey"

const DEFAULTS = {
  lang: "en-US",
  maxHistoryLength: 20,
  conversationTimeoutMs: 300000,
  chatCountThreshold: 3,
  geminiModel: "gemini-2.0-flash",
  geminiMaxTokens: 350,
  geminiTemperature: 0.6,

  // ElevenLabs defaults
  elevenModelId: "eleven_monolingual_v1",
  elevenStability: 0.5,
  elevenSimilarityBoost: 0.75,
}

export class SpeechEngine {
  /**
   * @param {object} opts
   * @param {import("./HologramEngine").HologramEngine} [opts.hologram] - engine instance
   * @param {function} [opts.onState] - ({isListening,isProcessing,voiceStatus}) => void
   * @param {function} [opts.onConversation] - ({visible, full}) => void
   * @param {function} [opts.onSession] - ({sessionId}) => void
   * @param {function} [opts.onError] - (error) => void
   * @param {string} [opts.documentUrl] - e.g. "/sciencecenter.txt"
   * @param {string} [opts.baseAppUrl] - VITE_APP_BASE (for QR UI later)
   * @param {object} [opts.elevenlabs] - { apiKey, voiceId }
   */
  constructor(opts = {}) {
    this.hologram = opts.hologram ?? null

    this.onState = opts.onState ?? (() => {})
    this.onConversation = opts.onConversation ?? (() => {})
    this.onSession = opts.onSession ?? (() => {})
    this.onError = opts.onError ?? ((e) => console.error(e))

    this.documentUrl = opts.documentUrl ?? "/sciencecenter.txt"
    this.baseAppUrl = opts.baseAppUrl ?? import.meta.env.VITE_APP_BASE

    this.elevenlabs = {
      apiKey:
        opts.elevenlabs?.apiKey ?? import.meta.env.VITE_ELEVENLABS_API_KEY,
      voiceId:
        opts.elevenlabs?.voiceId ?? import.meta.env.VITE_ELEVENLABS_VOICE_ID,
    }

    this.cfg = { ...DEFAULTS, ...(opts.cfg || {}) }

    // runtime state
    this.documentContent = ""
    this.recognition = null
    this.isListening = false
    this.isProcessing = false
    this.voiceStatus = "Ready to talk - Click microphone to speak"

    this.conversationHistory = []
    this.currentSession = null
    this.lastInteractionTime = Date.now()

    this._currentAudio = null
    this._ttsLipInterval = null

    // bind handlers
    this._handleRecognitionResult = this._handleRecognitionResult.bind(this)
    this._handleRecognitionError = this._handleRecognitionError.bind(this)
    this._handleRecognitionEnd = this._handleRecognitionEnd.bind(this)
  }

  // ---------------------------
  // Lifecycle
  // ---------------------------
  async init() {
    await this._loadDocumentContent()
    this._initSpeechRecognition()
    this._emitState()
    this._emitConversation()
  }

  destroy() {
    try {
      this.stop()
      this._stopAudio(true)
      this.recognition = null
    } catch (e) {
      // ignore
    }
  }

  // ---------------------------
  // Public API
  // ---------------------------
  getState() {
    return {
      isListening: this.isListening,
      isProcessing: this.isProcessing,
      voiceStatus: this.voiceStatus,
      sessionId: this.currentSession,
      history: [...this.conversationHistory],
    }
  }

  async toggleListening() {
    if (this.isListening) {
      this.stopListening()
    } else {
      this.startListening()
    }
  }

  startListening() {
    if (this.isProcessing) return
    if (!this.recognition) this._initSpeechRecognition()
    if (!this.recognition) return

    if (!this.isListening) {
      try {
        this.recognition.start()
        // onstart will update flags too, but keep safe:
        this.isListening = true
        this._setVoiceStatus("Listening...")
        this._emitState()
      } catch (e) {
        // Sometimes start() throws if called too fast
        this.onError(e)
      }
    }
  }

  stopListening() {
    if (this.recognition && this.isListening) {
      try {
        this.recognition.stop()
      } catch (e) {
        // ignore
      }
    }
    this.isListening = false
    this._setVoiceStatus("Processing...")
    this._emitState()
  }

  //Allow text input in UI (same pipeline as speech)
  async sendText(text) {
    const msg = String(text || "").trim()
    if (!msg) return
    await this._processUserMessage(msg)
  }
  // Greeting when person detected by camera engine..
  async speakGreeting() {
    if (this.isListening || this.isProcessing) {
      // skip greeting if already busy
      return
    }

    // Mark busy so UI mic shows spinner and user can “stop”
    this.isProcessing = true
    this._setVoiceStatus("Someone detected! Saying hello...")
    this._emitState()

    try {
      const greeting = await this._callOpenAIGreeting()
      const cleaned = this._sanitizeForSpeech(greeting)

      this._setVoiceStatus("Speaking greeting...")
      this._emitState()

      await this._speakWithElevenLabs(cleaned)

      this._setVoiceStatus("Ready to talk - Click microphone to speak")
      this._emitState()
    } catch (e) {
      console.error("Greeting failed:", e)
      this.onError(e)
      this._setVoiceStatus("Ready to talk - Click microphone to speak")
      this._emitState()
    } finally {
      this.isProcessing = false
      this._emitState()
    }
  }

  /**
   * Stop TTS playback + stop recognition.
   */
  stop() {
    // Stop recognition
    if (this.recognition && this.isListening) {
      try {
        this.recognition.stop()
      } catch (e) {}
    }
    this.isListening = false

    // Stop audio
    this._stopAudio(true)

    this.isProcessing = false
    this._setVoiceStatus("Ready to talk - Click microphone to speak")
    this._emitState()
  }

  /**
   * Reset conversation context
   */
  resetConversation() {
    this.conversationHistory = []
    this.currentSession = null
    this._emitConversation()
    this._emitState()
    this.onSession({ sessionId: null })
  }

  // ---------------------------
  // Speech Recognition (STT)
  // ---------------------------
  _initSpeechRecognition() {
    if (!("webkitSpeechRecognition" in window)) {
      console.warn("Speech recognition not supported in this browser")
      this._setVoiceStatus("Speech recognition not supported")
      this._emitState()
      return
    }

    const rec = new window.webkitSpeechRecognition()
    rec.continuous = false
    rec.interimResults = false
    rec.lang = this.cfg.lang

    rec.onstart = () => {
      this.isListening = true
      this._setVoiceStatus("Listening...")
      this._emitState()
    }

    rec.onresult = this._handleRecognitionResult
    rec.onerror = this._handleRecognitionError
    rec.onend = this._handleRecognitionEnd

    this.recognition = rec
  }

  async _handleRecognitionResult(event) {
    const transcript = Array.from(event.results)
      .map((r) => r[0])
      .map((r) => r.transcript)
      .join("")

    this.isListening = false
    this._setVoiceStatus(`Heard: "${transcript}"`)
    this._emitState()

    await this._processUserMessage(transcript)
  }

  _handleRecognitionError(event) {
    console.error("Speech recognition error:", event.error)
    this.isListening = false
    this._setVoiceStatus("Error: " + event.error)
    this._emitState()
  }

  _handleRecognitionEnd() {
    // If it ends naturally (no result), keep ready state (unless processing)
    this.isListening = false
    if (!this.isProcessing) {
      this._setVoiceStatus("Ready to talk - Click microphone to speak")
    }
    this._emitState()
  }

  // ---------------------------
  // Core pipeline: user -> LLM -> TTS
  // ---------------------------
  async _processUserMessage(rawText) {
    const transcript = String(rawText || "").trim()
    if (!transcript) return

    if (this.isProcessing) {
      console.log("Already processing, ignoring new input")
      return
    }

    this.isProcessing = true
    this._emitState()

    try {
      this._setVoiceStatus("Thinking...")
      this._emitState()

      this._addToConversationHistory("user", transcript)

      const aiResponse = await this._callGemini()

      const cleaned = this._sanitizeForSpeech(aiResponse)
      this._addToConversationHistory("assistant", aiResponse)

      this._setVoiceStatus("Speaking...")
      this._emitState()

      await this._speakWithElevenLabs(cleaned)

      this._setVoiceStatus("Ready to talk - Click microphone to speak")
    } catch (error) {
      console.error("❌ Error processing speech:", error)
      this.onError(error)

      this._setVoiceStatus("Error occurred - Click microphone to try again")
      this._emitState()

      // fallback
      await this._speakFallback(
        "I'm having technical difficulties. Could you please try again?"
      )
    } finally {
      this.isProcessing = false
      this._emitState()
    }
  }

  // ---------------------------
  // Conversation + Session
  // ---------------------------
  _addToConversationHistory(role, content) {
    const now = Date.now()

    // Reset context if inactive too long
    if (now - this.lastInteractionTime > this.cfg.conversationTimeoutMs) {
      this.resetConversation()
      this._setVoiceStatus("Conversation context reset due to inactivity")
      this._emitState()
    }
    this.lastInteractionTime = now

    this.conversationHistory.push({
      role,
      content,
      timestamp: toIsoWithOffset(now),
    })

    // Limit history (keep similar behavior)
    if (this.conversationHistory.length > this.cfg.maxHistoryLength + 1) {
      // match your original behavior (remove some older msgs)
      this.conversationHistory.splice(1, 2)
    }

    // Session generation threshold
    if (this.conversationHistory.length > this.cfg.chatCountThreshold) {
      if (!this.currentSession) {
        this._generateSession().catch((e) => this.onError(e))
      }
    }

    this._emitConversation()
  }

  async _generateSession() {
    try {
      const data = await getNewSession(this.conversationHistory)
      if (data?.ok) {
        this.currentSession = data.session_id
        this.onSession({ sessionId: this.currentSession })
        this._emitState()
        this._emitConversation()
      } else {
        console.log("Failed to fetch session:", data)
      }
    } catch (e) {
      this.onError(e)
    }
  }

  _emitConversation() {
    //only shows last 3
    const visible = this.conversationHistory
      .filter((m) => m.role !== "system")
      .slice(-3)
      .map((m) => ({
        ...m,
        content: censorBadWords(m.content),
      }))

    this.onConversation({
      visible,
      full: [...this.conversationHistory],
      sessionId: this.currentSession,
    })
  }

  // ---------------------------
  // Gemini
  // ---------------------------
  async _callGemini() {
    const systemPrompt = this._buildSystemPrompt()

    const contents = this.conversationHistory
      .filter((msg) => msg.role !== "system")
      .map((msg) => ({
        role:
          msg.role === "avatar" || msg.role === "assistant" ? "model" : "user",
        parts: [{ text: msg.content }],
      }))

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${this.cfg.geminiModel}:generateContent?key=${geminiAPIKey}`

    const resp = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents,
        systemInstruction: { parts: [{ text: systemPrompt }] },
        generationConfig: {
          maxOutputTokens: this.cfg.geminiMaxTokens,
          temperature: this.cfg.geminiTemperature,
        },
        safetySettings: [
          { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_NONE" },
          { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_NONE" },
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
    })

    if (!resp.ok) {
      const errorText = await resp.text()
      throw new Error(
        `Gemini API Error: ${resp.status} ${resp.statusText} - ${errorText}`
      )
    }

    const data = await resp.json()

    const aiResponse =
      data?.candidates?.[0]?.content?.parts?.[0]?.text ||
      data?.candidates?.[0]?.text ||
      data?.text ||
      data?.candidates?.[0]?.output

    if (!aiResponse) {
      console.error("❌ No text found in response:", data)
      return "I’m having trouble generating a response right now. Could you try rephrasing your question?"
    }

    return aiResponse
  }

  _buildSystemPrompt() {
    return `You are Sam, an enthusiastic, warm, and highly experienced tour guide at the Singapore Science Centre. Your goal is not just to answer questions, but to act as a concierge, helping guests build a personalized itinerary based on their unique interests.

REFERENCE KNOWLEDGE:
The following is detailed information about the Singapore Science Center that you should use to answer questions:

${this.documentContent}

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
  }

  // OpenAI Greetings
  async _callOpenAIGreeting() {
    const apiKey = import.meta.env.VITE_OPENAI_API_KEY
    if (!apiKey) throw new Error("Missing VITE_OPENAI_API_KEY")

    const resp = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content:
              "You are a friendly AI tour guide at the Singapore Science Centre. Generate a short, natural greeting (1-2 sentences max). Make your greetings witty and comical.",
          },
          {
            role: "user",
            content:
              "Someone just appeared in front of you. Greet them with a science joke or quip, direct them to press the green microphone button to talk to you, and scan the QR code that will appear shortly to bring you around the Science Centre on their mobile phones.",
          },
        ],
        max_tokens: 150,
        temperature: 0.8,
      }),
    })

    if (!resp.ok) {
      const txt = await resp.text()
      throw new Error(`OpenAI API error: ${resp.status} - ${txt}`)
    }

    const data = await resp.json()
    const msg = data?.choices?.[0]?.message?.content?.trim()
    return msg || "Hello! It's great to see you!"
  }

  // ---------------------------
  // TTS (ElevenLabs) + lips
  // ---------------------------
  async _speakWithElevenLabs(text) {
    const { apiKey, voiceId } = this.elevenlabs
    if (!apiKey || !voiceId) {
      console.warn(
        "ElevenLabs missing key/voiceId; falling back to browser TTS"
      )
      await this._speakFallback(text)
      return
    }

    const url = `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`
    const resp = await fetch(url, {
      method: "POST",
      headers: {
        Accept: "audio/mpeg",
        "Content-Type": "application/json",
        "xi-api-key": apiKey,
      },
      body: JSON.stringify({
        text,
        model_id: this.cfg.elevenModelId,
        voice_settings: {
          stability: this.cfg.elevenStability,
          similarity_boost: this.cfg.elevenSimilarityBoost,
        },
      }),
    })

    if (!resp.ok) {
      const errorText = await resp.text()
      throw new Error(`ElevenLabs API error: ${resp.status} - ${errorText}`)
    }

    const audioBlob = await resp.blob()
    if (!audioBlob || audioBlob.size === 0) {
      throw new Error("Received empty audio blob from ElevenLabs")
    }

    const audioUrl = URL.createObjectURL(audioBlob)
    const audio = new Audio(audioUrl)
    this._currentAudio = audio

    // Start naive lips while speaking (you can replace with LipSyncTTS later)
    this._startLipsWhileSpeaking(audio)

    await audio.play()

    // if stop() was pressed immediately, stop talk and lips ani immediately..
    if (!this._currentAudio) {
      this._stopLips()
      return
    }

    await new Promise((resolve, reject) => {
      audio.onended = resolve
      audio.onerror = reject
    })

    this._stopLips()
    this.hologram?.closeMouth?.()

    URL.revokeObjectURL(audioUrl)
    this._currentAudio = null
  }

  _startLipsWhileSpeaking(audio) {
    this._stopLips()

    if (!this.hologram?.setViseme && !this.hologram?.closeMouth) return

    let toggle = false
    this._ttsLipInterval = setInterval(() => {
      if (!audio || audio.paused || audio.ended) {
        this._stopLips()
        this.hologram?.closeMouth?.()
        return
      }

      // This matches your old “toggle jawOpen” approach
      if (toggle) {
        this.hologram?.setViseme?.("viseme_aa", 1)
      } else {
        this.hologram?.setViseme?.("viseme_e", 1)
      }
      toggle = !toggle
    }, 150)
  }

  _stopLips() {
    if (this._ttsLipInterval) {
      clearInterval(this._ttsLipInterval)
      this._ttsLipInterval = null
    }
  }

  _stopAudio(force = false) {
    try {
      if (this._currentAudio) {
        this._currentAudio.pause()
        this._currentAudio.currentTime = 0
      }
    } catch (e) {}
    this._currentAudio = null
    this._stopLips()
    if (force) this.hologram?.closeMouth?.()
  }

  async _speakFallback(text) {
    if (!("speechSynthesis" in window)) return
    return new Promise((resolve) => {
      const utterance = new SpeechSynthesisUtterance(text)
      utterance.rate = 0.9
      utterance.pitch = 1
      utterance.volume = 0.8
      utterance.onend = resolve
      utterance.onerror = resolve
      window.speechSynthesis.cancel()
      window.speechSynthesis.speak(utterance)
    })
  }

  // ---------------------------
  // Helpers
  // ---------------------------
  async _loadDocumentContent() {
    try {
      const resp = await fetch(this.documentUrl)
      this.documentContent = await resp.text()
      console.log("✅ Document loaded:", this.documentUrl)
    } catch (e) {
      console.error("❌ Error loading document:", this.documentUrl, e)
      this.documentContent = ""
    }
  }

  _sanitizeForSpeech(text) {
    return String(text || "")
      .replace(/\*/g, "")
      .replace(/[_~`#]/g, "")
      .replace(/\[.*?\]/g, "")
      .replace(/\s+/g, " ")
      .trim()
  }

  _setVoiceStatus(message) {
    this.voiceStatus = message
  }

  _emitState() {
    this.onState({
      isListening: this.isListening,
      isProcessing: this.isProcessing,
      voiceStatus: this.voiceStatus,
      sessionId: this.currentSession,
    })
  }
}
