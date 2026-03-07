/**
 * Render All Routes
 *
 * Usage: npm run render-all
 *
 * Renders all 3 route videos in one go. For each route it:
 *   1. Validates that public/route-N-video.mp4 and public/route-N-audio.wav exist
 *   2. Transcribes the audio with Whisper -> public/route-N-captions.json
 *   3. Renders the Remotion composition TravelRoute-N -> out/route-N-<title>.mp4
 *
 * Prerequisites:
 *   - npm run generate-audio     (creates route-N-audio.wav files)
 *   - Export TravelAnimator videos saved as public/route-N-video.mp4
 */

import path from "path";
import fs from "fs";
import { execSync } from "child_process";
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
const OUT = path.join(ROOT, "out");
const WHISPER_PATH = path.join(ROOT, "whisper.cpp");

// --- Load routes.json ---
const routesPath = path.join(ROOT, "routes.json");
if (!fs.existsSync(routesPath)) {
  console.error("routes.json not found.");
  process.exit(1);
}
const routes: RouteIdea[] = JSON.parse(fs.readFileSync(routesPath, "utf-8"));

// --- Validate all files exist before starting ---
console.log("\nValidating files...");
let missingFiles = false;
for (const route of routes) {
  const audioPath = path.join(PUBLIC, route.audioFile);
  const videoPath = path.join(PUBLIC, route.videoFile);
  if (!fs.existsSync(audioPath)) {
    console.error(`  Route ${route.id}: Missing public/${route.audioFile} — run npm run generate-audio`);
    missingFiles = true;
  }
  if (!fs.existsSync(videoPath)) {
    console.error(`  Route ${route.id}: Missing public/${route.videoFile} — export from TravelAnimator`);
    missingFiles = true;
  }
}
if (missingFiles) process.exit(1);
console.log("  All files present.\n");

// --- Set up Whisper once ---
console.log("Setting up Whisper (first run downloads ~1.5GB model)...");
await installWhisperCpp({ to: WHISPER_PATH, version: "1.5.5" });
await downloadWhisperModel({ model: "medium.en", folder: WHISPER_PATH });
console.log("Whisper ready.\n");

fs.mkdirSync(OUT, { recursive: true });

// --- Process each route ---
for (const route of routes) {
  console.log(`${"=".repeat(62)}`);
  console.log(`  Route ${route.id}: ${route.title}`);
  console.log(`${"=".repeat(62)}`);

  const audioFile = path.join(PUBLIC, route.audioFile);
  const captionsFileName = `route-${route.id}-captions.json`;
  const captionsFile = path.join(PUBLIC, captionsFileName);

  // --- Transcribe audio ---
  let whisperInputPath = audioFile;
  let tempFile: string | null = null;
  try {
    tempFile = path.join(PUBLIC, `route-${route.id}-audio-16k.wav`);
    execSync(`ffmpeg -i "${audioFile}" -ar 16000 -ac 1 "${tempFile}" -y`, {
      stdio: "pipe",
    });
    whisperInputPath = tempFile;
    console.log("  Resampled audio to 16kHz mono");
  } catch {
    console.warn("  ffmpeg not found — transcribing at original sample rate");
  }

  console.log("  Transcribing...");
  const whisperOutput = await transcribe({
    model: "medium.en",
    whisperPath: WHISPER_PATH,
    whisperCppVersion: "1.5.5",
    inputPath: whisperInputPath,
    tokenLevelTimestamps: true,
  });

  if (tempFile && fs.existsSync(tempFile)) fs.unlinkSync(tempFile);

  const { captions } = toCaptions({ whisperCppOutput: whisperOutput });
  fs.writeFileSync(captionsFile, JSON.stringify(captions, null, 2));
  console.log(`  Captions written (${captions.length} entries)`);

  // --- Build render props ---
  const props = {
    routeTitle: route.title,
    videoFile: route.videoFile,
    audioFile: route.audioFile,
    captionsFile: captionsFileName,
    logoFile: "logo.png",
    outroFile: "ta-outro.mp4",
    carAudioFile: "car-voice-trimmed.wav",
    mainDurationInFrames: 1800,
    outroDurationInFrames: 150,
    videoPlaybackRate: 1,
  };

  // Sanitize title for filename
  const safeTitle = route.title.replace(/[^a-zA-Z0-9]+/g, "-").toLowerCase();
  const outputFile = path.join(OUT, `route-${route.id}-${safeTitle}.mp4`);

  // --- Render ---
  // Write props to a temp JSON file to avoid Windows shell quoting issues
  const propsFile = path.join(ROOT, `props-route-${route.id}.json`);
  fs.writeFileSync(propsFile, JSON.stringify(props, null, 2));

  console.log(`  Rendering -> out/route-${route.id}-${safeTitle}.mp4`);
  const renderCmd = [
    "npx remotion render",
    `TravelRoute-${route.id}`,
    `"${outputFile}"`,
    `--props="${propsFile}"`,
  ].join(" ");

  try {
    execSync(renderCmd, { stdio: "inherit", cwd: ROOT });
    console.log(`  Done: out/route-${route.id}-${safeTitle}.mp4\n`);
  } catch (err) {
    console.error(`  Render failed for Route ${route.id}:`, err);
    fs.unlinkSync(propsFile);
    process.exit(1);
  }

  fs.unlinkSync(propsFile);
}

console.log("=".repeat(62));
console.log("  ALL 3 VIDEOS RENDERED");
console.log("=".repeat(62));
console.log("\nOutput files:");
for (const route of routes) {
  const safeTitle = route.title.replace(/[^a-zA-Z0-9]+/g, "-").toLowerCase();
  console.log(`  out/route-${route.id}-${safeTitle}.mp4`);
}
console.log();
