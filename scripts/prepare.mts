/**
 * Prepare Render Script
 *
 * Usage: npm run setup-route -- <1|2|3>
 *
 * Run AFTER:
 *   1. You've run `npm run agent` to generate route options + audio
 *   2. You've exported the map animation from TravelAnimator
 *   3. You've saved the animation as public/background.mp4
 *
 * What it does:
 *   1. Reads routes.json to get the selected route
 *   2. Copies the route's WAV audio to public/audio.wav (Kokoro outputs WAV natively)
 *   3. Transcribes with Whisper → generates public/captions.json
 *   4. Prints the final remotion render command
 */

import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import {
  downloadWhisperModel,
  installWhisperCpp,
  transcribe,
  toCaptions,
} from "@remotion/install-whisper-cpp";
import type { RouteIdea } from "./agent.mts";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.join(__dirname, "..");
const PUBLIC = path.join(ROOT, "public");
const WHISPER_PATH = path.join(ROOT, "whisper.cpp");

// --- Validate args ---
const routeArg = process.argv[2];
if (!routeArg || !["1", "2", "3"].includes(routeArg)) {
  console.error("Usage: npm run setup-route -- <1|2|3>");
  console.error("Example: npm run setup-route -- 2");
  process.exit(1);
}
const routeNum = parseInt(routeArg);

// --- Load routes.json ---
const routesPath = path.join(ROOT, "routes.json");
if (!fs.existsSync(routesPath)) {
  console.error("❌ routes.json not found. Run `npm run agent` first.");
  process.exit(1);
}

const routes: RouteIdea[] = JSON.parse(fs.readFileSync(routesPath, "utf-8"));
const route = routes.find((r) => r.id === routeNum);

if (!route) {
  console.error(`❌ Route ${routeNum} not found in routes.json`);
  process.exit(1);
}

// --- Check route video exists ---
const videoFileName = route.videoFile ?? `route-${routeNum}-video.mp4`;
const bgPath = path.join(PUBLIC, videoFileName);
if (!fs.existsSync(bgPath)) {
  console.error(`❌ public/${videoFileName} not found!`);
  console.error(
    `   Export the map animation from TravelAnimator and save it as public/${videoFileName}`,
  );
  process.exit(1);
}

console.log(`\n🎬 Preparing render for Route ${routeNum}: ${route.title}\n`);

// --- Copy WAV audio (Kokoro outputs WAV natively — no conversion needed) ---
const sourceAudio = path.join(PUBLIC, route.audioFile);
if (!fs.existsSync(sourceAudio)) {
  console.error(`❌ Audio file not found: public/${route.audioFile}`);
  console.error("   Run `npm run agent` to regenerate audio files.");
  process.exit(1);
}

// Whisper requires 16kHz mono. Kokoro outputs 24kHz stereo.
// Resample using ffmpeg if available, otherwise use original.
let whisperInputPath = sourceAudio;
let tempFile: string | null = null;
try {
  const { execSync } = await import("child_process");
  tempFile = path.join(PUBLIC, `route-${routeNum}-audio-16k.wav`);
  execSync(`ffmpeg -i "${sourceAudio}" -ar 16000 -ac 1 "${tempFile}" -y`, {
    stdio: "pipe",
  });
  whisperInputPath = tempFile;
  console.log("✓ Resampled to 16kHz mono for Whisper");
} catch {
  console.warn(
    "⚠️  ffmpeg not found — Whisper will attempt transcription at original sample rate.",
  );
  console.warn(
    "   For best results install ffmpeg: https://ffmpeg.org/download.html",
  );
}

// --- Transcribe with Whisper ---
console.log("\n📥 Setting up Whisper...");
await installWhisperCpp({ to: WHISPER_PATH, version: "1.5.5" });
await downloadWhisperModel({ model: "medium.en", folder: WHISPER_PATH });

console.log("🎙️  Transcribing audio (this may take a minute)...");
const whisperOutput = await transcribe({
  model: "medium.en",
  whisperPath: WHISPER_PATH,
  whisperCppVersion: "1.5.5",
  inputPath: whisperInputPath,
  tokenLevelTimestamps: true,
});
if (tempFile && fs.existsSync(tempFile)) fs.unlinkSync(tempFile);

const { captions } = toCaptions({ whisperCppOutput: whisperOutput });
const captionsFileName = `route-${routeNum}-captions.json`;
const captionsPath = path.join(PUBLIC, captionsFileName);
fs.writeFileSync(captionsPath, JSON.stringify(captions, null, 2));
console.log(`✓ public/${captionsFileName} ready (${captions.length} captions)`);

// --- Build render props ---
// Note: mainDurationInFrames / outroDurationInFrames / videoPlaybackRate
// are recalculated by calculateMetadata from actual file durations — dummy values here are fine.
const props = {
  routeTitle: route.title,
  videoFile: videoFileName,
  audioFile: route.audioFile,
  captionsFile: captionsFileName,
  logoFile: "logo.png",
  outroFile: "ta-outro.mp4",
  carAudioFile: "car-voice-trimmed.wav",
  mainDurationInFrames: 1800,
  outroDurationInFrames: 150,
  videoPlaybackRate: 1,
};

// Write props to a JSON file to avoid Windows shell quoting issues
const propsFile = path.join(ROOT, `props-route-${routeNum}.json`);
fs.writeFileSync(propsFile, JSON.stringify(props, null, 2));

// --- Done ---
console.log("\n" + "═".repeat(62));
console.log("  ✅ ALL FILES READY");
console.log("═".repeat(62));
console.log("\n  Route:  " + route.title);
console.log("\n  Run this command to render:\n");
console.log(
  `  npx remotion render TravelRoute-${routeNum} --props="${propsFile}"`,
);
console.log("\n  Or open Remotion Studio to preview first:");
console.log("  npm run dev");
console.log("\n" + "═".repeat(62) + "\n");
