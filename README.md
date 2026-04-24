# Maps of the World Routes

A TikTok travel video pipeline built on [Remotion](https://remotion.dev) and the [TravelAnimator](https://travelanimator.com) app's MCP server. Claude drives the whole thing end-to-end — pick a model (car / train / plane / boat), get back a rendered 9:16 video with voiceover, captions, map animation, place labels, waypoint images, and brand outro.

---

## One-Shot Pipeline

Tell Claude:

> **"generate a travelanimator video using pickup truck"**
> _(or `train`, `plane`, `boat`)_

Claude runs the full pipeline:

```
1. Research — finds a trending route matching the model type
2. routes.json — appends a new entry with next sequential id
3. In parallel:
     • TravelAnimator MCP → plot + export map animation → public/route-<id>-video.mp4
     • ElevenLabs → voiceover → public/route-<id>-audio.wav
     • Wikipedia scrape → waypoint images → routes.json locationImages
4. set-sfx — binds the right ambient sound for the model
5. render-all — Whisper transcribe + Remotion render → out/route-<id>-<title>.mp4
```

The whole thing lives in the `travelanimator-mcp-commander` skill (see `skills/travelanimator-mcp-commander/SKILL.md`).

---

## Model → Trip Mapping

The model name is the single input — it decides everything else:

| Model | Research query | 3D asset in TA | SFX file | Real route |
|---|---|---|---|---|
| `car` / `pickup truck` | road trip | Pickup Truck (56/61) | `car-voice-trimmed.wav` | **ON** |
| `train` | train trip | Train (looked up via `list_models`) | `train-voice.mp3` | off |
| `plane` / `flight` | flight route | Plane | `plane-voice.mp3` | off |
| `boat` | boat voyage | Boat | `boat-voice.mp3` | off |

Real route is on only for land vehicles — TravelAnimator's real-route API follows road geometry, which doesn't apply to rails, skies, or water.

---

## Video Structure

Each output is **1080×1920 (9:16)** at **30fps**, composed of two segments:

### Main segment (length = voiceover duration)

| Layer | Content |
|---|---|
| 1 | Map animation video — speed-adjusted to match voiceover |
| 2 | Bird overlays — one every 5s, 3s long, 4 clips cycled |
| 3 | Channel logo — top-right corner |
| 4 | Route title — `"CITY to CITY"` on two lines, Montserrat 900 |
| 4b | Waypoint images from Wikipedia — cycled across the main duration |
| 5 | Voiceover — ElevenLabs, 150% volume |
| 6 | Ambient SFX — model-specific (car/train/plane/boat), 30% volume |
| 7 | TikTok-style word-highlight captions — Whisper-transcribed |
| 8 | Miles counter — bottom of frame |

### Outro segment
Full-screen `ta-outro.mp4`.

---

## TravelAnimator Defaults (applied every run)

| Setting | Value |
|---|---|
| Map | Terrain |
| Aspect ratio | 9:16 |
| Model size | 0.2 |
| Place label style | Chat bubble |
| Place label scale | 1.7 (max) |
| Place label color | Black (`#FF000000` ARGB) |
| Place label visibility | Always |
| Smoothening factor | 0.5 |
| Line style | Auto, width 4.0, red `#FF0000` |
| Distance unit | Miles |
| Duration | = `scriptDurationSeconds`, capped at 60s |
| Real route | On for car/pickup — off for train/plane/boat |

---

## Setup

### 1. Install dependencies

```bash
npm install
pip install requests   # for the Wikipedia image scraper
```

### 2. `.env`

```bash
cp .env.example .env
```

```env
ELEVENLABS_API_KEY=...          # voiceover TTS
ANTHROPIC_API_KEY=...            # optional — for legacy `npm run agent` flow
```

### 3. Install ffmpeg

Needed for audio resampling + SFX trimming.

- Windows: `winget install ffmpeg`
- Mac: `brew install ffmpeg`

### 4. TravelAnimator app

1. Install TravelAnimator on your phone
2. Open app → settings → enable **MCP server**
3. Make sure Claude's MCP tool list shows `mcp__travel-animator__*` tools

### 5. Pre-bundled assets in `public/`

These ship with the project — do not delete:

| File | Purpose |
|---|---|
| `logo.png` | Channel logo (218×218) |
| `ta-outro.mp4` | Brand outro |
| `bird_1.webm` … `bird_4.webm` | Alpha bird overlays |
| `bird-sfx.mp3` | Bird chirp SFX |
| `car-voice.wav` | Car ambience master (trimmed per-route to `car-voice-trimmed.wav`) |
| `train-voice.mp3` | Train ambience |
| `plane-voice.mp3` | Cabin ambience |
| `boat-voice.mp3` | Boat ambience |

---

## Manual Commands (if you're running steps by hand)

```bash
# 1. Voiceover — reads script from routes.json by id
npm run generate-audio -- 53

# 2. Scrape Wikipedia images for waypoints
python scripts/scrape_location_images.py 53
python scripts/scrape_location_images.py --missing    # catch up on every unfilled route

# 3. Bind SFX to a route
npm run set-sfx -- 53 car
npm run set-sfx -- 53 train
npm run set-sfx -- 53 plane
npm run set-sfx -- 53 boat

# 4. Render — validates inputs, Whisper-transcribes, Remotion-renders
npm run render-all -- 53

# Remotion Studio preview
npm run dev
```

Outputs live in `out/route-<id>-<title>.mp4`.

---

## Project Structure

```
mapsoftheworldroutes/
├── skills/
│   ├── travelanimator-mcp-commander/   # End-to-end pipeline skill
│   └── roadtrip-content-generator/     # Script-only skill (routes.json appends)
├── scripts/
│   ├── generate-audio.mts              # ElevenLabs TTS
│   ├── render-all.mts                  # Whisper + Remotion render
│   ├── set-sfx.mts                     # Binds SFX file to a route
│   ├── scrape_location_images.py       # Wikipedia → locationImages
│   └── prepare.mts                     # Legacy single-route prep
├── src/
│   ├── Root.tsx                        # Composition + metadata calc
│   ├── TravelRoute.tsx                 # Main video component
│   ├── Captions.tsx                    # TikTok-style captions
│   └── transcribe.mts                  # Standalone Whisper script
├── public/
│   ├── route-<id>-video.mp4            # TA export per route
│   ├── route-<id>-audio.wav            # voiceover per route
│   ├── route-<id>-captions.json        # Whisper output per route
│   ├── car-voice.wav / car-voice-trimmed.wav
│   ├── train-voice.mp3
│   ├── plane-voice.mp3
│   ├── boat-voice.mp3
│   ├── bird-sfx.mp3
│   ├── bird_1.webm … bird_4.webm
│   ├── logo.png
│   └── ta-outro.mp4
├── out/
│   └── route-<id>-<title>.mp4          # final renders
├── routes.json                         # canonical route + script database
├── CLAUDE.md                           # project-level Claude instructions
└── remotion.config.ts
```

---

## routes.json Schema

```jsonc
{
  "id": 53,
  "title": "Stinson Beach to Pescadero — ...",
  "origin": "Stinson Beach, CA",
  "destination": "Pescadero, CA",
  "waypoints": ["Baker Beach, SF", "Ocean Beach, SF", "Half Moon Bay State Beach"],
  "script": "Did you know for about $15 in gas...",
  "googleMapsUrl": "https://www.google.com/maps/dir/...",
  "whyTrending": "...",
  "scriptDurationSeconds": 52,
  "audioFile": "route-53-audio.wav",
  "videoFile": "route-53-video.mp4",
  "sfxFile": "car-voice-trimmed.wav",
  "totalDistance": 105,
  "captionStyle": 1,
  "tiktokCaption": "did you know this 15$ roadtrip from Stinson Beach to Pescadero #travel #usroadtrip #traveltok #bayarea",
  "locationImages": ["<wikipedia url>", "...", "..."]
}
```

---

## Tech Stack

| Tool | Role | Cost |
|---|---|---|
| [Remotion](https://remotion.dev) | Video composition + render | Free (personal) |
| [TravelAnimator](https://travelanimator.com) | Map animation export via MCP | Paid (mobile app) |
| [ElevenLabs](https://elevenlabs.io) | Voiceover TTS | Paid (~$0.01/route) |
| [Whisper.cpp](https://github.com/ggerganov/whisper.cpp) | Caption transcription | Free, local |
| [Wikipedia API](https://en.wikipedia.org/api/rest_v1/) | Waypoint images | Free |
| Claude (via MCP) | Orchestration + research | Subscription |

---

## npm Scripts

| Script | Purpose |
|---|---|
| `npm run generate-audio -- <id>` | ElevenLabs voiceover for one route |
| `npm run set-sfx -- <id> <voice>` | Bind car/train/plane/boat SFX to a route |
| `npm run render-all -- <id>` | Validate → transcribe → Remotion render |
| `npm run dev` | Remotion Studio preview |
| `npm run transcribe` | Re-run Whisper on `public/audio.wav` |
| `npm run render` | Legacy single-route render |
| `npm run agent` | Legacy Tavily research flow (pre-MCP) |
