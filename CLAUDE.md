# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
pnpm dev       # Start development server (Vite)
pnpm build     # Production build
pnpm preview   # Preview production build
```

No test or lint commands are configured.

## Environment Variables

Required in `.env`:
- `VITE_APP_API_BASE` — Backend API base URL
- `VITE_OPENAI_API_KEY` — OpenAI API key
- `VITE_GEMINI_API_KEY` — Google Gemini API key
- `VITE_ELEVENLABS_API_KEY` — ElevenLabs TTS API key
- `VITE_ELEVENLABS_VOICE_ID` — ElevenLabs voice ID
- `VITE_FIREBASE_API_KEY` and related Firebase config vars
- `VITE_LOW_POWER` — Set to `1` to enable low-power mode

## Architecture

This is an AI-powered hologram kiosk app for a science center, combining 3D avatar rendering, speech AI, and computer vision in a React + Vite frontend.

### Core Engines (`src/engine/`)

The app is driven by three independently operating engines, initialized in `App.jsx` and registered globally via `src/engine/engineRegistry.js`:

- **`HologramEngine.js`** — Three.js 3D scene with a GLB avatar (`Male_Waving_Final.glb`), morph target blendshapes for lip-sync, and gesture animations.
- **`SpeechEngine.js`** — Speech recognition → Gemini/OpenAI API for responses → ElevenLabs TTS → triggers lip-sync in HologramEngine. Contains the conversation loop logic.
- **`CameraEngine.js`** — MediaPipe face detection + TensorFlow COCO-SSD for visitor presence and age group classification (kids/adults/visitors). Emits signals that drive automatic greeting behavior.

Engines communicate via callbacks and by dispatching to Redux. `engineRegistry.js` enables cross-engine access (e.g., SpeechEngine calling HologramEngine methods).

### State Management (`src/slices/`, `src/sagas/`)

Redux Toolkit slices:
- `speechSlice` — conversation history, listening/processing states
- `cameraSlice` — visitor detection signals, age group classification result
- `commonSlice` — current page type (`PageType`), selected language
- `feedbackSlice` — feedback submission state

Redux-Saga handles async feedback submission (`src/sagas/feedbackSaga.js`).

### Page Flow

`EnginePageTypeController.js` controls navigation between views. `commonSlice` holds the current `PageType` (defined in `src/constants/PageType.js`). `App.jsx` renders different UI panels based on this value.

### Key Data Files

- `src/sciencecenter.txt` — Knowledge base injected as context into AI prompts
- `src/constants/Exhibits.js` — Exhibit definitions used for navigation/context
- `public/models/mediapipe/` — MediaPipe WASM model files (served statically)
- `public/Male_Waving_Final.glb`, `public/SC_BG.glb` — 3D model assets

### Path Alias

`@nrs` maps to `src/` (configured in `vite.config.js`).
