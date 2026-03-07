/**
 * Generate Audio Script
 *
 * Usage: npm run generate-audio [-- <1|2|3>]
 *
 * Reads the voiceover scripts from routes.json and generates
 * Kokoro TTS audio files, without re-running Apify scraping.
 *
 * Outputs:
 *   public/route-1-audio.wav
 *   public/route-2-audio.wav
 *   public/route-3-audio.wav
 *
 * Pass a route number to regenerate only that route, e.g.:
 *   npm run generate-audio -- 2
 */

import { KokoroTTS } from "kokoro-js";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import type { RouteIdea } from "./agent.mts";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.join(__dirname, "..");
const PUBLIC = path.join(ROOT, "public");

// --- Load routes.json ---
const routesPath = path.join(ROOT, "routes.json");
if (!fs.existsSync(routesPath)) {
  console.error("routes.json not found. Run `npm run agent` first.");
  process.exit(1);
}

const allRoutes: RouteIdea[] = JSON.parse(fs.readFileSync(routesPath, "utf-8"));

// --- Optional: filter to a single route ---
const routeArg = process.argv[2];
let routes: RouteIdea[];
if (routeArg) {
  if (!["1", "2", "3"].includes(routeArg)) {
    console.error("Usage: npm run generate-audio [-- <1|2|3>]");
    process.exit(1);
  }
  const found = allRoutes.find((r) => r.id === parseInt(routeArg));
  if (!found) {
    console.error(`Route ${routeArg} not found in routes.json`);
    process.exit(1);
  }
  routes = [found];
} else {
  routes = allRoutes;
}

fs.mkdirSync(PUBLIC, { recursive: true });

console.log(
  `\nLoading Kokoro TTS model (downloads ~87MB on first run)...`,
);

let lastProgress = -1;
const tts = await KokoroTTS.from_pretrained("onnx-community/Kokoro-82M-ONNX", {
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
});
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
    console.log(`done -> public/${route.audioFile}`);
  } catch (err) {
    console.log("FAILED");
    console.error(`  ${err}`);
  }
}

console.log("\nAll audio generated.");
console.log("\nNext steps:");
console.log("  1. Export TravelAnimator videos:");
for (const route of allRoutes) {
  console.log(`       Route ${route.id}: save as public/${route.videoFile}`);
}
console.log("  2. Run:  npm run render-all");
