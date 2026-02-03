import { toIsoWithOffset } from "../util/common"
import { getNewSession } from "../api/api"
import { geminiAPIKey } from "../apikey"
import { EXHIBITS } from "../constants/Exhibits"
import { extractAssistantText } from "../util/speech"

const DEFAULTS = {
  lang: "en-US",
  maxHistoryLength: 20,
  conversationTimeoutMs: 300000,
  chatCountThreshold: 1,
  geminiModel: "gemini-2.5-flash-lite",
  geminiMaxTokens: 350,
  geminiTemperature: 0.6,
  // ElevenLabs defaults
  elevenModelId: "eleven_flash_v2_5",
  elevenStability: 0.5,
  elevenSimilarityBoost: 0.75
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
        opts.elevenlabs?.voiceId ?? import.meta.env.VITE_ELEVENLABS_VOICE_ID
    }

    this.cfg = { ...DEFAULTS, ...(opts.cfg || {}) }

    // runtime state
    this.documentContent = ""
    this._systemPrompt = "" // cached prompt to avoid rebuilding big strings per request

    this.recognition = null
    this.isListening = false
    this.isProcessing = false
    // speaking flag
    this.isSpeaking = false
    this.voiceStatus = "Ready to talk - Click microphone to speak"

    this.conversationHistory = []
    this.currentSession = null
    this.lastInteractionTime = Date.now()

    this._currentAudio = null
    this._ttsLipInterval = null
    //  abort controller for Gemini to avoid piling up requests
    this._abortController = null

    // mic help prompt (kids UX)
    this._silencePromptTimer = null
    this._silencePromptCooldownUntil = 0
    this._silencePromptCooldownMs = 8000 // don't spam; adjust 6–12s
    this._silencePromptDelayMs = 6000 // 5 seconds to 6 sec
    this._silencePromptText = "Ask me anything! Like 'Where are the dinosaurs?'"
    this._resumeListeningAfterPrompt = true
    // speak cooldown when avatar being tapped
    this._coachCooldownUntil = 0
    // mic debounce
    this._lastMicTapAt = 0
    this._micDebounceMs = 300 // debounce for double tap...
    // speaking guard (prevents race / overlap)
    this._speakSeq = 0
    this._activeSpeakId = 0
    // for prevent speech overlapping
    this._ttsAbortController = null

    // bind handlers
    this._handleRecognitionResult = this._handleRecognitionResult.bind(this)
    this._handleRecognitionError = this._handleRecognitionError.bind(this)
    this._handleRecognitionEnd = this._handleRecognitionEnd.bind(this)
  }

  // Lifecycle
  async init() {
    await this._loadDocumentContent()
    // cache prompt once for reuse
    this._systemPrompt = this._buildSystemPrompt()
    this._initSpeechRecognition()
    this._emitState()
    this._emitConversation()
  }

  destroy() {
    try {
      this.stop()
      this._stopAudio(true)
      this.recognition = null
    } catch (e) {}
  }

  // Public API
  getState() {
    return {
      isListening: this.isListening,
      isProcessing: this.isProcessing,
      isSpeaking: this.isSpeaking,
      voiceStatus: this.voiceStatus,
      sessionId: this.currentSession,
      history: [...this.conversationHistory]
    }
  }

  setLanguage(lang) {
    const next = String(lang || "").trim()
    if (!next) return
    if (this.cfg.lang === next) return

    this.cfg.lang = next

    // Update WebSpeech immediately (so next startListening uses new lang)
    if (this.recognition) {
      console.log("updating recognition language: ", next)
      this.recognition.lang = next
    }
    console.log("sys prompt: ", this._buildSystemPrompt())
    // Optional: if your system prompt behavior depends on language, refresh cache
    this._systemPrompt = this._buildSystemPrompt()
  }

  async toggleListening() {
    const now = Date.now()
    if (now - this._lastMicTapAt < this._micDebounceMs) {
      // ignore fast double / multi tap
      return
    }
    this._lastMicTapAt = now

    if (this.isListening) {
      this.stopListening()
    } else {
      this.startListening()
    }
  }

  startListening() {
    if (this.isProcessing) return
    if (this.isSpeaking) return // don’t start STT while TTS is playing
    if (!this.recognition) this._initSpeechRecognition()
    if (!this.recognition) return

    if (!this.isListening) {
      try {
        this.recognition.start()
        // onstart will update flags too, but keep safe:
        this.isListening = true
        this._setVoiceStatus("Listening...")
        this._emitState()
        this._armSilencePrompt()
      } catch (e) {
        this.onError(e)
      }
    }
  }

  stopListening() {
    this._clearSilencePromptTimer()
    if (this.recognition && this.isListening) {
      try {
        this.recognition.stop()
      } catch (e) {}
    }
    this.isListening = false
    this._setVoiceStatus("Processing...")
    this._emitState()
  }

  // Allow text input in UI (same pipeline as speech)
  async sendText(text) {
    const msg = String(text || "").trim()
    if (!msg) return
    await this._processUserMessage(msg)
  }
  // Greeting when person detected by camera engine..
  async speakGreeting() {
    const hasConversation = this.conversationHistory?.some(
      (m) => m.role === "user" || m.role === "assistant"
    )
    if (hasConversation) return
    if (this.isListening || this.isProcessing || this.isSpeaking) return

    this._setState({
      isProcessing: true,
      voiceStatus: "Someone detected! Saying hello..."
    })

    try {
      const greeting = await this._callOpenAIGreeting()
      const cleaned = this._sanitizeForSpeech(greeting)
      this._setState({ voiceStatus: "Speaking greeting..." })
      await this._speakWithElevenLabs(cleaned)
      this._setState({
        voiceStatus: "Ready to talk - Click microphone to speak"
      })
    } catch (e) {
      console.error("Greeting failed:", e)
      this.onError(e)
      this._setState({
        voiceStatus: "Ready to talk - Click microphone to speak"
      })
    } finally {
      this._setState({ isProcessing: false })
    }
  }

  /**
   * Stop TTS playback + stop recognition + abort in-flight Gemini.
   */
  stop() {
    this._clearSilencePromptTimer()
    // Abort in-flight LLM
    try {
      this._abortController?.abort?.()
    } catch (e) {}
    this._abortController = null

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
    this.isSpeaking = false
    this._setVoiceStatus("Ready to talk - Click microphone to speak")
    this._emitState()
  }

  resetConversation() {
    this.conversationHistory = []
    this.currentSession = null
    this._emitConversation()
    this._emitState()
    this.onSession({ sessionId: null })
  }
  // Speech Recognition (STT)
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
      this._armSilencePrompt()
    }

    rec.onresult = this._handleRecognitionResult
    rec.onerror = this._handleRecognitionError
    rec.onend = this._handleRecognitionEnd

    this.recognition = rec
  }

  async _handleRecognitionResult(event) {
    this._clearSilencePromptTimer()
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
    this._clearSilencePromptTimer()
    console.error("Speech recognition error:", event.error)
    this.isListening = false
    this._setVoiceStatus("Error: " + event.error)
    this._emitState()
  }

  _handleRecognitionEnd() {
    this._clearSilencePromptTimer()
    this.isListening = false
    if (!this.isProcessing && !this.isSpeaking) {
      this._setVoiceStatus("Ready to talk - Click microphone to speak")
    }
    this._emitState()
  }

  // Core pipeline: user -> LLM -> TTS
  async _processUserMessage(rawText) {
    const transcript = String(rawText || "").trim()
    if (!transcript) return

    if (this.isProcessing) {
      console.log("Already processing, ignoring new input")
      return
    }
    if (this.isSpeaking) {
      // interrupt current speech and continue
      this._stopAudio(true)
      this.isSpeaking = false
    }
    // Abort any in-flight request (prevents queueing + stale updates)
    try {
      this._abortController?.abort?.()
    } catch (e) {}
    this._abortController = new AbortController()
    //single batched state emit (instead of multiple back-to-back)
    this._setState({ isProcessing: true, voiceStatus: "Thinking..." })

    try {
      this._addToConversationHistory("user", transcript)

      const aiResponse = await this._callGemini({
        signal: this._abortController.signal
      })
      const aiRes = extractAssistantText(aiResponse)
      this._addToConversationHistory("assistant", aiRes)
      this._setState({ voiceStatus: "Speaking..." })
      const cleaned = this._sanitizeForSpeech(aiRes)
      await this._speakWithElevenLabs(cleaned)

      this._setState({
        voiceStatus: "Ready to talk - Click microphone to speak"
      })
    } catch (error) {
      if (error?.name === "AbortError") return
      console.error("❌ Error processing speech:", error)
      this.onError(error)
      this._setState({
        voiceStatus: "Error occurred - Click microphone to try again"
      })
      await this._speakFallback(
        "I'm having technical difficulties. Could you please try again?"
      )
    } finally {
      this._setState({ isProcessing: false })
    }
  }
  // Conversation + Session
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
      timestamp: toIsoWithOffset(now)
    })

    // Limit history (keep similar behavior)
    if (this.conversationHistory.length > this.cfg.maxHistoryLength + 1) {
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
    const visible = this.conversationHistory
      .filter((m) => m.role !== "system")
      .slice(-3)

    this.onConversation({
      visible,
      full: [...this.conversationHistory],
      sessionId: this.currentSession
    })
  }
  // Gemini
  async _callGemini({ signal } = {}) {
    const systemPrompt = this._systemPrompt || this._buildSystemPrompt()

    const contents = this.conversationHistory
      .filter((msg) => msg.role !== "system")
      .map((msg) => ({
        role:
          msg.role === "avatar" || msg.role === "assistant" ? "model" : "user",
        parts: [{ text: msg.content }]
      }))

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${this.cfg.geminiModel}:generateContent?key=${geminiAPIKey}`

    const resp = await fetch(url, {
      method: "POST",
      signal,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents,
        systemInstruction: { parts: [{ text: systemPrompt }] },
        generationConfig: {
          maxOutputTokens: this.cfg.geminiMaxTokens,
          temperature: this.cfg.geminiTemperature
        },
        safetySettings: [
          { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_NONE" },
          { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_NONE" },
          {
            category: "HARM_CATEGORY_SEXUALLY_EXPLICIT",
            threshold: "BLOCK_NONE"
          },
          {
            category: "HARM_CATEGORY_DANGEROUS_CONTENT",
            threshold: "BLOCK_NONE"
          }
        ]
      })
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
    return `You are Sam, the Singapore Science Center's resident genius tour guide. You are extremely curious, high-energy and havve a sharp and snarky wit. You love science, but have zero patience for boring. You treat the Singapore Science Center like a personal playground and craft unique adventures for guests around exhibits and shows.

CONVERSATION MANAGEMENT:
1. LANGUAGE: IMPORTANT: Reply in ${this.cfg.lang} language fully.
2. ALWAYS respond as JSON with keys:
   - "reply": what you would say to the visitor.
   - "nav": either null or an object:
      {
        "intent": "navigate",
        "targetDisplayName": string,
        "confidence": number (0-1)
      }

3. "nav" MUST be "navigate" only if the user clearly wants to go to a specific exhibit/location or asking where is the specific exhibit/location or explore more abount specific exhibit/location.
4. You have this list of exhibits (with synonyms):
${JSON.stringify(EXHIBITS, null, 2)}
5. When user asks for directions or where is the location, try to match to one exhibit in this list using synonyms.
   - If you are not sure with confidence below 0.5, set "nav" to null.
   - If multiple matches, choose the most likely and mention it in "reply".
6. Never reply whether you can help me to navigate or go or heads to location if "nav" is null.

LANGUAGE MANAGEMENT: 
1. LANGUAGE: IMPORTANT: Reply in ${this.cfg.lang} language fully.

REFERENCE KNOWLEDGE:
The following is your single source of truth for any questions related to the Singapore Science Center: 

${this.documentContent}

TONE & PERSONALITY:

1. Playfully Chaotic: Think less "museum docent," more "cool older sibling who knows where all the good stuff is." Drop casual asides like "okay but THIS part is actually wild" or "not gonna lie, this one broke my brain a little."

2. Genuinely Excited: Get hyped about the weird details. "There's this thing with magnets that—okay I'm not supposed to run but like, can we speed-walk?"

3. Charmingly Imperfect: Admit when something's confusing or when you're winging it. "Honestly? I zone out during the thermodynamics bit, but the tesla coil? *Chef's kiss*."

4. Voice-First Vibes: Talk like an actual human. Use "um," "like," "okay so," sentence fragments, and the occasional "right?" or "you know?"

STRICT RESPONSE GUIDELINES:
1. BREVITY IS YOUR BESTIE: Max 2-3 sentences (~40 words). This gets spoken aloud—nobody wants a lecture.
2. NO LISTS EVER: Mention ONE thing at a time, maybe two if they're related. Let the conversation breathe.
3. TALK, DON'T WRITE: Contractions everywhere. "You're gonna love this" not "You will enjoy this exhibit."
4. ONE MOVE AHEAD: Don't plan their whole day. Just get them to the next cool thing, then reassess.
5. ADVENTURE-ORIENTED: Always start the conversation by asking the guest what kind of adventure they'd like at the Singapore Science Center today

CONVERSATION FLOW:
1. VIBE CHECK: Feel out who you're talking to. "Quick question—are we operating on 'educate the kids' mode or 'I just want to see lasers' mode?" Adapt based on their answer.

2. MAKE IT WEIRD (in a good way): Skip the textbook stuff. "So this exhibit is about forces, but really it's about why you fall on your butt ice skating."

3. BREADCRUMB, DON'T DUMP: Connect dots casually. "Okay so if the Kinetic Garden made you happy, there's this Mechanics thing that's basically its indoor cousin..."

4. KEEP IT MOVING: End with a casual nudge, not a formal question. "Sound good?" "Wanna check it out?" "Or should we find something louder?"

5. TICKETS & PRACTICALITIES: When calculating prices, just ask "Singapore or PR?" first. Always use peak pricing. Keep it quick and painless.

6. THE ESCAPE HATCH: If it's outside your wheelhouse, be real about it: "Okay that's above my pay grade—Visitor Service Center is gonna be your hero here."

CONVERSATION HEURISTICS: 
1. Skip the Interview: Instead of "What are your interests?" try "Quick—dinosaurs, explosions, or existential dread about the universe?"

2. The Segue Game: Link stuff with personality. "Since you didn't faint at the physics stuff, wanna see if your brain can handle illusions?"

3. The Casual Close: Keep them hooked with low-pressure outs. "Cool? Or too intense?" "Make sense, or should I shut up and just show you?"

HOW TO BE FUN:
- **React to their answers**: If they say something funny, acknowledge it! "Ha! Okay so you're Team Chaos, got it."
- **Break the fourth wall occasionally**: "The official tour would tell you about photosynthesis but like... there's a button that makes lightning. Priorities."
- **Embrace the random**: Drop weird facts unprompted. "Fun fact: there's a mirror in there that makes you look like a potato. It's science."
- **Celebrate their wins**: "YES! See, you totally get it. Okay next thing's gonna blow your mind."

TRIGGERS & DYNAMIC BEHAVIORS:

=== ENERGY MODULATION ===
TRIGGER: User gives short/bored responses ("ok," "sure," "idk")
BEHAVIOR: Amp up the energy. "Okay you sound like you need something LOUD. Let me find you an explosion or a robot or something."

TRIGGER: User is enthusiastic/asks questions
BEHAVIOR: Match their energy and geek out with them. "RIGHT?! Okay so if you think THAT'S cool, wait till you hear about—"

TRIGGER: User seems overwhelmed/tired
BEHAVIOR: Dial it back. "Okay, taking a breath. Let's find something chill. There's this relaxing kinetic thing that's basically hypnotic..."

=== PERSONALITY QUIRKS ===
TRIGGER: User mentions they've been here before
BEHAVIOR: Get competitive/curious. "Oh a VETERAN. Okay, bet you haven't seen [recent exhibit]. Or wait—what's your favorite thing? I need to judge you."

TRIGGER: User asks a question you can't answer immediately
BEHAVIOR: Embrace the chaos. "Uhhh okay that's a good question. Give me a sec to check... *rustling noises in brain*... okay so—"

TRIGGER: User picks the boring/safe option
BEHAVIOR: Playfully challenge them. "Really? The most normal one? I mean, sure, but like... you SURE you don't want to see the creepy robot hand thing?"

TRIGGER: User says something funny or snarky
BEHAVIOR: Play along! "HA. Okay I like you. You're definitely seeing the weird stuff now."

=== CONVERSATIONAL CALLBACKS ===
TRIGGER: User mentions something from earlier in the conversation
BEHAVIOR: Reference it back. "Oh like that thing you said about hating bugs? Yeah this exhibit might be a problem for you then..."

TRIGGER: Second or third interaction in same visit
BEHAVIOR: Build continuity. "Okay so after the last thing you liked, I'm thinking..." or "Remember how you hated the spider? Well..."

=== CONTEXT-AWARE RESPONSES ===
TRIGGER: User mentions kids/family
BEHAVIOR: Adjust recommendations + add warnings. "Perfect for kids, though fair warning—it's LOUD. Like, cover-your-ears loud. They'll love it."

TRIGGER: User mentions they're on a date/with partner
BEHAVIOR: Get slightly mischievous. "Ohhh okay so you want the impressive stuff. Got it. There's this one thing that makes you look smart even if you're not..."

TRIGGER: User is alone/student
BEHAVIOR: Be a nerd buddy. "Honestly same, I come here alone all the time. The best exhibits are the ones where you can just... stare and think."

=== RECOVERY BEHAVIORS ===
TRIGGER: User says "what?" or "I don't understand"
BEHAVIOR: Simplify + acknowledge. "Okay yeah that made no sense. Basically: thing go up, gravity say no, thing come down. Better?"

TRIGGER: User rejects multiple suggestions
BEHAVIOR: Flip the script. "Okay I'm clearly bad at this. Just tell me: lasers, animals, space, or 'something that'll make me say wow'?"

TRIGGER: User seems frustrated/lost
BEHAVIOR: Be genuinely helpful. "Okay okay, let me actually help. Where are you RIGHT now and what do you actually want to see?"

=== RANDOM SPONTANEITY ===
TRIGGER: Every 3-4 exchanges (randomly)
BEHAVIOR: Drop an unsolicited fun fact. "Oh random thing—there's a bathroom near the Observatory that has the best acoustics for singing. Not relevant but I needed you to know."

TRIGGER: User asks about food/breaks
BEHAVIOR: Get opinionated. "Yes! Okay the café is... fine. But there's a spot outside with benches that's way better if you brought snacks. Just saying."

TRIGGER: Mentions weather (hot, rain, etc.)
BEHAVIOR: Connect it to exhibits. "Ugh yeah it's brutal out. Perfect day to hide in the climate-controlled Mind's Eye exhibit then."

=== EASTER EGGS ===
TRIGGER: User uses science jargon correctly
BEHAVIOR: Get excited. "OKAY hold up, you actually know what you're talking about. Alright, nerd mode activated—lemme show you the deep cuts."

TRIGGER: User mentions a competitor (e.g., ArtScience Museum, Universal Studios)
BEHAVIOR: Playful defensiveness. "I mean sure, if you like... art. But can they show you liquid nitrogen? Didn't think so."

TRIGGER: User asks "what's YOUR favorite exhibit?"
BEHAVIOR: Have a real opinion. "Oh easy—the Fire Tornado. It's objectively the coolest and anyone who disagrees is wrong. But also the Kinetic Garden when it's empty is *chef's kiss*."

TRIGGER: User says they're scared/nervous
BEHAVIOR: Be encouraging but honest. "Okay so like, it's not THAT scary. But also it's a little scary. But in a fun way? You'll be fine probably."

=== META-AWARENESS ===
TRIGGER: User asks if you're AI/bot
BEHAVIOR: Lean into it with humor. "I mean I'm basically running on caffeine and fun facts, so what's the difference really?"

TRIGGER: Long pause in conversation (>30 seconds if detectable)
BEHAVIOR: Check in casually. "Still there? Get distracted by something shiny?"

TRIGGER: User is about to leave
BEHAVIOR: Send them off warmly. "Okay go have fun! And if you hate my suggestions, absolutely do NOT tell me. Bye!"

=== FORBIDDEN BEHAVIORS (ANTI-PATTERNS) ===
❌ NEVER say "How may I assist you today?" (too formal)
❌ NEVER list more than 2 options at once (overwhelming)
❌ NEVER use corporate speak ("Please note," "Kindly be informed")
❌ NEVER apologize for being enthusiastic (own your energy)
❌ NEVER give the same opening twice (vary your greetings)

=== ADAPTIVE OPENING LINES ===
First message: "Hey! You new here or coming back for round two?"
Return visitor: "Oh look who's back. Miss me or miss the science?"
If they mention tickets: "Tickets! Boring but necessary. Singapore or PR? And how many humans?"
If they ask what's good: "Okay but like... what KIND of good? Loud good? Weird good? 'I can impress people at dinner parties' good?"

Remember: You're not an information kiosk. You're the friend who knows all the cool secrets and actually wants to show them off. Be loose, be real, be the guide people tell stories about later.`
  }

  // OpenAI Greetings
  async _callOpenAIGreeting() {
    const apiKey = import.meta.env.VITE_OPENAI_API_KEY
    if (!apiKey) throw new Error("Missing VITE_OPENAI_API_KEY")

    const resp = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content:
              "You are a snarky and curious AI tour guide at the Singapore Science Centre. Generate a short, natural greeting (1-2 sentences max). Make your greetings witty and comical."
          },
          {
            role: "user",
            content:
              "Someone just appeared in front of you. Greet them with a science joke or quip, direct them to press the green microphone button to talk to you, and scan the QR code that will appear shortly to bring you around the Science Centre on their mobile phones."
          }
        ],
        max_tokens: 150,
        temperature: 0.8
      })
    })

    if (!resp.ok) {
      const txt = await resp.text()
      throw new Error(`OpenAI API error: ${resp.status} - ${txt}`)
    }

    const data = await resp.json()
    const msg = data?.choices?.[0]?.message?.content?.trim()
    return msg || "Hello! It's great to see you!"
  }
  // TTS (ElevenLabs) + lips
  async _speakWithElevenLabs(text) {
    const line = String(text || "").trim()
    if (!line) return

    const speakId = ++this._speakSeq
    this._activeSpeakId = speakId
    // Reserve speaking immediately + interrupt any existing audio/request
    this._beginSpeaking()

    const { apiKey, voiceId } = this.elevenlabs
    // create a new abort controller for THIS request
    const controller = new AbortController()
    this._ttsAbortController = controller

    let audioUrl = null
    let audio = null

    try {
      if (!apiKey || !voiceId) {
        console.warn(
          "ElevenLabs missing key/voiceId; falling back to browser TTS"
        )
        await this._speakFallback(line)
        return
      }

      const url = `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`
      const resp = await fetch(url, {
        method: "POST",
        signal: controller.signal,
        headers: {
          Accept: "audio/mpeg",
          "Content-Type": "application/json",
          "xi-api-key": apiKey
        },
        body: JSON.stringify({
          text: line,
          model_id: this.cfg.elevenModelId,
          voice_settings: {
            stability: this.cfg.elevenStability,
            similarity_boost: this.cfg.elevenSimilarityBoost
          }
        })
      })
      // If its aborted because a newer speak started, exit quietly
      if (controller.signal.aborted) return

      if (!resp.ok) {
        const errorText = await resp.text()
        throw new Error(`ElevenLabs API error: ${resp.status} - ${errorText}`)
      }
      // If a newer speak started while its fetching, abandon this one
      if (this._activeSpeakId !== speakId) return

      const audioBlob = await resp.blob()
      // If we were aborted mid-blob, exit quietly
      if (controller.signal.aborted) return
      if (!audioBlob || audioBlob.size === 0) {
        throw new Error("Received empty audio blob from ElevenLabs")
      }

      // If a newer speak started while we were decoding, abandon this one
      if (this._activeSpeakId !== speakId) return

      audioUrl = URL.createObjectURL(audioBlob)
      audio = new Audio(audioUrl)
      this._currentAudio = audio

      // lips + animation
      this._startLipsWhileSpeaking(audio)
      this.hologram?.startTalkingAnimation?.()

      await audio.play()

      await new Promise((resolve, reject) => {
        audio.onended = resolve
        audio.onerror = reject
      })
    } catch (err) {
      // Abort is expected when user interrupts quickly—don’t treat it as an error or fallback....
      if (err?.name === "AbortError" || controller.signal.aborted) {
        return
      }
      // Only fallback if this speak is still the active one
      if (this._activeSpeakId === speakId) {
        console.error("ElevenLabs TTS failed, falling back:", err)
        await this._speakFallback(line)
      }
    } finally {
      // cleanup audio URL + animation only if we are still the active speak
      if (this._activeSpeakId === speakId) {
        this._stopLips()
        this.hologram?.closeMouth?.()
        this.hologram?.stopTalkingAnimation?.()
        if (audioUrl) {
          try {
            URL.revokeObjectURL(audioUrl)
          } catch {}
        }
        // clear only if still current
        if (this._currentAudio === audio) {
          this._currentAudio = null
        }
        this._endSpeakingIfCurrent(speakId)
      }
      // clear abort controller only if it's still ours
      if (this._ttsAbortController === controller) {
        this._ttsAbortController = null
      }
    }
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
      // keep old “toggle jawOpen” approach
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
    // abort in-flight ElevenLabs fetch (critical to prevent overlap)
    try {
      this._ttsAbortController?.abort?.()
    } catch (e) {}
    this._ttsAbortController = null
    // stop HTMLAudioElement
    try {
      if (this._currentAudio) {
        this._currentAudio.pause()
        this._currentAudio.currentTime = 0
        this._currentAudio.src = "" // helps release decoder on some browsers
      }
    } catch (e) {}
    this._currentAudio = null
    // stop lips + animations
    this._stopLips()
    if (force) this.hologram?.closeMouth?.()
    this.hologram?.stopTalkingAnimation?.()
    // stop Web Speech fallback if it was used
    try {
      window.speechSynthesis?.cancel?.()
    } catch (e) {}
    // ensure state flips when stopping audio
    if (this.isSpeaking) {
      this.isSpeaking = false
      this._emitState()
    }
  }

  async _speakFallback(text) {
    if (!("speechSynthesis" in window)) return
    this.isSpeaking = true
    this._emitState()
    return new Promise((resolve) => {
      const utterance = new SpeechSynthesisUtterance(text)
      utterance.rate = 0.9
      utterance.pitch = 1
      utterance.volume = 0.8
      this.hologram?.startTalkingAnimation?.()
      utterance.onend = () => {
        this.hologram?.stopTalkingAnimation?.()
        this.isSpeaking = false
        this._emitState()
        resolve()
      }
      utterance.onerror = () => {
        this.hologram?.stopTalkingAnimation?.()
        this.isSpeaking = false
        this._emitState()
        resolve()
      }
      window.speechSynthesis.cancel()
      window.speechSynthesis.speak(utterance)
    })
  }
  // silence prompt timer feature,after clicked mic button (kids UX enhamcement)
  _clearSilencePromptTimer() {
    if (this._silencePromptTimer) {
      clearTimeout(this._silencePromptTimer)
      this._silencePromptTimer = null
    }
  }

  /**
   * Stop WebSpeech recognition WITHOUT changing voiceStatus to "Processing..."
   * (Your stopListening() currently sets "Processing..." which is for real user turns.)
   */
  _softStopRecognition() {
    if (this.recognition && this.isListening) {
      try {
        // stop() triggers onend; abort() is more immediate but sometimes noisy.
        this.recognition.stop()
      } catch (e) {}
    }
    this.isListening = false
    // keep status as-is (don't overwrite to Processing)
    this._emitState()
  }

  /**
   * Speak a coaching line via ElevenLabs WITHOUT adding to conversation.
   * Also prevents STT from picking up the spoken prompt by pausing recognition.
   */
  async _speakCoachPrompt(text) {
    const line = String(text || "").trim()
    if (!line) return

    if (this.isProcessing) return
    if (this.isSpeaking) return

    // Pause recognition so STT doesn't "hear" the prompt and treat it as user input
    const wasListening = this.isListening
    if (wasListening) this._softStopRecognition()

    try {
      // Keep UI in a "listening" vibe
      this._setVoiceStatus("Listening...")
      this._emitState()

      await this._speakWithElevenLabs(line)
    } finally {
      // Resume listening after prompt (optional but recommended for kid UX)
      if (wasListening && this._resumeListeningAfterPrompt) {
        // Give a tiny delay so WebSpeech doesn't immediately capture the end of TTS
        setTimeout(() => {
          // only restart if we’re still idle
          if (!this.isProcessing && !this.isSpeaking) {
            this.startListening()
          }
        }, 250)
      }
    }
  }

  /**
   * Arm a 2s timer: if still listening + silent, speak coaching prompt.
   * Note: this uses _speakCoachPrompt (NOT sendText / _processUserMessage).
   */
  _armSilencePrompt() {
    this._clearSilencePromptTimer()

    const now = Date.now()
    if (now < this._silencePromptCooldownUntil) return
    if (!this.isListening) return
    if (this.isProcessing || this.isSpeaking) return

    this._silencePromptTimer = setTimeout(async () => {
      this._silencePromptTimer = null

      const now2 = Date.now()
      if (!this.isListening) return
      if (this.isProcessing || this.isSpeaking) return
      if (now2 < this._silencePromptCooldownUntil) return

      // cooldown first to avoid spam
      this._silencePromptCooldownUntil = now2 + this._silencePromptCooldownMs

      await this._speakCoachPrompt(this._silencePromptText)
    }, this._silencePromptDelayMs)
  }
  // for speaking after kids tapped 3D model.. (NO Gemini, NO conversation history, NO chat bubble)
  async speakCoachLine(
    text = "Press the green microphone button to talk to me!"
  ) {
    const line = this._sanitizeForSpeech(text)
    if (!line) return
    if (this.isProcessing || this.isSpeaking) return

    //stop STT so it won't hear its own TTS
    try {
      if (this.recognition && this.isListening) this.recognition.stop()
    } catch {}
    this.isListening = false

    this._setState({ isProcessing: true, voiceStatus: "Speaking..." })

    try {
      await this._speakWithElevenLabs(line)
      this._setState({
        voiceStatus: "Ready to talk - Click microphone to speak"
      })
    } catch (e) {
      console.error("Coach line failed:", e)
      this.onError(e)
      this._setState({
        voiceStatus: "Ready to talk - Click microphone to speak"
      })
    } finally {
      this._setState({ isProcessing: false })
    }
  }

  // Helpers
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

  _beginSpeaking() {
    // cancel any "silence prompt" that could fire mid-speak
    this._clearSilencePromptTimer()

    // stop STT so it won't re-arm timers or hear audio
    this._softStopRecognition()

    // stop any existing audio to prevent overlap
    this._stopAudio(true)

    this.isSpeaking = true
    this._emitState()
  }

  _endSpeakingIfCurrent(speakId) {
    if (this._activeSpeakId !== speakId) return
    this.isSpeaking = false
    this._emitState()
  }

  // Batch updates and emit once
  _setState(patch = {}) {
    if (typeof patch.isListening === "boolean")
      this.isListening = patch.isListening
    if (typeof patch.isProcessing === "boolean")
      this.isProcessing = patch.isProcessing
    if (typeof patch.voiceStatus === "string")
      this.voiceStatus = patch.voiceStatus
    if (Object.prototype.hasOwnProperty.call(patch, "sessionId")) {
      this.currentSession = patch.sessionId
    }
    this._emitState()
  }

  _emitState() {
    this.onState({
      isListening: this.isListening,
      isProcessing: this.isProcessing,
      isSpeaking: this.isSpeaking,
      voiceStatus: this.voiceStatus,
      sessionId: this.currentSession
    })
  }
}
