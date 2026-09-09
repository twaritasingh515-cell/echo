<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://ai.google.dev/static/site-assets/images/share-ais-513315318.png" />
</div>

# Echo — Conversational AI Companion

Echo is a real-time, voice-first AI companion. It listens to the microphone, detects speech and interruptions acoustically, decides when it's actually your turn to talk (not just when you pause), generates a conversational reply with Gemini, and speaks it back with low-latency Rime TTS (falling back to the browser's built-in neural voices when Rime isn't configured or fails).

## Features

- Real-time voice activity detection (VAD), pitch tracking, and speaking-rate analysis from raw mic audio
- Hybrid rule-based / ML-flavored turn-taking engine (`WAIT` / `RESPOND` / `BACKCHANNEL` / `STOP`) that decides when to answer, backchannel ("mm-hm", "right"), or wait for you to finish
- Barge-in / interruption handling — Echo stops talking the instant it detects you speaking over it
- English + Hindi/Hinglish understanding and reply generation
- Lightweight long-term memory (facts extracted from conversation, persisted client-side)
- Low-latency Rime TTS with graceful fallback to the browser's Web Speech API
- Debug surfaces: audio telemetry panel, turn-taking inspector, architecture modal

## Setup Instructions

**Prerequisites:** Node.js (18+ recommended)

1. Install dependencies:
   ```bash
   npm install
   ```
2. Create a `.env.local` file (or copy `.env.example`) and set:
   ```bash
   GEMINI_API_KEY="your-gemini-api-key"   # required — powers dialogue + transcription
   RIME_API_KEY=""                         # optional — enables Rime TTS; leave blank to use the browser voice fallback
   ```
3. Run the app:
   ```bash
   npm run dev
   ```
   This starts an Express server (with Vite in middleware mode) on `http://localhost:3000`.
4. Grant microphone access when prompted by the browser.

**Production build:**
```bash
npm run build   # vite build + esbuild bundle of server.ts -> dist/server.cjs
npm start        # node dist/server.cjs
```

## Architecture

Echo is a single Node/Express server serving a React 19 + Vite front end. There is no separate backend service or database — all "brains" live in either the browser (audio capture, VAD, turn-taking, TTS playback) or in three Express routes that proxy to Gemini/Rime.

```
Browser (React app)
 ├─ AudioEngine         mic capture, AnalyserNode-based VAD, pitch/energy/WPM
 │                       estimation, Web Speech API (when available), and
 │                       MediaRecorder buffering for server-side transcription
 ├─ TurnTakingEngine     turns VocalCues + live transcript into a WAIT /
 │                       RESPOND / BACKCHANNEL / STOP decision
 ├─ MemoryEngine         extracts + stores long-term memory facts (localStorage)
 ├─ TTSService           calls the Rime proxy, decodes/wraps returned audio,
 │                       plays it, and falls back to SpeechSynthesis on failure
 └─ App.tsx / components conversation UI, avatar visualizer, telemetry &
                          turn-taking inspector panels, settings

        │ fetch()                         │ fetch()                    │ fetch()
        ▼                                 ▼                            ▼
Express server (server.ts)
 ├─ POST /api/companion/transcribe   audio → Gemini (speech-to-text)
 ├─ POST /api/companion/respond      transcript + history + memories → Gemini
 │                                    (dialogue generation, JSON response)
 └─ POST /api/companion/rime-tts     text → Rime TTS API → base64 audio
                                      (falls back to {fallbackToClient:true}
                                       if RIME_API_KEY is unset or the call fails)
```

**Turn flow:** mic audio → `AudioEngine` VAD/pitch/energy analysis (+ optional native `SpeechRecognition`, or buffered audio sent to `/api/companion/transcribe` when native recognition isn't available) → `TurnTakingEngine` decides whether to wait, backchannel, or respond → on `RESPOND`, the transcript, recent history, and stored memories are sent to `/api/companion/respond` → the returned reply text is sent to `TTSService`, which requests audio from `/api/companion/rime-tts` and plays it, watching the mic the whole time for a barge-in interruption.

## Third-Party Services

| Service | Used for | Configuration |
|---|---|---|
| **Google Gemini API** (`@google/genai`) | Dialogue generation (`/api/companion/respond`) and speech-to-text (`/api/companion/transcribe`) when native browser speech recognition isn't used | `GEMINI_API_KEY` env var. Server tries a list of candidate models in order (e.g. `gemini-3.1-flash-lite`, `gemini-3.5-flash`, `gemini-3.6-flash`, `gemini-3.8-flash`, `gemini-flash-latest`) until one succeeds. |
| **Rime TTS** (rime.ai) | Low-latency neural speech synthesis | `RIME_API_KEY` env var (optional). See exact call details below. |
| **Browser Web Speech API** (`SpeechRecognition` / `SpeechSynthesisUtterance`) | Client-side speech-to-text when supported, and the TTS fallback voice | No key required; browser-native. |

### Rime TTS — exact call details

- **Endpoint:** `POST https://users.rime.ai/v1/rime-tts`
- **Auth:** `Authorization: Bearer <RIME_API_KEY>` header (called server-side only, from `server.ts`, never from the browser)
- **Model ID:** `coda`
- **Default speaker:** `albion` (British-accented voice; the app also whitelists `victoria`, `astra`, `celeste`, `orion`, `lyra`, `masonry` as valid speakers, selecting `albion` for a British accent or `astra` otherwise if an invalid/unrecognized speaker is supplied)
- **Language:** English (India-aware) with Hindi/Hinglish text passed through as-is — Rime is given the raw response text; there's no separate language parameter, spoken language follows whatever Gemini generated (English or Hinglish)
- **Audio format:** `mp3` (requested via `audioFormat: "mp3"` in the request body and `Accept: audio/mp3` header); the client-side decoder is format-agnostic and will also correctly handle WAV, raw PCM (wrapped into a WAV container at 24kHz/16-bit mono), or Ogg if returned
- **Transport:** Plain HTTPS POST/JSON request/response (not streaming, not a websocket). The server calls Rime, buffers the full response as an `ArrayBuffer`, base64-encodes it, and returns `{ audio, provider: "rime", speaker }` as JSON to the browser, which decodes the base64 and plays it via an `HTMLAudioElement`
- **Request timeout:** the browser aborts the request to `/api/companion/rime-tts` after 8 seconds and falls back to browser TTS
- **Additional request params:** `text` (sanitized: markdown/asterisk-emphasis/bracketed stage directions/backticks stripped), `speedAlpha` (defaults to `1.0`, maps to speaking rate)

## Known Limitations

- **No database / no server-side persistence.** Long-term memory lives in `localStorage` in the browser — it's per-browser, per-device, and will be lost if storage is cleared.
- **Speech-to-text quality depends on the browser.** Chrome-family browsers get native, low-latency `SpeechRecognition`; browsers without it fall back to buffering audio and sending it to Gemini for transcription, which is slower and only kicks in after ~0.8s of trailing silence.
- **Interruption/VAD detection is amplitude-threshold based** (RMS thresholds tuned by a "sensitivity" setting), not a trained voice-activity model — it can misfire in noisy environments or with background speech, and pitch detection is a simple autocorrelation estimator with a 65–450Hz range.
- **No streaming TTS or LLM output.** Both the Gemini response and the Rime audio are generated and returned in full before playback starts, which adds latency versus a token/audio-streaming pipeline.
- **Rime is optional but required for the "real" voice.** Without `RIME_API_KEY`, every reply uses the browser's built-in `SpeechSynthesis` voices, which vary widely in quality/availability across OS and browser.
- **Turn-taking is heuristic, not a trained turn-taking model**, despite exposing a `turn_taking_mode: 'hybrid_ml' | 'rule_based' | 'neural_network'` setting — the underlying logic is rule/threshold-based (continuation connectors, hesitation tokens, question starters, pause duration, etc.), not a deployed neural network.
- **English + Hindi/Hinglish only** by design; other languages aren't targeted by the prompting or voice selection.
- **Single-user, no auth.** There's no login or per-user isolation; anyone with access to the running server/app shares the same memory store per browser.

## Failure Behavior

Echo is built to degrade gracefully rather than break the conversation:

- **Rime TTS unreachable / no API key / non-2xx response:** `/api/companion/rime-tts` returns `{ fallbackToClient: true, provider: "browser_neural" }` instead of erroring, and the client automatically speaks the reply using `SpeechSynthesisUtterance` with a British-voice preference.
- **Rime request exceeds 8s:** the client aborts the fetch (`AbortController`) and falls back to browser TTS.
- **Corrupted/unplayable audio from Rime:** `audio.onerror`/autoplay-block handlers catch the failure and fall back to browser TTS rather than failing silently.
- **Gemini API key missing:** `/api/companion/respond` skips the model call entirely and returns a small set of canned, keyword-matched fallback replies (e.g. capital-of-India, a joke, "what can you do") so the app still responds instead of erroring.
- **All candidate Gemini models fail (`/api/companion/respond`):** the same canned-fallback response path is used, and the request still returns `200` with `response`, `tone: "warm"`, `extractedFact: null`.
- **Transcription failure or empty/unintelligible audio:** `/api/companion/transcribe` returns an empty transcript string rather than throwing; the client discards results containing the literal placeholder text `"transcribing speech with ai"` and very small audio clips (<3500 bytes) are skipped before ever being sent.
- **Any exception inside `/api/companion/respond` or `/api/companion/rime-tts`:** caught server-side and converted into the same graceful fallback JSON shape (never a raw 500 that would break the client flow), so the UI always has something to say or a fallback voice to say it with.
- **No native `SpeechRecognition` support:** the client transparently switches to MediaRecorder-buffered audio + server-side Gemini transcription, triggered after ~0.8s of trailing silence following detected speech.
