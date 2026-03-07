/**
 * Travel Route Research Agent (Apify Edition)
 *
 * Usage: npm run agent
 *
 * What it does:
 *   1. Uses Apify to scrape Reddit r/roadtrips + TikTok for trending travel content
 *   2. Extracts "City to City" route patterns from scraped posts/videos
 *   3. Generates TikTok-style voiceover scripts via templates
 *   4. Creates TTS audio using Kokoro (local, free, no API key needed)
 *   5. Saves audio as public/route-N-audio.wav and routes.json
 *
 * Required env vars in .env:
 *   APIFY_API_KEY — apify.com (free tier available)
 */

import { ApifyClient } from "apify-client";
import { KokoroTTS } from "kokoro-js";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.join(__dirname, "..");
const PUBLIC = path.join(ROOT, "public");

// Load .env manually
const envPath = path.join(ROOT, ".env");
if (fs.existsSync(envPath)) {
  const lines = fs.readFileSync(envPath, "utf-8").split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    const val = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, "");
    if (!process.env[key]) process.env[key] = val;
  }
}

if (!process.env.APIFY_API_KEY) {
  console.error("Missing APIFY_API_KEY in .env");
  console.error("   Get a free key at: https://apify.com (free tier available)");
  process.exit(1);
}

export interface RouteIdea {
  id: number;
  title: string;
  origin: string;
  destination: string;
  waypoints: string[];
  script: string;
  googleMapsUrl: string;
  whyTrending: string;
  audioFile: string;
  videoFile: string;
}

// Words that commonly appear before "to" but are NOT place names
const STOP_WORDS = new Set([
  // Question / filler words
  "How", "What", "When", "Where", "Why", "Who", "The", "This", "That",
  "From", "Back", "Next", "Last", "First", "Ready", "Going", "Looking",
  "Due", "Thanks", "Welcome", "Home", "Road", "Way", "Trip", "Drive",
  "New", "Up", "Down", "Out", "Off", "On", "In", "As", "So", "And",
  "But", "Or", "Just", "Need", "Want", "Try", "Got", "Get", "See",
  "Been", "Best", "Top", "Most", "More", "Any", "All", "One", "Two",
  "Three", "Four", "Five", "Days", "Day", "Week", "Month", "Year",
  "Adding", "Planning", "Driving", "Flying", "Going",
  // Outdoor activities / verbs that can appear capitalized
  "Hike", "Hiking", "Bike", "Biking", "Swim", "Swimming",
  "Walk", "Walking", "Run", "Running", "Ski", "Skiing",
  "Camp", "Camping", "Fish", "Fishing", "Hunt", "Hunting",
  "Climb", "Climbing", "Ride", "Riding", "Sail", "Sailing",
  "Surf", "Surfing", "Raft", "Rafting", "Trek", "Trekking",
  "Kayak", "Kayaking", "Paddle", "Paddling",
  // Common action verbs
  "Stop", "Head", "Heading", "Move", "Moving", "Come", "Coming",
  "Make", "Making", "Take", "Taking", "Have", "Having", "Give",
  "Keep", "Find", "Finding", "Turn", "Turning", "Cross", "Crossing",
  // Travel/exploration verbs
  "Visit", "Visiting", "Explore", "Exploring", "Return", "Returning",
  "Travel", "Traveling", "Pack", "Packing",
]);

// Regex: captures "ProperNoun [ProperNoun]  to  ProperNoun [ProperNoun]"
// Each part: 1-4 capitalized words, optionally with comma-separated state abbreviation
const ROUTE_REGEX =
  /\b([A-Z][a-z]{2,}(?:[\s,]+[A-Z][a-z]{2,}){0,3})\s+to\s+([A-Z][a-z]{2,}(?:[\s,]+[A-Z][a-z]{2,}){0,3})\b/g;

function isLikelyPlace(name: string): boolean {
  const first = name.split(/\s+/)[0];
  return !STOP_WORDS.has(first) && name.length > 3 && name.length < 60;
}

function normalizeTitle(origin: string, destination: string): string {
  // Trim trailing punctuation / short words that leaked in
  const clean = (s: string) =>
    s
      .replace(/[,.]$/, "")
      .replace(/\s+(the|a|an|and|or|of|in|on|at|to|for|with)$/i, "")
      .trim();
  return `${clean(origin)} to ${clean(destination)}`;
}

interface ScrapedRoute {
  title: string;
  origin: string;
  destination: string;
  score: number;
  context: string;
}

function extractRoutes(texts: string[]): ScrapedRoute[] {
  const routeMap = new Map<string, { score: number; context: string }>();

  for (const text of texts) {
    if (!text) continue;
    ROUTE_REGEX.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = ROUTE_REGEX.exec(text)) !== null) {
      const [, rawOrigin, rawDest] = match;
      if (!isLikelyPlace(rawOrigin) || !isLikelyPlace(rawDest)) continue;

      const title = normalizeTitle(rawOrigin, rawDest);
      const existing = routeMap.get(title);
      // Grab ~200 chars of surrounding context for later use
      const ctx = text.slice(
        Math.max(0, match.index - 100),
        Math.min(text.length, match.index + 200),
      );
      if (existing) {
        existing.score += 1;
      } else {
        routeMap.set(title, { score: 1, context: ctx });
      }
    }
  }

  const all = Array.from(routeMap.entries())
    .map(([title, data]) => {
      const sepIdx = title.indexOf(" to ");
      return {
        title,
        origin: title.slice(0, sepIdx),
        destination: title.slice(sepIdx + 4),
        ...data,
      };
    })
    .filter((r) => r.origin.length > 2 && r.destination.length > 2)
    .sort((a, b) => b.score - a.score);

  // Prefer routes mentioned more than once; fall back to score >= 1 if not enough
  const highConfidence = all.filter((r) => r.score >= 2);
  return highConfidence.length >= 3 ? highConfidence : all;
}

function buildGoogleMapsUrl(
  origin: string,
  destination: string,
  waypoints: string[],
): string {
  const stops = [origin, ...waypoints, destination]
    .map((s) => encodeURIComponent(s))
    .join("/");
  return `https://www.google.com/maps/dir/${stops}`;
}

// Template-based voiceover scripts — rotated to add variety
const SCRIPT_TEMPLATES = [
  (origin: string, dest: string) =>
    `One of the most talked-about road trips right now: ${origin} to ${dest}. ` +
    `This drive has been blowing up on social media for good reason. ` +
    `The route takes you through stunning landscapes, charming small towns, and stops you won't forget. ` +
    `Whether you're chasing scenery, great food, or just an escape, this road trip delivers from mile one to the very last exit. ` +
    `Have you done this drive? Drop it in the comments.`,

  (origin: string, dest: string) =>
    `Pack your bags — ${origin} to ${dest} is calling your name. ` +
    `This incredible American road trip is trending for a reason. ` +
    `Wide-open highways, jaw-dropping views, and unforgettable pit stops make this one of the most epic routes you can drive. ` +
    `The kind of trip that reminds you why road trips are still the best way to see this country. ` +
    `Save this one before you scroll past.`,

  (origin: string, dest: string) =>
    `If you haven't done ${origin} to ${dest} yet, put it on your list right now. ` +
    `This road trip is all over travel feeds this season and it's easy to see why. ` +
    `Rolling landscapes, local gems, and the freedom of the open road — this route has everything. ` +
    `Grab a co-pilot, load up the playlist, and make it happen. ` +
    `Which stop along the way would you most want to hit?`,
];

function generateScript(origin: string, destination: string, idx: number): string {
  const template = SCRIPT_TEMPLATES[idx % SCRIPT_TEMPLATES.length];
  return template(origin, destination);
}

async function scrapeWithApify(): Promise<string[]> {
  const client = new ApifyClient({ token: process.env.APIFY_API_KEY });
  const texts: string[] = [];

  // --- Reddit r/roadtrips: top posts of the month ---
  console.log("  Scraping Reddit r/roadtrips...");
  try {
    const redditRun = await client.actor("trudax/reddit-scraper").call(
      {
        startUrls: [
          { url: "https://www.reddit.com/r/roadtrips/top/?t=month" },
          { url: "https://www.reddit.com/r/roadtrips/hot/" },
        ],
        maxItems: 40,
      },
      { waitSecs: 120 },
    );
    const { items: redditItems } = await client
      .dataset(redditRun.defaultDatasetId)
      .listItems();
    for (const item of redditItems) {
      const text = [item["title"], item["body"], item["selftext"]]
        .filter(Boolean)
        .join(" ");
      if (text.trim()) texts.push(text);
    }
    console.log(`  Reddit: ${redditItems.length} posts scraped`);
  } catch (err) {
    console.warn(`  Reddit scrape failed: ${err}`);
  }

  // --- TikTok: trending road trip / scenic drive videos ---
  console.log("  Scraping TikTok for trending route videos...");
  try {
    const tiktokRun = await client.actor("clockworks/free-tiktok-scraper").call(
      {
        hashtags: ["roadtrip", "scenicdrives", "roadtripusa", "roadtripvideo"],
        resultsPerPage: 20,
      },
      { waitSecs: 120 },
    );
    const { items: tiktokItems } = await client
      .dataset(tiktokRun.defaultDatasetId)
      .listItems();
    for (const item of tiktokItems) {
      const text = [item["text"], item["desc"], item["title"]]
        .filter(Boolean)
        .join(" ");
      if (text.trim()) texts.push(text);
    }
    console.log(`  TikTok: ${tiktokItems.length} videos scraped`);
  } catch (err) {
    console.warn(`  TikTok scrape failed: ${err}`);
  }

  // --- Google Search: trending road trips via Apify ---
  console.log("  Scraping Google for trending road trips...");
  try {
    const googleRun = await client.actor("apify/google-search-scraper").call(
      {
        queries:
          "trending road trip routes 2025\nbest scenic drives USA 2025\nviral road trips TikTok 2025",
        maxPagesPerQuery: 1,
        resultsPerPage: 10,
      },
      { waitSecs: 120 },
    );
    const { items: googleItems } = await client
      .dataset(googleRun.defaultDatasetId)
      .listItems();
    for (const item of googleItems) {
      const text = [item["title"], item["description"], item["snippet"]]
        .filter(Boolean)
        .join(" ");
      if (text.trim()) texts.push(text);
    }
    console.log(`  Google: ${googleItems.length} results scraped`);
  } catch (err) {
    console.warn(`  Google scrape failed: ${err}`);
  }

  return texts;
}

async function findTrendingRoutes(): Promise<RouteIdea[]> {
  console.log("\nScraping trending routes via Apify...");
  const texts = await scrapeWithApify();

  if (texts.length === 0) {
    throw new Error(
      "No data scraped from any source. Check your APIFY_API_KEY and actor availability.",
    );
  }

  console.log(`\nAnalyzing ${texts.length} posts/results for route patterns...`);
  const candidates = extractRoutes(texts);

  if (candidates.length < 3) {
    throw new Error(
      `Only found ${candidates.length} route(s) in scraped data (need at least 3). ` +
        "Try again — social feeds update frequently.",
    );
  }

  console.log(
    `Found ${candidates.length} unique routes. Top 3:\n` +
      candidates
        .slice(0, 3)
        .map((r, i) => `  ${i + 1}. ${r.title} (${r.score} mentions)`)
        .join("\n"),
  );

  return candidates.slice(0, 3).map((r, i) => ({
    id: i + 1,
    title: r.title,
    origin: r.origin,
    destination: r.destination,
    waypoints: [],
    script: generateScript(r.origin, r.destination, i),
    googleMapsUrl: buildGoogleMapsUrl(r.origin, r.destination, []),
    whyTrending: `Mentioned ${r.score} time${r.score !== 1 ? "s" : ""} across Reddit, TikTok, and Google this month`,
    audioFile: `route-${i + 1}-audio.wav`,
    videoFile: `route-${i + 1}-video.mp4`,
  }));
}

async function generateAllAudio(routes: RouteIdea[]): Promise<void> {
  console.log(
    "\nLoading Kokoro TTS model (downloads ~87MB on first run)...",
  );

  let lastProgress = -1;
  const tts = await KokoroTTS.from_pretrained(
    "onnx-community/Kokoro-82M-ONNX",
    {
      dtype: "q8",
      progress_callback: (info: { status: string; progress?: number }) => {
        if (info.status === "progress" && info.progress !== undefined) {
          const pct = Math.floor(info.progress);
          if (pct !== lastProgress && pct % 10 === 0) {
            process.stdout.write(`\r  Downloading model... ${pct}%   `);
            lastProgress = pct;
          }
        }
      },
    },
  );
  console.log("\nModel ready\n");

  for (const route of routes) {
    const audioPath = path.join(PUBLIC, route.audioFile);
    process.stdout.write(`  Route ${route.id}: ${route.title}... `);
    try {
      const audio = await tts.generate(route.script, {
        voice: "am_adam",
        speed: 0.95,
      });
      await audio.save(audioPath);
      console.log("done");
    } catch (err) {
      console.log("FAILED");
      console.error(`     ${err}`);
    }
  }
}

async function main() {
  fs.mkdirSync(PUBLIC, { recursive: true });

  let routes: RouteIdea[];
  try {
    routes = await findTrendingRoutes();
  } catch (err) {
    console.error("Failed to find trending routes:", err);
    process.exit(1);
  }

  console.log(`\nFound ${routes.length} trending routes.`);

  await generateAllAudio(routes);

  const routesPath = path.join(ROOT, "routes.json");
  fs.writeFileSync(routesPath, JSON.stringify(routes, null, 2));
  console.log(`\nSaved routes.json`);

  // Summary
  console.log("\n" + "=".repeat(62));
  console.log("  TOP 3 TRENDING ROUTES FOR TODAY");
  console.log("=".repeat(62));

  for (const route of routes) {
    console.log(`\n+- ROUTE ${route.id}: ${route.title}`);
    console.log(`|  Why trending: ${route.whyTrending}`);
    console.log("|");
    console.log("|  VOICEOVER SCRIPT:");
    const words = route.script.split(" ");
    let line = "|    ";
    for (const word of words) {
      if (line.length + word.length > 66) {
        console.log(line);
        line = "|    " + word + " ";
      } else {
        line += word + " ";
      }
    }
    if (line.trim() !== "|") console.log(line);
    console.log("|");
    console.log("|  GOOGLE MAPS URL:");
    console.log(`|    ${route.googleMapsUrl}`);
    console.log("|");
    console.log(`|  AUDIO: public/${route.audioFile}`);
    console.log("+" + "-".repeat(60));
  }

  console.log("\n" + "=".repeat(62));
  console.log("  NEXT STEPS");
  console.log("=".repeat(62));
  console.log("  1. Pick a route from the 3 above");
  console.log("  2. Open its Google Maps URL");
  console.log("  3. Send the route to TravelAnimator app");
  console.log("  4. Export the animation -> save as public/background.mp4");
  console.log("  5. Run:  npm run setup-route -- <1|2|3>");
  console.log("  6. Run:  npm run render");
  console.log("=".repeat(62) + "\n");
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
