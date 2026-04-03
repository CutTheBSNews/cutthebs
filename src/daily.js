import Anthropic from "@anthropic-ai/sdk";
import fetch from "node-fetch";
import puppeteer from "puppeteer";
import fs from "fs";
import path from "path";
import { execSync } from "child_process";
import { fileURLToPath } from "url";
import { google } from "googleapis";
import { generateHTML } from "./template.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const OUTPUT = path.join(ROOT, "output");

const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
const ELEVENLABS_KEY = process.env.ELEVENLABS_API_KEY;
const VOICE_ID = "nPczCjzI2devNBz1zQrb"; // Brian — deep American male
const DRIVE_FOLDER_ID = "1deZ7sbxWlANuXKqfbI45YCKQ9i31ySAa";

// ─── STEP 1: Claude writes today's script ───────────────────────────────────
async function generateScript() {
  console.log("\n🤖 Step 1/4 — Claude is writing today's episode...");
  const client = new Anthropic({ apiKey: ANTHROPIC_KEY });

  const today = new Date().toLocaleDateString("en-US", {
    weekday: "long", year: "numeric", month: "long", day: "numeric",
  });

  const msg = await client.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 1500,
    messages: [{
      role: "user",
      content: `You are the writer for "Cut The BS News" — a Gen Z TikTok news channel that calls out media agendas.

Today is ${today}. Write a punchy, casual 55-second TikTok script covering the 2-3 biggest news stories right now.

Tone rules:
- Sound like a real person talking to a friend, NOT a news anchor
- Be skeptical — always ask who benefits from each story
- Rate each story 1-10 on "how much this actually affects your daily life"
- Keep it under 155 words total
- End with "Follow for tomorrow's episode"

Return ONLY valid JSON, no markdown, no extra text:
{
  "title": "punchy headline under 60 chars",
  "script": "full narration script, conversational tone, 155 words max",
  "stories": [
    {
      "headline": "short punchy headline",
      "body": "1-2 casual sentences explaining the story",
      "bs_score": 8,
      "bs_color": "#e53e3e",
      "agenda": "one sentence on who benefits from this story",
      "image_query": "3 words for image search"
    }
  ],
  "hashtags": "#CutTheBSNews #News #GenZ #TikTok #viral #fyp"
}`,
    }],
  });

  const raw = msg.content[0].text.trim().replace(/```json|```/g, "").trim();
  const episode = JSON.parse(raw);
  console.log(`   ✅ Title: "${episode.title}"`);
  return episode;
}

// ─── STEP 2: ElevenLabs generates Brian's voice ──────────────────────────────
async function generateVoice(script) {
  console.log("\n🎙️  Step 2/4 — Brian is recording the narration...");
  const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${VOICE_ID}`, {
    method: "POST",
    headers: { "xi-api-key": ELEVENLABS_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({
      text: script,
      model_id: "eleven_monolingual_v1",
      voice_settings: { stability: 0.38, similarity_boost: 0.88, style: 0.22, use_speaker_boost: true },
    }),
  });
  if (!res.ok) throw new Error(`ElevenLabs error ${res.status}: ${await res.text()}`);
  const buffer = await res.arrayBuffer();
  const audioPath = path.join(OUTPUT, "narration.mp3");
  fs.mkdirSync(OUTPUT, { recursive: true });
  fs.writeFileSync(audioPath, Buffer.from(buffer));
  console.log("   ✅ Voice saved to output/narration.mp3");
  return audioPath;
}

// ─── STEP 3: Puppeteer renders 9:16 vertical MP4 ────────────────────────────
async function renderVideo(episode, audioPath) {
  console.log("\n🎬  Step 3/4 — Rendering vertical TikTok video...");

  const html = generateHTML(episode, audioPath);
  const htmlPath = path.join(OUTPUT, "episode.html");
  fs.writeFileSync(htmlPath, html);

  const browser = await puppeteer.launch({
    headless: "new",
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--autoplay-policy=no-user-gesture-required"],
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1080, height: 1920 });
  await page.goto(`file://${htmlPath}`, { waitUntil: "networkidle2" });
  await page.evaluate(() => window.startEpisode && window.startEpisode());

  const cdp = await page.createCDPSession();
  await cdp.send("Page.startScreencast", {
    format: "jpeg", quality: 85, maxWidth: 1080, maxHeight: 1920, everyNthFrame: 2,
  });

  const frames = [];
  cdp.on("Page.screencastFrame", async ({ data, sessionId }) => {
    frames.push(data);
    await cdp.send("Page.screencastFrameAck", { sessionId });
  });

  console.log("   ⏳ Recording 62 seconds of playback...");
  await new Promise((r) => setTimeout(r, 62000));
  await cdp.send("Page.stopScreencast");
  await browser.close();

  // Save frames
  const framesDir = path.join(OUTPUT, "frames");
  fs.rmSync(framesDir, { recursive: true, force: true });
  fs.mkdirSync(framesDir, { recursive: true });
  frames.forEach((f, i) => {
    fs.writeFileSync(path.join(framesDir, `frame${String(i).padStart(5, "0")}.jpg`), Buffer.from(f, "base64"));
  });

  const today = new Date().toISOString().split("T")[0];
  const videoPath = path.join(OUTPUT, `cutthebs_${today}.mp4`);

  console.log(`   🔧 Encoding ${frames.length} frames to MP4 with ffmpeg...`);
  execSync(
    `ffmpeg -y -framerate 24 -i "${framesDir}/frame%05d.jpg" -i "${audioPath}" ` +
    `-c:v libx264 -c:a aac -shortest -pix_fmt yuv420p -crf 23 "${videoPath}"`,
    { stdio: "inherit" }
  );

  fs.rmSync(framesDir, { recursive: true, force: true });
  console.log(`   ✅ Video saved: ${videoPath}`);
  return videoPath;
}

// ─── STEP 4: Upload MP4 to Google Drive ─────────────────────────────────────
async function uploadToDrive(videoPath, title) {
  console.log("\n📤  Step 4/4 — Uploading to Google Drive...");

  const auth = new google.auth.GoogleAuth({
    credentials: JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT),
    scopes: ["https://www.googleapis.com/auth/drive.file"],
  });

  const drive = google.drive({ version: "v3", auth });
  const today = new Date().toISOString().split("T")[0];
  const fileName = `CutTheBSNews_${today}.mp4`;

  const res = await drive.files.create({
    requestBody: {
      name: fileName,
      parents: [DRIVE_FOLDER_ID],
      mimeType: "video/mp4",
    },
    media: {
      mimeType: "video/mp4",
      body: fs.createReadStream(videoPath),
    },
    fields: "id, name, webViewLink",
  });

  console.log(`   ✅ Uploaded: ${res.data.name}`);
  console.log(`   🔗 Link: ${res.data.webViewLink}`);
  return res.data;
}

// ─── MAIN ────────────────────────────────────────────────────────────────────
async function run() {
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("  CUT THE BS NEWS — Daily Automation");
  console.log(`  ${new Date().toLocaleString()}`);
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

  try {
    const episode = await generateScript();
    const audioPath = await generateVoice(episode.script);
    const videoPath = await renderVideo(episode, audioPath);
    const driveFile = await uploadToDrive(videoPath, episode.title);

    console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("  ✅ ALL DONE!");
    console.log(`  Make.com will now auto-post to TikTok`);
    console.log(`  File: ${driveFile.name}`);
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");
  } catch (err) {
    console.error("\n❌ Error:", err.message);
    console.error(err.stack);
    process.exit(1);
  }
}

run();
