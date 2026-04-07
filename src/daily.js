import Anthropic from "@anthropic-ai/sdk";
import fetch from "node-fetch";
import fs from "fs";
import path from "path";
import { execSync } from "child_process";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const OUTPUT = path.join(ROOT, "output");

const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
const ELEVENLABS_KEY = process.env.ELEVENLABS_API_KEY;
const DROPBOX_TOKEN = process.env.DROPBOX_TOKEN;
const VOICE_ID = "nPczCjzI2devNBz1zQrb";

function clean(str, max) {
  return (str || "").substring(0, max).replace(/[^a-zA-Z0-9 .,!?]/g, " ").trim();
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
No apostrophes or special characters anywhere in any text field.

Return ONLY valid JSON no markdown:
{
  "title": "punchy headline under 60 chars no special chars",
  "script": "full narration 155 words max no apostrophes no special characters",
  "stories": [
    {
      "headline": "short punchy headline under 35 chars no special chars",
      "category": "one word like ECONOMY or POLITICS or TECH or WORLD",
      "body": "1-2 casual sentences no apostrophes no special characters",
      "bs_score": 8,
      "bs_color": "#e53e3e",
      "agenda": "one sentence on who benefits no special characters",
      "image_search": "2-3 words for image search eg oil prices protest"
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

async function downloadImages(stories) {
  console.log("\n🖼️  Downloading story images...");
  const imgDir = path.join(OUTPUT, "images");
  fs.mkdirSync(imgDir, { recursive: true });
  const imagePaths = [];
  const fallbackColors = ["1a0505", "050518", "051a05", "181805"];

  for (let i = 0; i < stories.length; i++) {
    const imgPath = path.join(imgDir, `story_${i}.jpg`);
    try {
      const color = fallbackColors[i % fallbackColors.length];
      execSync(`ffmpeg -y -f lavfi -i color=c=0x${color}:size=1080x1920:rate=24 -frames:v 1 "${imgPath}" 2>/dev/null || true`);
      imagePaths.push(imgPath);
      console.log(`   ✅ Background ${i+1} ready`);
    } catch(e) {
      imagePaths.push(null);
    }
  }
  return imagePaths;
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

async function renderVideo(episode, audioPath, imagePaths) {
  console.log("\n🎬  Step 3/4 — Rendering news broadcast video...");
  fs.mkdirSync(OUTPUT, { recursive: true });

  const today = new Date().toISOString().split("T")[0];
  const videoPath = path.join(OUTPUT, `cutthebs_${today}.mp4`);
  const stories = episode.stories || [];

  let audioDuration = 55;
  try {
    const probe = execSync(`ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${audioPath}"`).toString().trim();
    audioDuration = parseFloat(probe) || 55;
  } catch(e) {}

  const sceneDuration = audioDuration / (stories.length + 2);
  const fontB = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf";
  const fontR = "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf";

  const inputs = [];
  inputs.push(`-f lavfi -i color=c=0x0d0d0d:size=1080x1920:rate=24`);

  imagePaths.forEach((imgPath, i) => {
    if (imgPath && fs.existsSync(imgPath)) {
      inputs.push(`-loop 1 -i "${imgPath}"`);
    } else {
      const colors = ["1a0505", "050518", "051a05", "181805"];
      inputs.push(`-f lavfi -i color=c=0x${colors[i % colors.length]}:size=1080x1920:rate=24`);
    }
  });

  const audioInputIdx = inputs.length;
  inputs.push(`-i "${audioPath}"`);

  const filterParts = [];
  const imgCount = imagePaths.length;

  for (let i = 0; i < imgCount; i++) {
    filterParts.push(`[${i+1}:v]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,setsar=1[img${i}]`);
  }

  filterParts.push(`[0:v]setsar=1[base]`);

  let lastLabel = "base";
  stories.forEach((s, i) => {
    const start = ((i + 1) * sceneDuration).toFixed(2);
    const end = ((i + 2) * sceneDuration).toFixed(2);
    const newLabel = `scene${i}`;
    filterParts.push(`[${lastLabel}][img${i}]overlay=0:0:enable='between(t,${start},${end})'[${newLabel}]`);
    lastLabel = newLabel;
  });

  const drawLines = [];

  // Top bar
  drawLines.push(`drawbox=x=0:y=0:w=1080:h=110:color=0xe53e3e@1.0:t=fill`);
  drawLines.push(`drawtext=fontfile=${fontB}:text='CUT THE BS NEWS':fontcolor=white:fontsize=44:x=(w-text_w)/2:y=35`);

  // Intro
  const introEnd = sceneDuration.toFixed(2);
  drawLines.push(`drawbox=x=0:y=1580:w=1080:h=340:color=0x000000@0.88:t=fill:enable='between(t,0,${introEnd})'`);
  drawLines.push(`drawtext=fontfile=${fontB}:text='They want you scared today.':fontcolor=white:fontsize=52:x=(w-text_w)/2:y=1610:enable='between(t,0,${introEnd})'`);
  drawLines.push(`drawtext=fontfile=${fontB}:text='Here is what is actually going on.':fontcolor=0xff4444:fontsize=40:x=(w-text_w)/2:y=1685:enable='between(t,0,${introEnd})'`);
  drawLines.push(`drawtext=fontfile=${fontR}:text='Every story gets a BS Meter score':fontcolor=0xaaaaaa:fontsize=32:x=(w-text_w)/2:y=1755:enable='between(t,0,${introEnd})'`);

  // Stories
  stories.forEach((s, i) => {
    const start = ((i + 1) * sceneDuration).toFixed(2);
    const end = ((i + 2) * sceneDuration).toFixed(2);
    const headline = clean(s.headline, 32);
    const body1 = clean(s.body, 50);
    const body2 = clean(s.body.substring(50), 50);
    const category = clean(s.category || "NEWS", 12).toUpperCase();
    const agenda = clean(s.agenda, 48);
    const score = s.bs_score || 5;
    const bsColor = (score >= 8) ? "0xff3333" : (score >= 6) ? "0xff9900" : "0x33cc33";
    const bsBar = Math.round((score / 10) * 780);

    drawLines.push(`drawbox=x=0:y=1470:w=1080:h=450:color=0x000000@0.88:t=fill:enable='between(t,${start},${end})'`);
    drawLines.push(`drawbox=x=30:y=1480:w=180:h=40:color=0xe53e3e@1.0:t=fill:enable='between(t,${start},${end})'`);
    drawLines.push(`drawtext=fontfile=${fontB}:text='${category}':fontcolor=white:fontsize=24:x=40:y=1488:enable='between(t,${start},${end})'`);
    drawLines.push(`drawtext=fontfile=${fontR}:text='STORY ${i+1} OF ${stories.length}':fontcolor=0xaaaaaa:fontsize=24:x=230:y=1488:enable='between(t,${start},${end})'`);
    drawLines.push(`drawbox=x=0:y=1527:w=1080:h=4:color=0xe53e3e@0.6:t=fill:enable='between(t,${start},${end})'`);
    drawLines.push(`drawtext=fontfile=${fontB}:text='${headline}':fontcolor=white:fontsize=50:x=30:y=1542:enable='between(t,${start},${end})'`);
    drawLines.push(`drawtext=fontfile=${fontR}:text='${body1}':fontcolor=0xdddddd:fontsize=30:x=30:y=1608:enable='between(t,${start},${end})'`);
    if (body2.length > 2) {
      drawLines.push(`drawtext=fontfile=${fontR}:text='${body2}':fontcolor=0xdddddd:fontsize=30:x=30:y=1645:enable='between(t,${start},${end})'`);
    }
    drawLines.push(`drawtext=fontfile=${fontB}:text='BS METER':fontcolor=0xaaaaaa:fontsize=22:x=30:y=1700:enable='between(t,${start},${end})'`);
    drawLines.push(`drawbox=x=30:y=1728:w=780:h=16:color=0x333333@1.0:t=fill:enable='between(t,${start},${end})'`);
    drawLines.push(`drawbox=x=30:y=1728:w=${bsBar}:h=16:color=${bsColor}@1.0:t=fill:enable='between(t,${start},${end})'`);
    drawLines.push(`drawtext=fontfile=${fontB}:text='${score}/10':fontcolor=${bsColor}:fontsize=30:x=830:y=1722:enable='between(t,${start},${end})'`);
    drawLines.push(`drawbox=x=0:y=1758:w=1080:h=75:color=0xe53e3e@0.12:t=fill:enable='between(t,${start},${end})'`);
    drawLines.push(`drawtext=fontfile=${fontB}:text='WHO BENEFITS:':fontcolor=0xff6666:fontsize=22:x=30:y=1768:enable='between(t,${start},${end})'`);
    drawLines.push(`drawtext=fontfile=${fontR}:text='${agenda}':fontcolor=0xdddddd:fontsize=24:x=30:y=1798:enable='between(t,${start},${end})'`);
  });

  // Outro
  const outroStart = ((stories.length + 1) * sceneDuration).toFixed(2);
  const outroEnd = audioDuration.toFixed(2);
  drawLines.push(`drawbox=x=0:y=1430:w=1080:h=490:color=0x000000@0.92:t=fill:enable='between(t,${outroStart},${outroEnd})'`);
  drawLines.push(`drawbox=x=180:y=1455:w=720:h=5:color=0xe53e3e@1.0:t=fill:enable='between(t,${outroStart},${outroEnd})'`);
  drawLines.push(`drawtext=fontfile=${fontB}:text='Do not watch the news.':fontcolor=white:fontsize=54:x=(w-text_w)/2:y=1480:enable='between(t,${outroStart},${outroEnd})'`);
  drawLines.push(`drawtext=fontfile=${fontB}:text='Understand it.':fontcolor=0xff4444:fontsize=66:x=(w-text_w)/2:y=1558:enable='between(t,${outroStart},${outroEnd})'`);
  drawLines.push(`drawbox=x=180:y=1645:w=720:h=5:color=0xe53e3e@1.0:t=fill:enable='between(t,${outroStart},${outroEnd})'`);
  drawLines.push(`drawtext=fontfile=${fontR}:text='Follow for tomorrows episode.':fontcolor=0xaaaaaa:fontsize=36:x=(w-text_w)/2:y=1668:enable='between(t,${outroStart},${outroEnd})'`);
  drawLines.push(`drawtext=fontfile=${fontB}:text='@CutTheBSNews':fontcolor=0xff4444:fontsize=44:x=(w-text_w)/2:y=1728:enable='between(t,${outroStart},${outroEnd})'`);
  drawLines.push(`drawtext=fontfile=${fontR}:text='TikTok':fontcolor=0xaaaaaa:fontsize=32:x=(w-text_w)/2:y=1800:enable='between(t,${outroStart},${outroEnd})'`);

  const drawFilter = drawLines.join(",");
  const filterStr = [...filterParts, `[${lastLabel}]${drawFilter}[v]`].join(";");

  const scriptPath = path.join(OUTPUT, "render.sh");
  const ffmpegCmd = [
    "ffmpeg -y",
    inputs.join(" "),
    `-filter_complex "${filterStr}"`,
    `-map "[v]" -map ${audioInputIdx}:a`,
    `-c:v libx264 -preset ultrafast -crf 28 -c:a aac -shortest -pix_fmt yuv420p -threads 1`,
    `-t ${audioDuration.toFixed(1)}`,
    `"${videoPath}"`
  ].join(" ");

  fs.writeFileSync(scriptPath, `#!/bin/sh\n${ffmpegCmd}\n`);
  execSync(`chmod +x "${scriptPath}"`);
  console.log("   ⏳ Encoding broadcast...");
  execSync(`sh "${scriptPath}" || true`, { stdio: "inherit" });

  if (!fs.existsSync(videoPath) || fs.statSync(videoPath).size < 1000) {
    throw new Error("Video file was not created properly");
  }
  console.log(`   ✅ Video saved. Size: ${(fs.statSync(videoPath).size / 1024 / 1024).toFixed(1)} MB`);
  return videoPath;
}

async function uploadToDropbox(videoPath) {
  console.log("\n📤  Step 4/4 — Uploading to Dropbox...");
  const today = new Date().toISOString().split("T")[0];
  const fileName = `CutTheBSNews_${today}.mp4`;
  const fileBuffer = fs.readFileSync(videoPath);
  const res = await fetch("https://content.dropboxapi.com/2/files/upload", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${DROPBOX_TOKEN}`,
      "Dropbox-API-Arg": JSON.stringify({ path: `/CutTheBSNews/${fileName}`, mode: "overwrite", autorename: true }),
      "Content-Type": "application/octet-stream",
    },
    body: fileBuffer,
  });
  if (!res.ok) throw new Error(`Dropbox upload failed: ${await res.text()}`);
  const data = await res.json();
  console.log(`   ✅ Uploaded: ${data.path_display}`);
  return data;
}

async function run() {
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("  CUT THE BS NEWS — Daily Automation");
  console.log(`  ${new Date().toLocaleString()}`);
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  try {
    const episode = await generateScript();
    const imagePaths = await downloadImages(episode.stories || []);
    const audioPath = await generateVoice(episode.script);
    const videoPath = await renderVideo(episode, audioPath, imagePaths);
    await uploadToDropbox(videoPath);
    console.log("\n✅ ALL DONE! Check your Dropbox CutTheBSNews folder.\n");
  } catch (err) {
    console.error("\n❌ Error:", err.message);
    console.error(err.stack);
    process.exit(1);
  }
}

run();
