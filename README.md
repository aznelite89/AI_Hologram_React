# NP_HologramBuild_React (Nudgyt AI Coach Demo)

Vite + React app for the Nudgyt AI Coach demo.

## Prerequisites

- Node.js (LTS recommended)

## Setup

Install dependencies with **pnpm**:

```bash
pnpm install
```

If you must use npm instead:

```bash
npm install
```

## Environment variables

This project uses Vite env vars (must be prefixed with `VITE_`).

- Create a local `.env` file in the project root.
- **Do not commit real API keys**.

Common variables used by this repo:

- `VITE_APP_API_BASE` — backend base URL
- `VITE_APP_BASE` — frontend base URL
- `VITE_OPENAI_API_KEY`
- `VITE_GEMINI_API_KEY`
- `VITE_ELEVENLABS_API_KEY`
- `VITE_ELEVENLABS_VOICE_ID`
- `VITE_LOW_POWER` — set to `"1"` to reduce client workload (if supported by the app)
- (Optional Firebase realtime sessions)
  - `VITE_FIREBASE_API_KEY`
  - `VITE_FIREBASE_AUTH_DOMAIN`
  - `VITE_FIREBASE_PROJECT_ID`
  - `VITE_FIREBASE_APP_ID`

## Development

```bash
pnpm dev
```

Then open the local URL printed by Vite (typically `http://localhost:5173`).

## Build

```bash
pnpm build
```

## Preview production build

```bash
pnpm preview
```

## Project notes

- **Path alias**: `@nrs` maps to `src/` (configured in `vite.config.js`). Example: `import store from "@nrs/store.js"`.

