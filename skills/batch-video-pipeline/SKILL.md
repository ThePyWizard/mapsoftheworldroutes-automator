---
name: batch-video-pipeline
description: >
  Fully automated end-to-end pipeline that generates multiple travel route videos in one go.
  Handles route research, routes.json creation, TravelAnimator map animation (with Unsplash
  images, place labels, correct model), and video export — all automated. Trigger when the
  user says things like "generate 5 roadtrip videos in united states", "generate 3 train trip
  videos in europe", "batch generate routes and export videos", "make 5 road trip videos", or
  "create train route videos". Supports both roadtrip (car) and train route types.
---

# Batch Video Pipeline

Fully automated pipeline: research routes, save to routes.json, plot in TravelAnimator with images and labels, and export videos — all in one command.

---

## Prerequisites

**Parallel AI Search MCP** must be installed for enhanced web search and content extraction:

```bash
claude mcp add --transport http "Parallel-Search-MCP" https://search-mcp.parallel.ai/mcp
```

This provides two tools used throughout the pipeline:
- **`mcp__Parallel-Search-MCP__web_search`** — agentic web search that returns concise, pre-synthesized answers (fewer calls needed vs raw search)
- **`mcp__Parallel-Search-MCP__web_fetch`** — extracts structured content from specific URLs

> **Fallback:** If Parallel AI MCP is unavailable, fall back to the built-in `WebSearch` and `WebFetch` tools. The pipeline works with either, but Parallel AI produces richer results with fewer round-trips.

---

## Trigger Phrases

- "generate N roadtrip videos in [region]"
- "generate N train trip videos in [region]"
- "batch generate N routes and export"
- "make N road trip / train trip videos"

---

## Step 0 — Parse the Command

Extract three pieces from the user's message:

| Field | Example | Default |
|-------|---------|---------|
| **count** | "5" | 3 |
| **routeType** | "roadtrip" or "train" | "roadtrip" |
| **region** | "united states", "europe", "japan" | "united states" |

Map `routeType` to configuration:

| routeType | model_id | texture_id | model_name | sfxFile | real_route |
|-----------|----------|------------|------------|---------|------------|
| roadtrip | 104 | 109 | Family Car (Red) | car-voice-trimmed.wav | true |
| train | 242 | 306 | Amtrak Train | train-voice.mp3 | true |

> For international train routes, pick a region-appropriate train model:
> - US/Canada: Amtrak Train (model_id: 242, texture_id: 306)
> - Japan: Shinkansen Train (model_id: 241, texture_id: 305)
> - Europe (France): TGV Duplex (model_id: 246, texture_id: 310)
> - Europe (Germany): ICE Train (model_id: 245, texture_id: 309)
> - UK: Hitachi Express (model_id: 323, texture_id: 418)
> - India: Vande Bharat (model_id: 253, texture_id: 317)
> - Default fallback: Bullet Train (model_id: 108, texture_id: 117)

---

## Step 1 — Research & Generate Routes (Content Generation Phase)

This step combines the roadtrip-content-generator workflow. Run it for ALL routes before moving to TravelAnimator.

### 1a. Web Search for Trending Routes

Use `mcp__Parallel-Search-MCP__web_search` for route discovery. The agentic mode returns pre-synthesized, concise answers — so use **rich, detailed queries** instead of multiple simple ones.

**For roadtrip — single rich query:**
```
mcp__Parallel-Search-MCP__web_search({
  query: "Find [count] trending viral road trip routes in [region] for [current month] [year]. For each route provide: origin city, destination city, 2-3 key waypoints, approximate driving distance in miles, estimated gas cost at $3.50/gallon and 28mpg, and why it's currently trending on social media or TikTok."
})
```

**For train — single rich query:**
```
mcp__Parallel-Search-MCP__web_search({
  query: "Find [count] best scenic train routes in [region] for [current month] [year]. For each route provide: origin city, destination city, key stops, train operator name, approximate ticket price, journey duration, and why it's a must-ride route or trending on social media."
})
```

**Optional supplementary search** (run in parallel with the main query if count > 3):
```
mcp__Parallel-Search-MCP__web_search({
  query: "TikTok viral [roadtrip/train] routes [region] [year] hidden gems underrated"
})
```

> **Why this is better:** The old approach required 3-4 separate `WebSearch` calls returning raw links that Claude had to cross-reference. Parallel AI's agentic mode does the synthesis in one call, returning structured answers ready to use. For 5 routes, this saves ~6-8 tool calls.

### 1b. Select Routes

Pick `count` routes that score >= 3 on the viral filter:

| Question | Yes = 1pt |
|---|---|
| Can you make a specific, checkable claim (gas/ticket $, miles, time)? | |
| Does it have a seasonal window that creates urgency? | |
| Is there a counterintuitive or surprising element? | |
| Would it generate debate in the comments? | |
| Is it visually distinctive? | |

### 1c. Write Voiceover Scripts

**For roadtrip routes** — use Hook A (Gas Price Challenge):
> "Did you know for about $[X] in gas you could [specific claim]?"
> Gas formula: (total miles / 28 mpg) x $3.50/gallon, rounded to nearest $5.

**For train routes** — use Hook T (Ticket Price Challenge):
> "Did you know for about $[X] you could ride one of the most [superlative] train routes in [region]?"
> Research actual ticket prices using Parallel AI:
> ```
> mcp__Parallel-Search-MCP__web_search({
>   query: "[Train operator] ticket price [origin] to [destination] [year] economy class one-way"
> })
> ```
> Round to nearest $5 or $10.

Script requirements: 40-55 seconds (110-145 words). Same structure as roadtrip-content-generator.

### 1c-verify. Fact-Check Key Claims

Before finalizing scripts, verify the specific claims (distances, costs, travel times) using Parallel AI. Run all fact-checks **in parallel**:

```
// Run these simultaneously — one per route
mcp__Parallel-Search-MCP__web_search({
  query: "driving distance [origin] to [destination] via [waypoints] in miles"
})

mcp__Parallel-Search-MCP__web_search({
  query: "[origin] to [destination] road trip travel time hours"
})
```

If a claim is off by more than 15%, correct the script before proceeding. This prevents inaccurate hooks from going into the final video.

### 1d. Build Route JSON Entries

Read current `routes.json` to find max `id`. Assign new IDs starting from `max_id + 1`.

Schema per route:
```json
{
  "id": <next_id>,
  "title": "<Origin> to <Destination>",
  "origin": "<City, State/Country>",
  "destination": "<City, State/Country>",
  "waypoints": ["<Stop1>", "<Stop2>", "<Stop3>"],
  "script": "<voiceover script>",
  "googleMapsUrl": "https://www.google.com/maps/dir/<encoded_stops>",
  "whyTrending": "<2-4 sentences from web research>",
  "scriptDurationSeconds": <40-55>,
  "audioFile": "route-<id>-audio.wav",
  "videoFile": "route-<id>-video.mp4",
  "sfxFile": "<based on routeType - see table above>"
}
```

### 1e. Append to routes.json

Read, append all new routes, write back. Confirm: "Added N routes (IDs X-Y) to routes.json."

### 1f. Populate `locationImages` via the Wikipedia scraper

Run the Python image scraper **once** against the newly-added route ids. It fetches a representative Wikipedia image for every location (origin + waypoints + destination) and writes the URLs back into `routes.json` as an ordered `locationImages` array.

```bash
python scripts/scrape_location_images.py <id1> <id2> <id3> ...
# or, to only fill routes that don't already have images:
python scripts/scrape_location_images.py --missing
```

The script (`scripts/scrape_location_images.py`):
- Hits Wikipedia's REST summary API for each location
- Falls back to stripping `", STATE"` / `", Country"` suffix, then to MediaWiki opensearch
- Writes a `locationImages: [url, url, ...]` array to each route, matching the exact point order: `[origin, ...waypoints, destination]`
- Leaves `null` in the array for any location it couldn't resolve

After this step, every route you're about to export has its images pre-fetched. Step 3b reads them directly from `routes.json` instead of calling Unsplash per location.

> **Requirement:** `pip install requests` (one-time). The script uses a polite 0.2s delay and a proper User-Agent so Wikipedia won't rate-limit it.

---

## Step 2 — Geocode All Locations

For each route, geocode every location (origin + all waypoints + destination) to get latitude/longitude coordinates.

**Primary method — Parallel AI batch geocoding (preferred):**

Use `mcp__Parallel-Search-MCP__web_search` with a batch query to geocode multiple locations at once:

```
mcp__Parallel-Search-MCP__web_search({
  query: "Latitude and longitude coordinates for these cities: Nashville TN, Memphis TN, Jackson MS, New Orleans LA. Return each as city name, latitude, longitude."
})
```

This can geocode **all locations for one route in a single call** thanks to the agentic synthesis. For multiple routes, run one batch query per route in parallel:

```
// Route 1 — all locations in one call
mcp__Parallel-Search-MCP__web_search({
  query: "Latitude longitude for: Nashville TN, Memphis TN, New Orleans LA"
})

// Route 2 — all locations in one call (parallel with Route 1)
mcp__Parallel-Search-MCP__web_search({
  query: "Latitude longitude for: Chicago IL, Madison WI, Milwaukee WI"
})

// Route 3, 4, 5... all in parallel
```

> **Old approach:** One `WebSearch` call per location (e.g., 5 routes × 5 locations = 25 calls).
> **New approach:** One `web_search` call per route (e.g., 5 routes = 5 calls, all parallel).
> **Savings:** ~80% fewer tool calls for geocoding.

**Fallback** — if batch geocoding returns incomplete results for any location:
```
mcp__Parallel-Search-MCP__web_search({
  query: "\"<City, State>\" exact latitude longitude coordinates GPS"
})
```

**Build a geocoded points array for each route:**
```
[
  { location: "Nashville, TN", lat: 36.1627, lng: -86.7816 },
  { location: "Memphis, TN", lat: 35.1495, lng: -90.0490 },
  ...
]
```

> **IMPORTANT:** Run all per-route geocoding calls in parallel. Batch as many locations into a single query as possible to minimize tool calls.

---

## Step 3 — TravelAnimator Export (Per Route, Sequential)

For each route, execute the following steps in order. **Routes must be processed one at a time** because TravelAnimator can only handle one route at a time.

### 3a. Clear Existing Route

```
mcp__travel-animator__clear_route()
```

### 3b. Create Route with All Points

Build the points array with labels and model for each waypoint. **Images are NOT passed to TravelAnimator anymore** — Remotion composites the location images on top of the exported map video in Step 5 of the render pipeline. `locationImages` in `routes.json` is still required because the Remotion composition reads it directly.

For each route:

```
route = routes.json entry for this id
points_order = [route.origin, ...route.waypoints, route.destination]
// route.locationImages stays in routes.json; do not pass to TravelAnimator
```

If `locationImages` is missing on a route, regenerate it before rendering (not before TravelAnimator export):

```bash
python scripts/scrape_location_images.py <id>
```

### 3b-validate. Validate Image URLs

Validation still happens so Remotion doesn't render a broken image. Run one HTTP HEAD per URL in the route, **all in parallel**:

```bash
curl --max-time 5 -sI -o /dev/null -w "%{http_code} %{content_type}" -L "<image_url>"
```

A URL is valid when:
1. HTTP status is `200`
2. Content-Type starts with `image/`

**Handling invalid or `null` entries** (same fallback chain as before — patch the fix back into `routes.json` under `locationImages[i]`):
  1. **Parallel AI web_fetch** on the Wikipedia page:
     ```
     mcp__Parallel-Search-MCP__web_fetch({
       url: "https://en.wikipedia.org/wiki/<location_name>",
       prompt: "Return the URL of the main infobox image on this page."
     })
     ```
  2. **Parallel AI web_search**:
     ```
     mcp__Parallel-Search-MCP__web_search({
       query: "<location> landscape travel photography high resolution image URL"
     })
     ```
  3. **Null out `locationImages[i]`**: Remotion's `LocationImages` layer skips null/empty entries gracefully.

**Create the route with labels + model only (no image annotations):**

```
mcp__travel-animator__create_route({
  points: [
    {
      latitude: <lat>,
      longitude: <lng>,
      label: "<City Name>",
      model: { id: <model_id>, textureId: <texture_id> },
      annotation: {
        text: "<City Name>",
        frameName: "ROUNDED"
      }
    },
    // ... repeat for each point
  ]
})
```

**Point configuration:**
- `label`: Short city/place name (e.g. "Nashville", not "Nashville, Tennessee")
- `model`: Set on EVERY point using the model_id/texture_id from the routeType table
- `annotation.text`: Same as label — the city/place name
- `annotation.frameName`: Use `"ROUNDED"` for clean look
- `annotation.media`: **Do not set.** Images are composited by Remotion (141×106, below title, evenly split across the main video duration).

> ⚠️ **Do NOT use `update_point` to set annotations or models.** It returns `success: true` but silently drops the annotation on non-origin waypoints. If you need to change a point later, clear the route and recreate it.

### 3c. Enable Real Route for Each Segment

For each point EXCEPT the last one (destination), enable real route:

```
for index in 0..(totalPoints - 2):
    mcp__travel-animator__set_real_route({ index: index, enabled: true })
```

> **Run these in parallel** — all set_real_route calls for a single route can execute simultaneously.

### 3d. Configure Animation State

Apply all visual settings in a single call:

```
mcp__travel-animator__update_animation_state({
  aspect_ratio: "RATIO_9_16",
  selected_map_id: 59,            // Terrain
  model_size: 0.3,
  line_style: {
    type: "SOLID",
    color: "#FF0000",
    width: 4.0
  },
  distance_unit: "DISTANCE_MILE",
  video_duration: 60,
  resolution: "RESOLUTION_FHD",
  projection: "MERCATOR",
  place_label_visibility: "VISIBILITY_STYLE_ALWAYS",
  place_label_color: "#FF000000",  // Black (ARGB)
  place_label_scale: 1.7,          // 2x
  place_label_style: "PLACE_LABEL_STYLE_ROUNDED",
  show_map_labels: true,
  smoothening_factor: 0.5
})
```

### 3e. Export Video

Start the export:
```
result = mcp__travel-animator__export_video()
session_id = result.session_id
```

### 3f. Poll Export Progress

Check progress every 15-20 seconds until complete:

```
loop:
    progress = mcp__travel-animator__get_export_progress({ session_id: session_id })
    if progress.state == "completed": break
    if progress.state == "failed": report error and skip this route
    wait 15 seconds
```

> Use `Bash` with `sleep 15` between polling calls. Do NOT poll more frequently than every 15 seconds.

### 3g. Download Exported Video

Once export is complete, get the download URL and save:

```
video = mcp__travel-animator__get_exported_video({ session_id: session_id })
download_url = video.url
```

Download and save to public/:
```bash
curl -L "<download_url>" -o "public/route-<id>-video.mp4"
```

Verify:
```bash
ls -lh public/route-<id>-video.mp4
```

### 3h. Log Completion

After each route export, report:
> "Route <id> (<title>) — exported to public/route-<id>-video.mp4"

Then proceed to the next route (back to Step 3a).

---

## Step 4 — Summary Report

After all routes are processed, print a summary table:

```
## Batch Export Complete

| ID | Title | Video File | Status |
|----|-------|------------|--------|
| 41 | Nashville to New Orleans | public/route-41-video.mp4 | OK |
| 42 | Chicago to Milwaukee | public/route-42-video.mp4 | OK |
| ... | ... | ... | ... |

Routes added to routes.json: IDs 41-45
Videos exported: 5/5
Next step: Run `npm run generate-audio -- 41 42 43 44 45` to generate voiceovers
Then run: `npm run render-all -- 41 42 43 44 45` to produce final Remotion videos
```

---

## Parallel Execution Strategy

To maximize speed, parallelize where possible. Parallel AI's agentic search reduces total tool calls significantly.

| Phase | Parallelism | Tool | Calls (old → new) |
|-------|-------------|------|--------------------|
| Route research (Step 1a) | Parallel | `Parallel-Search-MCP__web_search` | 3-4 → 1-2 per batch |
| Price research (Step 1c) | Parallel | `Parallel-Search-MCP__web_search` | 1 per route | 
| Fact-checking (Step 1c-verify) | Parallel — all routes at once | `Parallel-Search-MCP__web_search` | New step, 1-2 per route |
| Geocoding (Step 2) | Parallel — one call per route | `Parallel-Search-MCP__web_search` | 25 → 5 (for 5 routes × 5 locations) |
| Image URL fetching (Step 1f) | One Python run covers all locations for all new routes | `scripts/scrape_location_images.py` | N×M WebFetch → 1 subprocess |
| Image URL validation (Step 3b-validate) | Parallel — all URLs via curl HEAD | `curl --max-time 5 -sI` | 1 per URL |
| Image fallback (Step 3b-validate) | Only for `null` or invalid URLs | `Parallel-Search-MCP__web_fetch` / `web_search` | Rarely needed — Wikipedia is stable |
| Route creation in TravelAnimator | **Sequential** — one route at a time | TravelAnimator MCP | Unchanged (app limitation) |
| set_real_route within one route | Parallel — all segments at once | TravelAnimator MCP | Unchanged |
| Video export polling | Sequential — wait for each | TravelAnimator MCP | Unchanged |

> **Total tool-call savings estimate (5-route batch):** ~60-70% fewer search/geocode calls compared to raw `WebSearch` approach.

---

## Configuration Reference

### Map Style
- **Terrain** (id: 59) — default for all routes

### Models by Route Type

| Route Type | Model | model_id | texture_id |
|------------|-------|----------|------------|
| roadtrip | Family Car (Red) | 104 | 109 |
| train (US) | Amtrak Train | 242 | 306 |
| train (Japan) | Shinkansen | 241 | 305 |
| train (France) | TGV Duplex | 246 | 310 |
| train (Germany) | ICE Train | 245 | 309 |
| train (UK) | Hitachi Express | 323 | 418 |
| train (India) | Vande Bharat | 253 | 317 |
| train (default) | Bullet Train | 108 | 117 |

### Animation Settings
- Aspect ratio: 9:16
- Duration: 60 seconds
- Resolution: Full HD (1920x1080)
- Map: Terrain
- Model size: 0.3
- Path: Solid, Red (#FF0000), width 4.0
- Units: Miles
- Place labels: Always visible, Black, 1.7x scale, Rounded style
- Smoothening: 0.5

### SFX Mapping
| Route Type | sfxFile |
|------------|---------|
| roadtrip | car-voice-trimmed.wav |
| train | train-voice.mp3 |

---

## Error Recovery

| Error | Recovery |
|-------|----------|
| Parallel AI MCP unavailable | Fall back to built-in `WebSearch` and `WebFetch` for all search steps |
| Geocoding fails for a location | Retry with individual `web_search` query; if still failing, try alternate name (e.g. "NYC" → "New York City, NY") |
| create_route fails | Clear route and retry once |
| set_real_route fails for a segment | Skip that segment (straight line is acceptable) |
| Export fails | Clear route, recreate, and retry export once |
| Download fails | Retry download; if still failing, log the session_id for manual recovery |
| `locationImages` missing on a route | Run `python scripts/scrape_location_images.py <id>` before Step 3b |
| Wikipedia image missing (`null`) for a location | Parallel AI `web_fetch` on the Wikipedia page → `web_search` for image URL → skip image (annotation text still shows) |
| Image URL fails validation (non-200 or non-image content-type) | Same fallback chain as `null`: `web_fetch` → `web_search` → skip |
| `scripts/scrape_location_images.py` errors (e.g. missing `requests`) | `pip install requests`, then re-run |

---

## Important Notes

- **Always clear route before creating a new one** — TravelAnimator only supports one active route
- **Process routes sequentially through TravelAnimator** — parallel route creation is not possible
- **The 60-second duration** is fixed for this pipeline — do not change unless user explicitly requests it
- **Terrain map (id: 59)** is the default — do not change unless user explicitly requests it
- **Place labels must be visible** — they are a key visual element for the TikTok content
- **All routes get the same visual settings** — consistency across the batch is important for the brand
