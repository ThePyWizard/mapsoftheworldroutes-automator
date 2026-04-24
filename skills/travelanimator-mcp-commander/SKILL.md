---
name: travelanimator-mcp-commander
description: >
  End-to-end pipeline for generating a TravelAnimator TikTok video for the
  @mapsoftheworldroutes brand. Use this skill whenever the user says
  "generate a travelanimator video using <model>" (model = car / pickup truck /
  train / plane / boat) or any equivalent phrasing like "make a travelanimator
  roadtrip", "generate a train trip video", "create a boat voyage video",
  "render a flight route". The skill researches a fresh route matching the
  model, appends to routes.json, plots + exports the map animation via the
  TravelAnimator MCP, generates voiceover + captions, scrapes waypoint
  images, and produces the final Remotion render at
  `out/route-<id>-<title>.mp4`.
---

# TravelAnimator Pipeline Commander

Orchestrates the full video-generation pipeline for one new route, from web research to final Remotion render. Driven by a single input: the **model name**.

---

## Trigger Phrases

- `generate a travelanimator video using <model>`
- `make a travelanimator <trip type>`
- `create a <model> travel video`
- `render a <trip type> route`

Where `<model>` is one of: **car** (aka pickup truck), **train**, **plane**, **boat**.

---

## What the Model Name Controls

The model name is the single source of truth for the whole run. It drives **four** things:

| Model input | Trip type for research | 3D model in TA | SFX file | Real route |
|---|---|---|---|---|
| `car` / `pickup truck` | road trip | Pickup Truck (id 56, textureId 61) | `car-voice-trimmed.wav` | **ON** (all non-destination segments) |
| `train` | train trip | Train — look up via `list_models` | `train-voice.mp3` | OFF |
| `plane` / `flight` | flight / long-haul route | Plane — look up via `list_models` | `plane-voice.mp3` | OFF |
| `boat` | boat voyage / ferry crossing | Boat — look up via `list_models` | `boat-voice.mp3` | OFF |

> **Why real route is only for car/pickup:** TravelAnimator's real-route API follows road geometry. Trains, planes, and boats don't ride on roads — straight-line + smoothening is the correct visual for them.

Default model is **pickup truck** if the user doesn't specify. If they say "pickup truck" use `id: 56, textureId: 61` directly. For the other three, call `mcp__travel-animator__list_models` at the start of the session to discover the current ids.

---

## Prerequisites (verify before starting)

1. TravelAnimator app is open on the user's phone
2. MCP server is enabled inside the app (tools `mcp__travel-animator__*` are visible)
3. `.env` has `ELEVENLABS_API_KEY` (for voiceover generation)
4. Python 3 + `requests` available (for image scraping)
5. `routes.json` exists at project root

If MCP tools aren't visible, tell the user:
> "I can't see the TravelAnimator MCP tools. Please open TravelAnimator, enable the MCP server in settings, and reconnect."

---

## Full Pipeline — Ordered + Parallel

```
┌─────────────────────────────────────────────────────────────────┐
│ 1. Route research (subagent, parallel web search)               │
│    → returns JSON entry to append to routes.json                │
└─────────────────────────────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────────────────────────────┐
│ 2. Append entry to routes.json with new id                      │
└─────────────────────────────────────────────────────────────────┘
                    ↓
         ┌──────────┴──────────┬───────────────────────┐
         ↓                     ↓                       ↓
┌─────────────────┐  ┌────────────────────┐  ┌─────────────────────┐
│ 3a. Plot + export│  │ 3b. generate-audio │  │ 3c. scrape images    │
│ via TA MCP       │  │ (ElevenLabs)       │  │ (Wikipedia)          │
│ → public/route-  │  │ → public/route-    │  │ → routes.json locale │
│   <id>-video.mp4 │  │   <id>-audio.wav   │  │   Images field       │
└─────────────────┘  └────────────────────┘  └─────────────────────┘
         └──────────┬──────────┴───────────────────────┘
                    ↓
┌─────────────────────────────────────────────────────────────────┐
│ 4. set-sfx — bind correct SFX file to this route                │
└─────────────────────────────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────────────────────────────┐
│ 5. render-all — transcribe + Remotion render                    │
│    → out/route-<id>-<title>.mp4                                 │
└─────────────────────────────────────────────────────────────────┘
```

Steps 3a / 3b / 3c are **independent** — run them in parallel to save wall-clock time.

---

## Step 1 — Route Research via Subagent

Delegate this to a subagent so the raw web content never enters the main context.

Use the `Agent` tool (`subagent_type: "general-purpose"`) with a prompt like:

```
Find ONE currently-trending <TRIP_TYPE> route for the @mapsoftheworldroutes
TikTok brand. Use Parallel MCP web search (mcp__Parallel-Search-MCP__web_search_preview)
or WebSearch. The route must be real, drivable/rideable/flyable/sailable today,
and newsworthy or seasonal RIGHT NOW (current date: <today>).

Return ONLY a JSON object matching this schema:

{
  "title": "<Origin> to <Destination> [optional descriptor]",
  "origin": "<City, State/Country>",
  "destination": "<City, State/Country>",
  "waypoints": ["Stop 1", "Stop 2", "Stop 3"],
  "script": "<40-55 second Hook A voiceover>",
  "googleMapsUrl": "...",
  "whyTrending": "<2-4 sentences citing specific trending context>",
  "scriptDurationSeconds": <40-55>,
  "totalDistance": <miles or km>,
  "tiktokCaption": "<per mapsoftheworldroutes format>"
}

Script rules:
- Open with Hook A: "Did you know for about $[X] in <fuel/fare> you could..."
  - For car: gas = miles / 28 × $3.50 rounded to nearest $5
  - For train/plane/boat: use a realistic fare figure and say "fare" not "gas"
- 110-145 words, one specific numeric claim, ends on a question
- No "hidden gem", no generic superlatives

TikTok caption format: `did you know this <X>$ <trip type> from <Origin> to <Destination> <hashtags>`
- <trip type> = roadtrip / train trip / flight / boat voyage
- All lowercase, dollar after the number, no period at the end
- Start hashtags with #travel #<region>roadtrip (or #trainjourney/#flight/#ferry) #traveltok

Do not write anything outside the JSON. Do not include research notes.
```

When the subagent returns, validate it, then proceed to Step 2.

**Token-saver note:** do NOT do the web search in the main thread. The subagent eats the article content and returns a distilled JSON entry.

---

## Step 2 — Append to routes.json

Read `routes.json`, find `max(id)`, write a new entry with `id = max + 1`. Full schema:

```json
{
  "id": <new id>,
  "title": "...",
  "origin": "...",
  "destination": "...",
  "waypoints": [...],
  "script": "...",
  "googleMapsUrl": "...",
  "whyTrending": "...",
  "scriptDurationSeconds": <num>,
  "audioFile": "route-<id>-audio.wav",
  "videoFile": "route-<id>-video.mp4",
  "sfxFile": "<set in step 4>",
  "totalDistance": <num>,
  "captionStyle": 1,
  "tiktokCaption": "...",
  "locationImages": []        // populated in step 3c
}
```

Write via a small Node script (never hand-edit JSON when appending — whitespace errors are silent killers).

---

## Step 3a — Plot + Export Map Animation (TravelAnimator MCP)

### 3a.1. Clear any existing route

```
mcp__travel-animator__clear_route()
```

(Safe to call even if empty.)

### 3a.2. Create the route in one call

Always use `create_route` with the **full point array including every model** — per-point `update_point` calls silently drop annotations/models on non-origin waypoints.

```
mcp__travel-animator__create_route({
  points: [
    { latitude, longitude, label, countryCode, model: {id, textureId} },
    ...one per origin + waypoint + destination
  ]
})
```

- For **car / pickup truck**: `model: { id: 56, textureId: 61 }` on every point (user default — see memory).
- For **train / plane / boat**: call `mcp__travel-animator__list_models` first, pick the model whose `name` matches the trip type, use its `id` and first available `textureId`. Apply it to every point.

### 3a.3. Apply default animation state

```
mcp__travel-animator__update_animation_state({
  selected_map_id: 59,                       // Terrain
  aspect_ratio: "RATIO_9_16",
  model_size: 0.2,
  place_label_style: "PLACE_LABEL_STYLE_CHAT",
  place_label_scale: 1.7,                    // max (API caps at 1.7)
  place_label_color: "#FF000000",            // solid black (ARGB)
  place_label_visibility: "VISIBILITY_STYLE_ALWAYS",
  smoothening_factor: 0.5,                   // smooth curves everywhere
  line_style: { type: "AUTO", width: 4.0, color: "#FF0000" },
  video_duration: <min(scriptDurationSeconds, 60)>,
  distance_unit: "DISTANCE_MILE"
})
```

### 3a.4. Enable real route (car/pickup ONLY)

```
for each index in 0..(points.length - 2):
    mcp__travel-animator__set_real_route({ index, enabled: true })
```

**Skip this step entirely for train / plane / boat** — their paths are straight + smoothened, not road-constrained.

### 3a.5. Export the video

```
mcp__travel-animator__export_video()
# then poll:
mcp__travel-animator__get_export_progress()
# when done:
mcp__travel-animator__get_exported_video()   // returns URL
```

Download the result into `public/route-<id>-video.mp4`:

```bash
curl -L "<export_url>" -o "public/route-<id>-video.mp4"
```

---

## Step 3b — Generate Voiceover Audio (parallel with 3a)

```bash
npm run generate-audio -- <id>
```

This reads the script from `routes.json` by id and writes `public/route-<id>-audio.wav` via ElevenLabs.

Run this with `run_in_background: true` the moment routes.json is saved in step 2 — it takes 20–60s and is independent of the map export.

---

## Step 3c — Scrape Waypoint Images (parallel with 3a)

```bash
python scripts/scrape_location_images.py <id>
```

The script fetches a representative Wikipedia image for **origin + each waypoint + destination**, in order, and writes them back to `routes.json` as `locationImages`. Remotion reads this array during render.

Also backgroundable — it hits Wikipedia with 200ms delays, usually 5–20s total.

---

## Step 4 — Bind the SFX File

```bash
npm run set-sfx -- <id> <voice>
```

Where `<voice>` is `car` / `train` / `plane` / `boat`. This updates the route's `sfxFile` field to the correct file (`car-voice-trimmed.wav`, `train-voice.mp3`, `plane-voice.mp3`, `boat-voice.mp3`).

Must run **after** routes.json is saved and **before** `render-all`.

> For car routes, `car-voice-trimmed.wav` is expected to already be trimmed to match the voiceover length. If it's missing or stale:
> ```bash
> DUR=$(ffprobe -i public/route-<id>-audio.wav -show_entries format=duration -v quiet -of csv="p=0")
> ffmpeg -i public/car-voice.wav -t $DUR -c copy public/car-voice-trimmed.wav -y
> ```

---

## Step 5 — Render the Final Video

```bash
npm run render-all -- <id>
```

`render-all` will:
1. Validate `public/route-<id>-video.mp4` + `public/route-<id>-audio.wav` exist
2. Whisper-transcribe the audio → `public/route-<id>-captions.json`
3. Render the Remotion composition → `out/route-<id>-<title>.mp4`

---

## Default Settings Reference (codified)

| Setting | Value | API enum / field |
|---|---|---|
| Map | Terrain | `selected_map_id: 59` |
| Aspect ratio | 9:16 | `aspect_ratio: "RATIO_9_16"` |
| Model size | 0.2 | `model_size: 0.2` |
| Place label style | Chat bubble | `place_label_style: "PLACE_LABEL_STYLE_CHAT"` |
| Place label scale | 1.7 (max) | `place_label_scale: 1.7` |
| Place label color | Black | `place_label_color: "#FF000000"` |
| Place label visibility | Always | `place_label_visibility: "VISIBILITY_STYLE_ALWAYS"` |
| Smoothening | 0.5 | `smoothening_factor: 0.5` |
| Line style | AUTO, width 4.0, red | `line_style: { type: "AUTO", width: 4.0, color: "#FF0000" }` |
| Distance unit | Miles | `distance_unit: "DISTANCE_MILE"` |
| Duration | = `scriptDurationSeconds`, capped at 60 | `video_duration` |
| Real route | On (car/pickup only) / Off (others) | per-segment `set_real_route` |
| Default vehicle | Pickup Truck (56, 61) | memory preference |

---

## Error Handling

| Problem | Action |
|---|---|
| MCP tools not visible | Ask user to enable MCP in TA settings + reconnect |
| `create_route` fails with "route already exists" | Call `clear_route` then retry |
| Export URL not returned | Retry `get_export_progress`; if stuck, ask user to check app |
| Downloaded video is 0 bytes | Redownload; if persists, ask user to export manually |
| `generate-audio` ElevenLabs 401 | Tell user to check `ELEVENLABS_API_KEY` in `.env` |
| `scrape_location_images.py` misses a location | Acceptable — `locationImages` nulls are handled in Remotion |
| Real-route toggled for non-car | Not a failure, but remove it — straight paths are the correct visual |

---

## Token-Usage Reminders

- **Do NOT** do the web research in the main thread — always delegate to a subagent that returns only the final JSON entry.
- **Do NOT** read back image URLs from `scrape_location_images.py` — the script writes directly to routes.json; never pipe its stdout into context.
- **Do NOT** call `get_animation_state` or `get_route` repeatedly — read the doc schema above instead.
- **Do NOT** inline large routes.json reads — use a small Node script when appending/editing.
- **Background** `generate-audio` + `scrape_location_images.py` + the TA export wait loop. Move on to other prep while they run.

---

## Output Summary (confirm to user at the end)

```
✅ Route <id>: <title>
   Map video:  public/route-<id>-video.mp4
   Voiceover:  public/route-<id>-audio.wav
   SFX:        <sfx file>
   Captions:   public/route-<id>-captions.json
   Final:      out/route-<id>-<title>.mp4
   TikTok:     <tiktokCaption>
```
