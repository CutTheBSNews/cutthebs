import Anthropic from "@anthropic-ai/sdk";
import fetch from "node-fetch";
import fs from "fs";
import path from "path";
import { execSync } from "child_process";
import { fileURLToPath } from "url";
import { google } from "googleapis";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const OUTPUT = path.join(ROOT, "output");

const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
const ELEVENLABS_KEY = process.env.ELEVENLABS_API_KEY;
const VOICE_ID = "nPczCjzI2devNBz1zQrb";
const DRIVE_FOLDER_ID = "1deZ7sbxWlANuXKqfbI45YCKQ9i31ySAa";

function clean(str, max) {
  return str.substring(0, max).replace(/[^a-zA-Z0-9 .,!?]/g, " ").trim();
}

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
      content: `You are the writer for "Cut The BS News" a Gen Z TikTok news channel.
Today is ${today}. Write a punchy casual 55-second script covering the 2-3 biggest news stories right now.
Tone: real person talking to a friend, skeptical, call out who benefits, rate each story 1-10 on life impact.
Under 155 words total. End with Follow for tomorrows episode.

Return ONLY valid JSON no markdown:
{
  "title": "punchy headline under 60 chars no special characters",
  "script": "full narration 155 words max no apostrophes or special characters",
  "stories": [
    {
      "headline": "short punchy headline no special characters",
      "body": "1-2 casual sentences no apostrophes or special characters",
      "bs_score": 8,
      "bs_color": "#e53e3e",
      "agenda": "one sentence on who benefits no special characters"
    }
  ],
  "hashtags": "#CutTheBSNews #News #GenZ #TikTok #fyp"
}`,
    }],
  });
  const raw = msg.content[0].text.trim().replace(/```json|```/g, "").trim();
  const episode = JSON.parse(raw);
  console.log(`   ✅ Title: "${episode.title}"`);
  return episode;
}

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
  if (!res.ok) throw new Error(`ElevenLabs error ${res.status}`);
  const buffer = await res.arrayBuffer();
  const audioPath = path.join(OUTPUT, "narration.mp3");
  fs.mkdirSync(OUTPUT, { recursive: true });
  fs.writeFileSync(audioPath, Buffer.from(buffer));
  console.log("   ✅ Voice saved.");
  return audioPath;
}

async function renderVideo(episode, audioPath) {
  console.log("\n🎬  Step 3/4 — Rendering vertical TikTok video with ffmpeg...");
  fs.mkdirSync(OUTPUT, { recursive: true });

  const today = new Date().toISOString().split("T")[0];
  const videoPath = path.join(OUTPUT, `cutthebs_${today}.mp4`);
  const stories = episode.stories || [];

  let audioDuration = 60;
  try {
    const probe = execSync(
      `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${audioPath}"`
    ).toString().trim();
    audioDuration = parseFloat(probe) || 60;
  } catch(e) {
    console.log("   ℹ️  Could not probe audio, using 60s default");
  }

  const sceneDuration = audioDuration / (stories.length + 2);
  const font = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf";
  const fontReg = "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf";
  const drawLines = [];

  drawLines.push(`drawtext=fontfile=${font}:text='CUT THE BS NEWS':fontcolor=white:fontsize=48:x=(w-text_w)/2:y=80:box=1:boxcolor=0xe53e3e@1.0:boxborderw=20`);

  const introEnd = sceneDuration.toFixed(1);
  drawLines.push(`drawtext=fontfile=${font}:text='They want you scared today.':fontcolor=white:fontsize=54:x=(w-text_w)/2:y=700:enable='between(t,0,${introEnd})'`);
  drawLines.push(`drawtext=fontfile=${font}:text='Here is what is actually going on.':fontcolor=0xe53e3e:fontsize=48:x=(w-text_w)/2:y=790:enable='between(t,0,${introEnd})'`);

  stories.forEach((s, i) => {
    const start = ((i + 1) * sceneDuration).toFixed(1);
    const end = ((i + 2) * sceneDuration).toFixed(1);
    const storyNum = `Story ${i+1} of ${stories.length}`;
    const headline = clean(s.headline, 35);
    const body = clean(s.body, 55);
    const score = `BS Score  ${s.bs_score} out of 10`;
    const color = s.bs_color || "#e53e3e";

    drawLines.push(`drawtext=fontfile=${fontReg}:text='${storyNum}':fontcolor=0xaaaaaa:fontsize=36:x=(w-text_w)/2:y=580:enable='between(t,${start},${end})'`);
    drawLines.push(`drawtext=fontfile=${font}:text='${headline}':fontcolor=white:fontsize=52:x=(w-text_w)/2:y=650:enable='between(t,${start},${end})'`);
    drawLines.push(`drawtext=fontfile=${fontReg}:text='${body}':fontcolor=0xbbbbbb:fontsize=36:x=(w-text_w)/2:y=760:enable='between(t,${start},${end})'`);
    drawLines.push(`drawtext=fontfile=${font}:text='${score}':fontcolor=${color}:fontsize=64:x=(w-text_w)/2:y=920:enable='between(t,${start},${end})'`);
  });

  const outroStart = ((stories.length + 1) * sceneDuration).toFixed(1);
  const outroEnd = audioDuration.toFixed(1);
  drawLines.push(`drawtext=fontfile=${font}:text='Do not watch the news.':fontcolor=white:fontsize=60:x=(w-text_w)/2:y=700:enable='between(t,${outroStart},${outroEnd})'`);
  drawLines.push(`drawtext=fontfile=${font}:text='Understand it.':fontcolor=0xe53e3e:fontsize=60:x=(w-text_w)/2:y=800:enable='between(t,${outroStart},${outroEnd})'`);
  drawLines.push(`drawtext=fontfile=${fontReg}:text='Follow for tomorrows episode.':fontcolor=white:fontsize=44:x=(w-text_w)/2:y=900:enable='between(t,${outroStart},${outroEnd})'`);

  const filterStr = `[0:v]${drawLines.join(",")}[v]`;
  const scriptPath = path.join(OUTPUT, "render.sh");
  const ffmpegCmd = [
    "ffmpeg -y",
    `-f lavfi -i color=c=0x0a0a0a:size=1080x1920:rate=24`,
    `-i "${audioPath}"`,
    `-filter_complex "${filterStr}"`,
    `-map "[v]" -map 1:a`,
    `-c:v libx264 -c:a aac -shortest -pix_fmt yuv420p`,
    `-t ${audioDuration.toFixed(1)}`,
    `"${videoPath}"`
  ].join(" ");

  fs.writeFileSync(scriptPath, `#!/bin/sh\n${ffmpegCmd}\n`);
  execSync(`chmod +x "${scriptPath}"`);
  console.log("   ⏳ Encoding video...");
  execSync(`sh "${scriptPath}" || true`, { stdio: "inherit" });
  if (!fs.existsSync(videoPath)) throw new Error("Video file was not created");
  console.log(`   ✅ Video saved.`);
  return videoPath;
}

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
    requestBody: { name: fileName, parents: [DRIVE_FOLDER_ID], mimeType: "video/mp4" },
    media: { mimeType: "video/mp4", body: fs.createReadStream(videoPath) },
    fields: "id, name, webViewLink",
  });
  console.log(`   ✅ Uploaded: ${res.data.name}`);
  console.log(`   🔗 ${res.data.webViewLink}`);
  return res.data;
}

async function run() {
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("  CUT THE BS NEWS — Daily Automation");
  console.log(`  ${new Date().toLocaleString()}`);
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  try {
    const episode = await generateScript();
    const audioPath = await generateVoice(episode.script);
    const videoPath = await renderVideo(episode, audioPath);
    await uploadToDrive(videoPath, episode.title);
    console.log("\n✅ ALL DONE! Check your Google Drive folder.\n");
  } catch (err) {
    console.error("\n❌ Error:", err.message);
    console.error(err.stack);
    process.exit(1);
  }
}

run();
