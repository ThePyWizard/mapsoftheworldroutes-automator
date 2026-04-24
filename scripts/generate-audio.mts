/**
 * Generate Audio Script (ElevenLabs)
 *
 * Usage: npm run generate-audio [-- <id> [id2] [id3] ...]
 *
 * Reads the voiceover scripts from routes.json and generates
 * audio files using the ElevenLabs API.
 *
 * Pass one or more route IDs to generate only those routes, e.g.:
 *   npm run generate-audio -- 7
 *   npm run generate-audio -- 7 8 9
 * Omit IDs to generate all routes.
 *
 * Required env var: ELEVENLABS_API_KEY in .env
 */

import { ElevenLabsClient } from "elevenlabs";
import { Readable } from "stream";
import { pipeline } from "stream/promises";
import { createWriteStream } from "fs";
import fs from "fs";
import path from "path";
import { execSync } from "child_process";
import { fileURLToPath } from "url";
import type { RouteIdea } from "./agent.mts";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.join(__dirname, "..");
const PUBLIC = path.join(ROOT, "public");

// --- Load .env ---
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

if (!process.env.ELEVENLABS_API_KEY) {
  console.error("ELEVENLABS_API_KEY not set in .env");
  process.exit(1);
}

// --- Load routes.json ---
const routesPath = path.join(ROOT, "routes.json");
if (!fs.existsSync(routesPath)) {
  console.error("routes.json not found. Run `npm run agent` first.");
  process.exit(1);
}

const allRoutes: RouteIdea[] = JSON.parse(fs.readFileSync(routesPath, "utf-8"));

// --- Optional: filter to specific routes by ID ---
const argIds = process.argv.slice(2).map(Number).filter(Boolean);
let routes: RouteIdea[];
if (argIds.length > 0) {
  routes = argIds.map((id) => {
    const found = allRoutes.find((r) => r.id === id);
    if (!found) {
      console.error(`Route ${id} not found in routes.json`);
      process.exit(1);
    }
    return found!;
  });
} else {
  routes = allRoutes;
}

fs.mkdirSync(PUBLIC, { recursive: true });

// ElevenLabs "Adam" — deep male voice
const VOICE_ID = "pNInz6obpgDQGcFmaJgB";

const client = new ElevenLabsClient({ apiKey: process.env.ELEVENLABS_API_KEY });

console.log(`\nUsing ElevenLabs TTS (voice: Adam)\n`);

for (const route of routes) {
  const audioPath = path.join(PUBLIC, route.audioFile);
  const tempMp3 = path.join(PUBLIC, `route-${route.id}-audio.tmp.mp3`);

  process.stdout.write(`  Route ${route.id}: ${route.title}... `);
  try {
    // Generate audio stream from ElevenLabs
    const audioStream = await client.textToSpeech.convert(VOICE_ID, {
      text: route.script,
      model_id: "eleven_multilingual_v2",
      output_format: "mp3_44100_128",
    });

    // Save MP3 stream to temp file
    await pipeline(Readable.from(audioStream), createWriteStream(tempMp3));

    // Convert MP3 -> WAV (required by whisper + Remotion pipeline)
    execSync(`ffmpeg -i "${tempMp3}" "${audioPath}" -y`, { stdio: "pipe" });
    fs.unlinkSync(tempMp3);

    console.log(`done -> public/${route.audioFile}`);
  } catch (err) {
    if (fs.existsSync(tempMp3)) fs.unlinkSync(tempMp3);
    console.log("FAILED");
    console.error(`  ${err}`);
    process.exit(1);
  }
}

console.log("\nAll audio generated.");
console.log("\nNext steps:");
console.log("  1. Export TravelAnimator videos:");
for (const route of allRoutes) {
  console.log(`       Route ${route.id}: save as public/${route.videoFile}`);
}
console.log("  2. Run:  npm run render-all");
