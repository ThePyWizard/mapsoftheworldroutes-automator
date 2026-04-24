/**
 * Set SFX Script
 *
 * Usage: npm run set-sfx -- <routeId> <voice>
 *
 * Sets the sfxFile for a route in routes.json.
 * voice: "car"   → car-voice-trimmed.wav
 *        "train" → train-voice.mp3
 *        "plane" → plane-voice.mp3
 *        "boat"  → boat-voice.mp3
 *
 * Examples:
 *   npm run set-sfx -- 10 train
 *   npm run set-sfx -- 10 car
 *   npm run set-sfx -- 1 2 3 plane    (multiple routes at once)
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.join(__dirname, "..");
const routesPath = path.join(ROOT, "routes.json");

const SFX_MAP: Record<string, string> = {
  car: "car-voice-trimmed.wav",
  train: "train-voice.mp3",
  plane: "plane-voice.mp3",
  boat: "boat-voice.mp3",
};

const args = process.argv.slice(2);
if (args.length < 2) {
  console.error("Usage: npm run set-sfx -- <routeId> [routeId2 ...] <voice>");
  console.error(`  voice: ${Object.keys(SFX_MAP).join(" | ")}`);
  console.error("Example: npm run set-sfx -- 10 train");
  process.exit(1);
}

const voice = args[args.length - 1];
const routeIds = args.slice(0, -1).map(Number);

if (!SFX_MAP[voice]) {
  console.error(`Unknown voice "${voice}". Valid options: ${Object.keys(SFX_MAP).join(", ")}`);
  process.exit(1);
}

if (routeIds.some(isNaN)) {
  console.error("Route IDs must be numbers.");
  process.exit(1);
}

const sfxFile = SFX_MAP[voice];
const routes = JSON.parse(fs.readFileSync(routesPath, "utf-8"));

for (const id of routeIds) {
  const route = routes.find((r: { id: number }) => r.id === id);
  if (!route) {
    console.error(`Route ${id} not found in routes.json`);
    process.exit(1);
  }
  route.sfxFile = sfxFile;
  console.log(`Route ${id} (${route.title}): sfxFile → ${sfxFile}`);
}

fs.writeFileSync(routesPath, JSON.stringify(routes, null, 2) + "\n");
console.log("\nroutes.json updated.");
