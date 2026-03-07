import path from "path";
import {
  downloadWhisperModel,
  installWhisperCpp,
  transcribe,
  toCaptions,
} from "@remotion/install-whisper-cpp";
import fs from "fs";

const to = path.join(process.cwd(), "whisper.cpp");

console.log("Installing whisper.cpp...");
await installWhisperCpp({
  to,
  version: "1.5.5",
});

console.log("Downloading whisper model...");
await downloadWhisperModel({
  model: "medium.en",
  folder: to,
});

const audioPath = path.join(process.cwd(), "public", "audio.wav");

if (!fs.existsSync(audioPath)) {
  console.error(
    "Error: public/audio.wav not found. Please place your audio file as public/audio.wav",
  );
  console.error(
    "If your audio is MP3, convert it first: ffmpeg -i public/audio.mp3 -ar 16000 public/audio.wav -y",
  );
  process.exit(1);
}

console.log("Transcribing audio...");
const whisperCppOutput = await transcribe({
  model: "medium.en",
  whisperPath: to,
  whisperCppVersion: "1.5.5",
  inputPath: audioPath,
  tokenLevelTimestamps: true,
});

const { captions } = toCaptions({
  whisperCppOutput,
});

const outputPath = path.join(process.cwd(), "public", "captions.json");
fs.writeFileSync(outputPath, JSON.stringify(captions, null, 2));

console.log(`Captions written to ${outputPath}`);
console.log(`Total captions: ${captions.length}`);
