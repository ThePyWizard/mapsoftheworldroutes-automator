# Maps of the World Routes

A TikTok travel video pipeline built with [Remotion](https://remotion.dev). An AI agent finds trending road trip routes daily, writes voiceover scripts, and generates TTS audio automatically. You export one map animation video manually, and the pipeline assembles the final TikTok-ready video.

---

## How it works

```
npm run agent
  │
  ├── Tavily searches for trending road trip routes
  ├── Claude writes 3 voiceover scripts
  ├── Kokoro TTS generates audio (local, no API key)
  └── Prints Google Maps URLs + route scripts

      ↓  (you pick a route)

Open Google Maps URL → TravelAnimator app → export animation
Save as public/background.mp4

      ↓

npm run setup-route -- <1|2|3>
  │
  ├── Copies selected audio → public/audio.wav
  ├── Resamples to 16kHz for Whisper
  └── Transcribes audio → public/captions.json

      ↓

npm run render
  └── Remotion assembles final 1080×1920 video → out/
```

---

## Video structure

Each output video is **1080×1920 (9:16)** at **30fps**, composed of two segments:

### Main segment (length = voiceover duration)

| Layer | Content |
|-------|---------|
| 1 | Map animation (`background.mp4`) — speed-adjusted to match voiceover |
| 2 | Bird video overlays — one every 5 seconds, 3 seconds long, cycles through 4 clips |
| 3 | Channel logo — top-right corner |
| 4 | Route title — `"CITY to CITY"` split across two lines, bold white text |
| 5 | Voiceover audio — at 150% volume |
| 6 | Car ambient sound — at 30% volume |
| 7 | TikTok-style captions — word-by-word highlighting in gold |

### Outro segment
Full-screen outro video (`ta-outro.mp4`).

---

## Setup

### 1. Install dependencies

```bash
npm install
```

### 2. Create your `.env` file

```bash
cp .env.example .env
```

Fill in:

```env
ANTHROPIC_API_KEY=...   # console.anthropic.com
TAVILY_API_KEY=...      # app.tavily.com — free tier: 1000 searches/month
```

> **TTS is fully local.** Kokoro (~87MB) downloads automatically on first run. No API key needed.

### 3. Install ffmpeg (recommended)

Used to resample audio to 16kHz before Whisper transcription. Without it, transcription still works but accuracy may be lower.

- Windows: [ffmpeg.org/download.html](https://ffmpeg.org/download.html) → add to PATH
- Or via winget: `winget install ffmpeg`

### 4. Place your static assets in `public/`

| File | Description |
|------|-------------|
| `logo.png` | Channel logo (displayed top-right) |
| `ta-outro.mp4` | Outro video clip |
| `car-voice-trimmed.wav` | Car ambient sound loop |
| `bird_1.webm` … `bird_4.webm` | Bird overlay clips (cycle every 5s) |

---

## Daily workflow

### Step 1 — Find trending routes and generate audio

```bash
npm run agent
```

This runs the research agent. It will:
- Search for trending road trip routes (uses **2 Tavily credits**)
- Generate a voiceover script for each
- Create TTS audio locally with Kokoro
- Print the 3 route options with Google Maps URLs

Example output:
```
┌─ ROUTE 1: Sedona to Grand Canyon
│  Why trending: Viral spring break road trip on TikTok
│
│  📝 VOICEOVER SCRIPT:
│    Starting in Sedona, Arizona — one of the most
│    ...
│  🗺️  GOOGLE MAPS URL:
│    https://www.google.com/maps/dir/Sedona%2C+AZ/...
│  🎵  AUDIO: public/route-1-audio.wav
└────────────────────────────────────────────────────────────
```

### Step 2 — Export the map animation

1. Open the Google Maps URL for your chosen route
2. Import it into **TravelAnimator** (or similar map animation app)
3. Export the video
4. Save it as **`public/background.mp4`**

> The video length doesn't need to match the voiceover — Remotion automatically adjusts the playback speed to sync them.

### Step 3 — Transcribe and prepare

```bash
npm run setup-route -- 2   # replace 2 with your chosen route number
```

This will:
- Copy `public/route-2-audio.wav` → `public/audio.wav`
- Resample audio to 16kHz
- Run Whisper transcription → `public/captions.json`
- Print the final render command

### Step 4 — Render

```bash
npm run render
```

Or with explicit props (printed by `setup-route`):

```bash
npx remotion render TravelRoute --props='{"routeTitle":"Sedona to Grand Canyon",...}'
```

Output video lands in `out/TravelRoute.mp4`.

---

## Preview in Remotion Studio

```bash
npm run dev
```

Opens a browser-based preview at `localhost:3000` where you can scrub through the video and tweak props live.

---

## Re-transcribe audio

If you replace `public/audio.wav` manually and want fresh captions:

```bash
npm run transcribe
```

---

## Project structure

```
mapsoftheworldroutes/
├── scripts/
│   ├── agent.mts          # Research agent: Tavily search → Claude scripts → Kokoro TTS
│   └── prepare.mts        # Prep script: copy audio, resample, transcribe
├── src/
│   ├── index.ts           # Remotion entry point
│   ├── Root.tsx           # Composition definition + metadata calculation
│   ├── TravelRoute.tsx    # Main video component (layers, bird overlays, title)
│   ├── Captions.tsx       # TikTok-style word-highlight captions
│   └── transcribe.mts     # Standalone Whisper transcription script
├── public/
│   ├── background.mp4     # ← you place this (map animation from TravelAnimator)
│   ├── audio.wav          # ← generated by setup-route
│   ├── captions.json      # ← generated by setup-route
│   ├── route-1-audio.wav  # ← generated by agent (option 1)
│   ├── route-2-audio.wav  # ← generated by agent (option 2)
│   ├── route-3-audio.wav  # ← generated by agent (option 3)
│   ├── logo.png           # channel logo
│   ├── ta-outro.mp4       # outro clip
│   ├── car-voice-trimmed.wav
│   └── bird_1–4.webm
├── whisper.cpp/           # auto-downloaded by @remotion/install-whisper-cpp
├── routes.json            # saved by agent, read by setup-route
├── .env                   # your API keys (git-ignored)
├── .env.example           # template
└── remotion.config.ts
```

---

## Tech stack

| Tool | Role | Cost |
|------|------|------|
| [Remotion](https://remotion.dev) | Video composition and rendering | Free (personal use) |
| [Claude](https://anthropic.com) (claude-sonnet-4-6) | Voiceover script writing | ~$0.001/run |
| [Tavily](https://tavily.com) | Web search for trending routes | Free (1000/month) |
| [Kokoro TTS](https://github.com/hexgrad/kokoro) (`kokoro-js`) | Local text-to-speech | Free, runs offline |
| [Whisper.cpp](https://github.com/ggerganov/whisper.cpp) | Audio transcription for captions | Free, runs offline |

---

## npm scripts

| Script | Description |
|--------|-------------|
| `npm run agent` | Find trending routes, generate scripts + audio |
| `npm run setup-route -- <N>` | Prepare files for route N (1, 2, or 3) |
| `npm run render` | Render the final video |
| `npm run dev` | Open Remotion Studio preview |
| `npm run transcribe` | Re-run Whisper transcription on `public/audio.wav` |
| `npm run build` | Bundle the Remotion project |
