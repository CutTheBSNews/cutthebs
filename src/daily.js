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
    `-c:v libx264 -preset ultrafast -crf 35 -c:a aac -shortest -pix_fmt yuv420p -threads 1`, 
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
  console.log("\n📤  Step 4/4 — Uploading to Dropbox...");
  const today = new Date().toISOString().split("T")[0];
  const fileName = `CutTheBSNews_${today}.mp4`;
  const fileBuffer = fs.readFileSync(videoPath);
  const res = await fetch("https://content.dropboxapi.com/2/files/upload", {
    method: "POST",
    headers: {
      "Authorization": `Bearer sl.u.AGbz0KIHdUpYJYCRkgQEICqTAONxNSgLcS-03ekvj9BMd2dVYbV0rAInMDJetcaPvkh6AuDZUxv4Dr45iXUnnNpk97IlGDQwIHRKaV9bCjx36nF4BCs_bv2zPR5262nBKVSusKiU8X1s1Q7Tr4JZFU0HAEFLQKGLkDM2EOU7ZRgX7ArFJoGUqDoeRS44pUB3zBEXvU0aQxvWSkOI-zfT_T99vBWBuIhWYsOY1jM3NamgOROR_BvSIS7FepcNoQ2CRxBhM_SGP-ZQR6e_zq-EFk2eJkSV7girK3rlwJOv6g_sUt9jCf9jbZqj57i1R_2BuQFnDa_kWrPA6ghMsbSXO2esaH6aTKyDmP_meAt0zvlZYfL3Rwkjrbt8xCcKL7PF8w9tscEJVzIf6bqbe1MbfSfjk_ehzVZATybJ8tceHkJl_j8cPKzimwwOkL2pL7eaAYy_Zg7Jn-oMSL8z9UVyxTDwQxuxd4AYJn6eeMzZfO2-NQwbHQGBtsni6ToTM_KefcEck5URXLDcVgNJa22D1SuIh9L6EC1SpVOmWQuvs0Vsp8NuTYn82WwrDvF6yOJyS3ZzBc92r_OG8StdZaPOMXJWwvjhP2dGfkRS15ZogeF-dCtXknc5iej9koV7rU5CzIxKDMxOKiI-S9C52ZegIlWHdQ8F_LVe4IkvaHG0OJvQS_bxOCXxLIalCO6qY9h3yBhoHtaFKs-zrTdTH3iZD0pFnjizGJ-ygpWh4LK07AsOvMQ2B3iht_u7by9QaWeTtca0e96uLlkAt_7STmEYHQIT-TER8eZhFRUreh1s9rPAx7zBxQVSfoJ-Dpbf7IwEgW9Ogmj765iS6W21iGbIsGfhx63Zfty35lhvSt9MZKSV1d6ghJainl__L2MvJYl1ifWF0K2gRL3NYfbAGwSHg4-43CSiGjrrn3RL4Bn9dZMkViXXb13yRDY0RTv_TIVdOmdfEz371gGU0PE15V1pcHa-l7WsfWiLz7V4pceZGPyHuBgvM9Fh9PcqLU1yMP_RAEW3AkTqCtAcNc1Syp6lCPnerTbgEWuhfLYZHTprUA4A_G08GSry4WyejM102h2tnPQHgMZ4sBpTYHb58EiLMat1GQdQR0zC4dYUxFpdjZR7HwmR3gxivV3e2IsT_lY-OxI7wMILTBQB_5AUSdgeF_I35Y3oOdcNQSwI31DjZOWMxUGx4r26B_S8su5_NHWLkTbMn5orRczR2stbniXW8vLFJ_xVxG1dVYWUqrJXRczYxR9My8WnqD1i8rwwkwPx2jptaDL8nSJTUnhs-yAOhqMrIZbzMvQ14BJXUR0LW4JUtxQQ8anjL8CgIULb40WQM-IhsbldEfMQZcjBqmURVl_3tv3Ge8FHkPG6EEsoBaIxG9j-JnuKq2uu_vU14VQgfBc`,
      "Dropbox-API-Arg": JSON.stringify({ path: `/CutTheBSNews/${fileName}`, mode: "overwrite", autorename: true }),
      "Content-Type": "application/octet-stream",
    },
    body: fileBuffer,
  });
  if (!res.ok) throw new Error(`Dropbox upload failed: ${await res.text()}`);
  const data = await res.json();
  console.log(`   ✅ Uploaded to Dropbox: ${data.path_display}`);
  return data;
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
