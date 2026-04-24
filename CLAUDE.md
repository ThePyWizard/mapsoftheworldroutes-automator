---
name: mapsoftheworldroutes-edit-engine
description: Automated Remotion video editor for TravelAnimator map route videos. Composites background map animation, route title text, logo overlay, bird video overlays, voiceover with car ambience audio, and TikTok-style synced subtitles into a final 1080x1920 vertical export.
metadata: {"openclaw":{"emoji":"🗺","os":["darwin","linux","win32"],"requires":{"bins":["ffmpeg","npx","node"]}}}
---

# MapsOfTheWorldRoutes Edit Engine

You are an automated video editing agent for the TravelAnimator brand. When triggered, you receive a **TravelAnimator exported map animation video** and a **voiceover audio file**, then produce a fully composed Remotion video export with all overlays, audio mixing, and subtitles.

## Project Location

The Remotion project lives at `{baseDir}/..` (the parent of the skills folder). All commands must be run from the project root directory.

## Pre-bundled Assets (already in `public/`)

These files ship with the project and do NOT need to be provided by the user:

| File | Purpose |
|------|---------|
| `logo.png` | TravelAnimator logo (218x218, top-right corner) |
| `ta-outro.mp4` | Brand outro video appended at the end |
| `bird_1.webm` | Transparent bird overlay animation 1 |
| `bird_2.webm` | Transparent bird overlay animation 2 |
| `bird_3.webm` | Transparent bird overlay animation 3 |
| `bird_4.webm` | Transparent bird overlay animation 4 |
| `car-voice.wav` | Car ambience sound (full-length master, needs trimming per video) |

## Required User Inputs

The user must provide exactly TWO files and ONE text string:

1. **Map animation video** — the TravelAnimator app export (e.g. `background.mp4`)
2. **Voiceover audio** — the narration audio file (e.g. `audio.mp3` or `audio.wav`)
3. **Route title** — text like `"Nashville to New Orleans"` describing the route

## Complete Automation Pipeline

When the user sends their files and route title, execute these steps in exact order:

### Step 1: Place User Files in `public/`

Copy the user-provided map video to `public/background.mp4` and voiceover audio to `public/audio.mp3` (or `.wav`). Overwrite any existing files.

### Step 2: Convert Voiceover to WAV (if MP3)

If the voiceover is MP3, convert to 16KHz WAV for transcription:

```bash
ffmpeg -i public/audio.mp3 -ar 16000 public/audio.wav -y
```

If already WAV, ensure it is 16KHz:

```bash
ffmpeg -i public/audio.wav -ar 16000 public/audio-16k.wav -y
mv public/audio-16k.wav public/audio.wav
```

### Step 3: Get Voiceover Duration

```bash
ffprobe -i public/audio.wav -show_entries format=duration -v quiet -of csv="p=0"
```

Store this value as `AUDIO_DURATION` (in seconds). This drives all timing.

### Step 4: Trim Car Ambience Audio

Trim `car-voice.wav` to match the voiceover duration exactly:

```bash
ffmpeg -i public/car-voice.wav -t <AUDIO_DURATION> -c copy public/car-voice-trimmed.wav -y
```

### Step 5: Transcribe Audio to Captions

Generate timestamped subtitles from the voiceover:

```bash
npx tsx src/transcribe.mts
```

This installs whisper.cpp (if not cached), downloads the `medium.en` model, transcribes `public/audio.wav`, and writes `public/captions.json`.

The transcription script (`src/transcribe.mts`) uses `@remotion/install-whisper-cpp` with `tokenLevelTimestamps: true` for word-level timing. The output is a `Caption[]` array with `startMs`, `endMs`, `text`, `timestampMs`, and `confidence` fields.

### Step 6: Update Route Title in Root.tsx

Edit `src/Root.tsx` and set the `routeTitle` in `defaultProps` to the user-provided route title string:

```tsx
routeTitle: "Nashville to New Orleans",  // <-- replace with user's route title
```

The title renders as two lines, split on "to":
- Line 1: `"Nashville to"`
- Line 2: `"New Orleans"`

Font: Montserrat 900 weight, 72px, white with heavy text shadow, no background. Positioned at top-center with 200px padding from top.

### Step 7: Render the Final Video

```bash
npx remotion render TravelRoute --gl=angle --concurrency=1
```

The output will be saved to `out/TravelRoute.mp4`.

## Video Composition Architecture

**Format:** 1080x1920 (9:16 vertical), 30fps

The video is structured as a `<Series>` with two sequential parts:

### Part 1: Main Content (duration = voiceover audio length)

Seven layers stacked bottom-to-top:

| Layer | Component | Details |
|-------|-----------|---------|
| 1 | Background Video | `background.mp4` played with speed-ramped `playbackRate` to match audio duration. Muted. Full cover. |
| 2 | Bird Overlays | 4 transparent WebM clips (`bird_1-4.webm`) cycling every 5 seconds, each playing for 3 seconds. Positioned between background and text. |
| 3 | Logo | `logo.png` at 218x218px, top-right corner with 40px padding. |
| 4 | Route Title | Two-line text (split on "to"), Montserrat 900 weight, 72px white, heavy text shadow, top-center at 200px from top. No background. |
| 5 | Voiceover Audio | `audio.mp3` at 150% volume (1.5). |
| 6 | Car Ambience | `car-voice-trimmed.wav` at 30% volume (0.3). Trimmed to match voiceover. |
| 7 | Subtitles | TikTok-style captions from `captions.json`. Positioned at center + 30% margin-top. Dark semi-transparent background pill. Montserrat 700, 42px. Active word highlighted in gold (#FFD700), inactive in white. Words grouped every 1200ms. |

### Part 2: Outro (duration = outro video length)

Single layer: `ta-outro.mp4` played at full size with its own audio.

## Speed Ramp Logic

The `calculateMetadata` function in `Root.tsx` automatically:
1. Reads the voiceover audio duration
2. Reads the background video duration
3. Reads the outro video duration
4. Computes `videoPlaybackRate = videoDuration / audioDuration`
5. Sets `mainDurationInFrames = ceil(audioDuration * 30)`
6. Sets `outroDurationInFrames = ceil(outroDuration * 30)`
7. Sets total `durationInFrames = main + outro`

This ensures the background video finishes exactly when the voiceover ends, regardless of their original lengths.

## Subtitle System Details

- Source: `public/captions.json` (generated by whisper.cpp transcription)
- Format: `Caption[]` from `@remotion/captions`
- Grouping: `createTikTokStyleCaptions()` with `combineTokensWithinMilliseconds: 1200`
- Each page rendered in a `<Sequence>` with calculated start frame and duration
- Word highlighting: compares `token.fromMs/toMs` against current absolute time
- Active color: `#FFD700` (gold), inactive: `#FFFFFF` (white)
- Container: centered with `marginTop: "30%"`, dark pill background `rgba(0,0,0,0.6)`

## Bird Overlay System Details

- Files: `bird_1.webm`, `bird_2.webm`, `bird_3.webm`, `bird_4.webm`
- Interval: every 5 seconds (`BIRD_INTERVAL_SEC = 5`)
- Duration per clip: 3 seconds (`BIRD_DURATION_SEC = 3`)
- Cycle: 1 -> 2 -> 3 -> 4 -> 1 -> 2 -> ... repeating for the entire main duration
- Format: VP9 WebM with alpha transparency (converted from PNG-codec MOV)
- Layer position: between background video and logo/text layers

## Audio Mixing Details

| Track | File | Volume | Notes |
|-------|------|--------|-------|
| Voiceover | `audio.mp3` | 1.5 (150%) | Primary narration, drives video duration |
| Car ambience | `car-voice-trimmed.wav` | 0.3 (30%) | Trimmed to match voiceover duration exactly |
| Outro | embedded in `ta-outro.mp4` | native | Plays only during outro segment |

## File Structure

```
mapsoftheworldroutes/
├── src/
│   ├── Root.tsx              # Composition registration + calculateMetadata
│   ├── TravelRoute.tsx       # Main composition (all 7 layers + outro)
│   ├── Captions.tsx          # TikTok-style subtitle component
│   └── transcribe.mts        # Whisper.cpp transcription script
├── public/
│   ├── background.mp4        # [USER PROVIDED] Map animation from TravelAnimator
│   ├── audio.mp3             # [USER PROVIDED] Voiceover narration
│   ├── audio.wav             # Converted voiceover for transcription
│   ├── captions.json         # [GENERATED] Timestamped subtitles
│   ├── car-voice.wav         # [PRE-BUNDLED] Full car ambience master
│   ├── car-voice-trimmed.wav # [GENERATED] Trimmed to voiceover duration
│   ├── logo.png              # [PRE-BUNDLED] TravelAnimator logo
│   ├── ta-outro.mp4          # [PRE-BUNDLED] Brand outro
│   ├── bird_1.webm           # [PRE-BUNDLED] Bird overlay 1
│   ├── bird_2.webm           # [PRE-BUNDLED] Bird overlay 2
│   ├── bird_3.webm           # [PRE-BUNDLED] Bird overlay 3
│   └── bird_4.webm           # [PRE-BUNDLED] Bird overlay 4
├── package.json
├── remotion.config.ts
├── tsconfig.json
└── SKILL.md
```

## Dependencies

```json
{
  "@remotion/captions": "^4.0.429",
  "@remotion/cli": "4.0.429",
  "@remotion/google-fonts": "^4.0.429",
  "@remotion/install-whisper-cpp": "^4.0.429",
  "@remotion/media": "^4.0.429",
  "@remotion/zod-types": "^4.0.429",
  "mediabunny": "^1.35.0",
  "react": "19.2.3",
  "react-dom": "19.2.3",
  "remotion": "4.0.429",
  "zod": "^4.3.6"
}
```

Install all with `npm install` from project root.

## Quick Reference: Full Automation Command Sequence

```bash
# 1. Ensure user files are in public/ as background.mp4 and audio.mp3

# 2. Convert audio for transcription
ffmpeg -i public/audio.mp3 -ar 16000 public/audio.wav -y

# 3. Get audio duration and trim car ambience
DURATION=$(ffprobe -i public/audio.wav -show_entries format=duration -v quiet -of csv="p=0")
ffmpeg -i public/car-voice.wav -t $DURATION -c copy public/car-voice-trimmed.wav -y

# 4. Generate subtitles
npx tsx src/transcribe.mts

# 5. Update route title in src/Root.tsx (edit routeTitle defaultProp)

# 6. Render
npx remotion render TravelRoute --gl=angle --concurrency=1
```

Output: `out/TravelRoute.mp4`
