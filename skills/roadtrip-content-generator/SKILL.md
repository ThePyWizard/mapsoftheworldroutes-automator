---
name: roadtrip-content-generator
description: >
  Generates viral TikTok roadtrip voiceover scripts and appends new route entries to routes.json.
  This skill ONLY generates scripts and route JSON data — it does NOT produce videos, export
  animations, or render anything. Use this skill when the user asks to: write a voiceover script,
  add a route entry to routes.json, find trending travel destinations for scripting, or draft
  roadtrip content ideas. Trigger phrases: "write a roadtrip script", "add to routes.json",
  "find trending roadtrips", "draft route scripts", "create route entries".
  DO NOT use this skill when the user says "generate videos", "make videos", "export videos",
  "render videos", or any request that implies video output — use batch-video-pipeline instead.
---

# Roadtrip Content Generator

Generates viral TikTok roadtrip content and appends new route entries to `routes.json`.

## What This Skill Does

1. **Searches** for currently trending travel destinations, routes, and seasonal moments
2. **Selects** routes that match proven viral hook formulas (see Hook Playbook below)
3. **Writes** a punchy 40–55 second voiceover script per route
4. **Outputs** one or more complete JSON route objects in the correct schema
5. **Appends** those objects to the user's `routes.json` file (or creates it if missing)

---

## Step-by-Step Workflow

### Step 1 — Understand the Request

Identify:
- **How many routes** to generate (default: 3 if not specified)
- **Any theme or constraint** (e.g. "Pacific Northwest", "under $50 gas", "international")
- **Path to routes.json** (ask the user if not provided — needed to assign the next `id` and append)
- **Hook style** — always use Hook A (Gas Price Challenge). This is the signature style for this account and must be used on every route.

### Step 2 — Research Trending Destinations

Use web search **before writing anything**. Search for:
- Current seasonal travel trends (e.g. "best road trips spring 2026")
- What's going viral on TikTok travel right now
- Regional trending destinations (waterfalls, national parks, hidden gems, scenic drives)
- Recent news that makes a route timely (new park opening, viral video of a location, seasonal event)

Good search queries:
- `trending road trip destinations [current month] [year]`
- `TikTok viral travel spots [region] [year]`
- `best spring/summer/fall/winter road trips [year]`
- `underrated scenic drives [state or region]`
- `[destination] why trending travel 2026`

Synthesize findings into a `whyTrending` field for each route.

### Step 3 — Select Routes Using the Viral Filter

Before committing to a route, mentally score it:

| Question | Yes = 1pt |
|---|---|
| Can you make a specific, checkable claim (gas $, miles, time)? | |
| Does it have a seasonal window that creates urgency? | |
| Is there a counterintuitive or surprising element? | |
| Would it generate debate in the comments? | |
| Is it visually distinctive (not just a freeway)? | |

Score ≥ 3 → use it. Score < 3 → find a better route.

### Step 4 — Write the Voiceover Script

**Target: 40–55 seconds of spoken audio** (roughly 110–145 words at natural pace).

**Always open with Hook A — the Gas Price Challenge.** This is the non-negotiable signature hook for this account. Every script must start with: `"Did you know for about $[X] in gas you could [specific claim about this route]?"`

Estimate gas cost based on: (total miles / 28 mpg) × $3.50/gallon, rounded to the nearest $5. Always show a round number (e.g. "$60", "$110") — never a decimal.

**Script structure:**
1. **Hook** (first 3 seconds): Specific claim + implied challenge or curiosity
2. **Scene-setting** (5–8 seconds): Paint the geography and vibe
3. **Waypoint highlights** (15–25 seconds): 2–3 stops, each with one vivid detail
4. **Emotional climax** (5–8 seconds): The thing that makes it unforgettable
5. **CTA closer** (3–5 seconds): Open question or urgency statement that baits a comment

**Script quality rules:**
- Never use the phrase "hidden gem" — it's dead
- Avoid generic superlatives ("amazing", "breathtaking", "stunning") — be specific
- Include at least one specific number (miles, dollars, minutes, inches of rainfall, feet of elevation, etc.)
- The hook claim should be slightly surprising or debatable — enough to bait a comment
- End on a question or urgency trigger, not a summary

### Step 5 — Build the JSON Entry

Use this exact schema:

```json
{
  "id": <next integer after the current max id in routes.json>,
  "title": "<Origin> to <Destination> [Optional Descriptor]",
  "origin": "<City, State>",
  "destination": "<City, State>",
  "waypoints": ["<Stop 1>", "<Stop 2>", "<Stop 3>"],
  "script": "<full voiceover script>",
  "googleMapsUrl": "https://www.google.com/maps/dir/<origin_urlencoded>/<wp1_urlencoded>/.../<destination_urlencoded>",
  "whyTrending": "<2–4 sentences: why this route is trending RIGHT NOW, citing specific seasonal or cultural context found in web search>",
  "scriptDurationSeconds": <estimated seconds, 40–55>,
  "audioFile": "route-<id>-audio.wav",
  "videoFile": "route-<id>-video.mp4",
  "sfxFile": "car-voice-trimmed.wav",
  "tiktokCaption": "<TikTok caption string — see TikTok Caption Format below>"
}
```

**TikTok Caption Format (required on EVERY route):**

Format exactly: `did you know this <X>$ <trip type> from <Origin> to <Destination> <hashtags>`

Rules:
- All lowercase, no period at the end
- Dollar sign goes AFTER the number (e.g. `30$` not `$30`)
- `<X>` is the same gas-cost number used in Hook A (miles / 28 × $3.50, rounded to nearest $5)
- `<trip type>` is `roadtrip` for car routes, `train trip` for train routes
- `<Origin>` and `<Destination>` use proper-case city names (no state suffix)
- Hashtags: always start with `#travel #usroadtrip #traveltok` (swap `#usroadtrip` for the regional equivalent like `#canadaroadtrip`, `#europetrain`, `#japantrip`), then add 2–4 specific hashtags for the cities, landmarks, or theme of the route
- One sentence may be added before the hashtags if the route has a strong news/seasonal hook (e.g. "...on Route 66's 100th birthday")

Example: `did you know this 150$ train trip from Chicago to San Francisco #travel #usroadtrip #traveltok #chicago #sanfrancisco`

**googleMapsUrl construction:**
- Replace spaces with `+` in each location segment
- Replace commas with `%2C`  
- Chain locations with `/` between them
- Example: `Seattle,+WA` → `Seattle%2C+WA`

### Step 6 — Read, Append, Write routes.json

```
1. Read the current routes.json to find the current max `id`
2. Assign new ids starting from max+1
3. Append new route objects to the array
4. Write the updated array back to routes.json
5. Confirm to the user: "Added X routes (IDs Y–Z) to routes.json"
```

If `routes.json` doesn't exist yet, create it as an empty array `[]` and start ids at 1.

---

## Hook Playbook

**There is only one hook for this account: Hook A — The Gas Price Challenge.**

### Hook A — The Gas Price Challenge (required on every route)
> "Did you know for about $[X] in gas you could [specific claim about this route]?"

**Gas price formula:** `(total miles / 28 mpg) × $3.50/gallon`, rounded to the nearest $5.

Why it works:
- Specific dollar amount = instantly checkable claim → comment flood of people correcting the math
- Makes the trip feel accessible (anyone can afford gas money)
- "Did you know" framing implies the listener is missing out

**Vary the second half to keep it fresh across routes:**
- "...drive from X all the way to Y?"
- "...do a full loop from X through Y and back?"
- "...drive from X to Y and back — and still have money left over?"
- "...see [specific landmark] and [specific landmark] in a single weekend?"
- "...drive one of the most scenic roads in [region]?"

The gas amount should feel slightly surprising — either cheaper than expected (makes people save) or more than expected (makes people debate).

---

## Example Output (for reference)

```json
{
  "id": 32,
  "title": "Portland to Crater Lake — Cascades Fire Road",
  "origin": "Portland, OR",
  "destination": "Portland, OR",
  "waypoints": ["Mount Hood, OR", "Bend, OR", "Crater Lake National Park, OR"],
  "script": "Did you know for about $65 in gas you can drive from Portland to Crater Lake and back — and the only time the full rim road is open is a six-week window starting right now? The deepest lake in North America. 1,943 feet of water so clear it turns an impossible shade of blue. You head south out of Portland into the Cascades, past Mount Hood still capped in snow, cut through Bend for a coffee stop — the fastest-growing city in Oregon — then push south into Crater Lake National Park just as Rim Drive reopens after winter closure. First come, first served. The people who drove this last week are posting it everywhere. What are you waiting for?",
  "googleMapsUrl": "https://www.google.com/maps/dir/Portland%2C+OR/Mount+Hood%2C+OR/Bend%2C+OR/Crater+Lake+National+Park%2C+OR/Portland%2C+OR",
  "whyTrending": "Crater Lake Rim Drive reopens in mid-June after winter closure — a hard annual window creating seasonal urgency. Crater Lake is among the most-saved Pacific Northwest destinations on TikTok travel content in 2026. The Bend detour adds a trendy food-scene stop that broadens demographic appeal. 'Deepest lake' superlatives are naturally shareable facts.",
  "scriptDurationSeconds": 48,
  "audioFile": "route-32-audio.wav",
  "videoFile": "route-32-video.mp4",
  "sfxFile": "car-voice-trimmed.wav"
}
```

---

## Quality Checklist Before Writing routes.json

Before appending, verify each route entry has:

- [ ] Script opens with Hook A: `"Did you know for about $[X] in gas you could..."`
- [ ] Gas price is calculated from mileage (miles / 28 × $3.50), rounded to nearest $5
- [ ] Script is 110–145 words (40–55 seconds)
- [ ] At least one waypoint has a vivid, specific detail (not just a name)
- [ ] `whyTrending` cites something found via web search, not just assumed
- [ ] `googleMapsUrl` is correctly URL-encoded and chains all stops
- [ ] `id` is max existing id + 1 (or sequential for batch)
- [ ] `audioFile` / `videoFile` / `sfxFile` follow the naming convention
- [ ] `tiktokCaption` follows the exact format `did you know this <X>$ <trip type> from <Origin> to <Destination> <hashtags>` (lowercase, dollar sign after number, no period)

---

## Notes on Batch Generation

When generating 3+ routes in one session:
- Every route uses Hook A — no exceptions
- Vary geography — don't cluster all routes in the same region
- Vary gas price amounts — don't all be the same dollar range. Aim for real spread (e.g. $40, $90, $150) to reflect different trip scales
- Vary the second half of the hook sentence so they don't all sound identical
- After generating, summarize the batch for the user:
  - Route IDs and titles
  - Hook type used for each
  - Why each was selected as trending