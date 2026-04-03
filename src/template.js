export function generateHTML(episode, audioPath) {
  const stories = episode.stories || [];

  const storyCards = stories.map((s, i) => `
    <div class="card" id="card-${i}">
      <div class="story-num">Story ${i + 1} of ${stories.length}</div>
      <div class="story-head">${s.headline}</div>
      <div class="story-body">${s.body}</div>
      <div class="agenda-box">
        <span class="agenda-label">WHO BENEFITS</span>
        <span class="agenda-text">${s.agenda}</span>
      </div>
      <div class="bs-wrap">
        <div class="bs-eyebrow">BS METER — does this affect your life?</div>
        <div class="bs-track"><div class="bs-bar" id="bar-${i}" style="background:${s.bs_color}"></div></div>
        <div class="bs-row">
          <span class="bs-score" id="score-${i}" style="color:${s.bs_color}">0/10</span>
          <span class="bs-verdict">${s.bs_score >= 8 ? "This one hits your wallet directly" : s.bs_score >= 6 ? "Worth paying attention to" : "Mostly noise — don't stress"}</span>
        </div>
      </div>
    </div>`).join("");

  const bgImages = [
    "https://images.unsplash.com/photo-1504711434969-e33886168f5c?w=1080&auto=format&fit=crop",
    ...stories.map(s => `https://source.unsplash.com/featured/1080x1920/?${encodeURIComponent(s.image_query)}`),
    "https://images.unsplash.com/photo-1495020689067-958852a7765e?w=1080&auto=format&fit=crop",
  ];

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<style>
* { box-sizing: border-box; margin: 0; padding: 0; }
body {
  width: 1080px; height: 1920px; overflow: hidden;
  background: #050505;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  color: #fff; position: relative;
}
#bg {
  position: absolute; inset: 0; z-index: 0;
  background-size: cover; background-position: center;
  transition: background-image 0.8s ease;
}
#bg::after {
  content: ''; position: absolute; inset: 0;
  background: linear-gradient(to top,
    rgba(0,0,0,0.97) 0%,
    rgba(0,0,0,0.75) 40%,
    rgba(0,0,0,0.35) 75%,
    rgba(0,0,0,0.15) 100%);
}
#topbar {
  position: absolute; top: 0; left: 0; right: 0; z-index: 20;
  padding: 52px 44px 28px;
  display: flex; align-items: center; justify-content: space-between;
}
.brand { font-size: 36px; font-weight: 800; letter-spacing: 0.05em; text-shadow: 0 2px 8px rgba(0,0,0,0.8); }
.brand .bs { color: #e53e3e; }
.live-chip {
  display: flex; align-items: center; gap: 10px;
  background: #e53e3e; border-radius: 8px; padding: 10px 20px;
}
.live-dot { width: 12px; height: 12px; border-radius: 50%; background: #fff; animation: blink 1.3s infinite; }
.live-chip span { font-size: 24px; font-weight: 800; color: #fff; letter-spacing: 0.1em; }
@keyframes blink { 0%,100%{opacity:1} 50%{opacity:0.15} }

/* progress dots on the right */
#dots {
  position: absolute; right: 36px; top: 50%; transform: translateY(-50%);
  z-index: 20; display: flex; flex-direction: column; gap: 18px;
  align-items: center;
}
.dot { width: 10px; height: 10px; border-radius: 50%; background: rgba(255,255,255,0.2); transition: all 0.4s; }
.dot.on { background: #e53e3e; transform: scale(1.5); }

/* waveform — shows while audio plays */
#wave {
  position: absolute; top: 46%; left: 50%; transform: translate(-50%, -50%);
  z-index: 20; display: none; align-items: flex-end; gap: 8px; height: 80px;
}
#wave.on { display: flex; }
.wb { width: 8px; border-radius: 4px; background: rgba(229,62,62,0.65); animation: wv 0.7s ease-in-out infinite; }
.wb:nth-child(1){height:18px;animation-delay:0s}
.wb:nth-child(2){height:40px;animation-delay:0.1s}
.wb:nth-child(3){height:72px;animation-delay:0.2s}
.wb:nth-child(4){height:40px;animation-delay:0.3s}
.wb:nth-child(5){height:18px;animation-delay:0.4s}
@keyframes wv { 0%,100%{transform:scaleY(0.3)} 50%{transform:scaleY(1)} }

/* main content — sits at bottom of screen */
#content {
  position: absolute; bottom: 0; left: 0; right: 0; z-index: 10;
  padding: 0 52px 100px;
}

/* INTRO */
#intro { display: none; }
#intro.on { display: block; }
#intro h1 { font-size: 80px; font-weight: 800; line-height: 1.1; margin-bottom: 24px; text-shadow: 0 4px 20px rgba(0,0,0,0.9); }
#intro h1 em { color: #e53e3e; font-style: normal; }
#intro p { font-size: 36px; color: rgba(255,255,255,0.65); line-height: 1.5; }

/* STORY CARDS */
.card { display: none; }
.card.on { display: block; animation: rise 0.5s ease; }
@keyframes rise { from{opacity:0;transform:translateY(24px)} to{opacity:1;transform:translateY(0)} }
.story-num { font-size: 24px; letter-spacing: 0.14em; color: rgba(255,255,255,0.35); text-transform: uppercase; margin-bottom: 14px; }
.story-head { font-size: 54px; font-weight: 800; line-height: 1.15; margin-bottom: 22px; text-shadow: 0 4px 16px rgba(0,0,0,0.9); }
.story-body { font-size: 32px; color: rgba(255,255,255,0.75); line-height: 1.6; margin-bottom: 24px; }
.agenda-box { background: rgba(229,62,62,0.15); border: 1px solid rgba(229,62,62,0.35); border-radius: 12px; padding: 16px 20px; margin-bottom: 28px; display: flex; gap: 12px; align-items: flex-start; }
.agenda-label { font-size: 18px; font-weight: 800; letter-spacing: 0.1em; color: #e53e3e; white-space: nowrap; padding-top: 2px; }
.agenda-text { font-size: 22px; color: rgba(255,255,255,0.65); line-height: 1.5; }
.bs-wrap {}
.bs-eyebrow { font-size: 20px; letter-spacing: 0.1em; color: rgba(255,255,255,0.35); text-transform: uppercase; margin-bottom: 14px; }
.bs-track { height: 14px; background: rgba(255,255,255,0.1); border-radius: 7px; overflow: hidden; margin-bottom: 12px; }
.bs-bar { height: 100%; border-radius: 7px; width: 0%; transition: width 1.4s cubic-bezier(0.25,1,0.5,1); }
.bs-row { display: flex; align-items: center; justify-content: space-between; }
.bs-score { font-size: 56px; font-weight: 800; }
.bs-verdict { font-size: 24px; color: rgba(255,255,255,0.45); font-style: italic; max-width: 52%; text-align: right; line-height: 1.4; }

/* OUTRO */
#outro { display: none; text-align: center; padding-bottom: 40px; }
#outro.on { display: block; animation: rise 0.5s ease; }
#outro h2 { font-size: 76px; font-weight: 800; line-height: 1.2; margin-bottom: 28px; }
#outro h2 span { color: #e53e3e; }
#outro p { font-size: 34px; color: rgba(255,255,255,0.5); margin-bottom: 12px; }
#outro .cta { font-size: 44px; font-weight: 800; color: #e53e3e !important; margin-top: 36px !important; }
</style>
</head>
<body>

<div id="bg"></div>

<div id="topbar">
  <div class="brand">CUT THE <span class="bs">BS</span> NEWS</div>
  <div class="live-chip"><div class="live-dot"></div><span>LIVE</span></div>
</div>

<div id="wave">
  <div class="wb"></div><div class="wb"></div><div class="wb"></div>
  <div class="wb"></div><div class="wb"></div>
</div>

<div id="dots">
  <div class="dot on" id="d-intro"></div>
  ${stories.map((_, i) => `<div class="dot" id="d-${i}"></div>`).join("")}
  <div class="dot" id="d-outro"></div>
</div>

<div id="content">
  <div id="intro">
    <h1>They want you <em>scared.</em><br>Here's what's actually going on.</h1>
    <p>Today's top stories, zero BS.</p>
  </div>
  ${storyCards}
  <div id="outro">
    <h2>Don't watch the news.<br><span>Understand it.</span></h2>
    <p>Cut The BS News — daily.</p>
    <p class="cta">Follow for tomorrow's episode.</p>
  </div>
</div>

<audio id="aud" src="file://${audioPath.replace(/\\/g, "/")}"></audio>

<script>
const bgImages = ${JSON.stringify(bgImages)};
const stories = ${JSON.stringify(stories)};
const totalScenes = stories.length + 2;
const sceneDuration = Math.floor(60000 / totalScenes);
let scene = -1;

function dot(id) {
  document.querySelectorAll('.dot').forEach(d => d.classList.remove('on'));
  const el = document.getElementById(id);
  if (el) el.classList.add('on');
}
function bg(idx) {
  document.getElementById('bg').style.backgroundImage =
    'url("' + (bgImages[Math.min(idx, bgImages.length - 1)] || '') + '")';
}
function hideAll() {
  document.getElementById('intro').classList.remove('on');
  document.getElementById('outro').classList.remove('on');
  stories.forEach((_, i) => document.getElementById('card-' + i)?.classList.remove('on'));
}

function nextScene() {
  scene++;
  hideAll();
  if (scene === 0) {
    document.getElementById('intro').classList.add('on');
    dot('d-intro'); bg(0);
  } else if (scene <= stories.length) {
    const i = scene - 1;
    const card = document.getElementById('card-' + i);
    if (card) card.classList.add('on');
    dot('d-' + i); bg(i + 1);
    setTimeout(() => {
      const bar = document.getElementById('bar-' + i);
      const sc = document.getElementById('score-' + i);
      if (bar) bar.style.width = (stories[i].bs_score * 10) + '%';
      if (sc) sc.textContent = stories[i].bs_score + '/10';
    }, 500);
  } else {
    document.getElementById('outro').classList.add('on');
    dot('d-outro'); bg(bgImages.length - 1);
  }
  if (scene < totalScenes - 1) setTimeout(nextScene, sceneDuration);
}

window.startEpisode = function() {
  const aud = document.getElementById('aud');
  aud.play().catch(() => {});
  document.getElementById('wave').classList.add('on');
  nextScene();
};

setTimeout(() => window.startEpisode(), 800);
</script>
</body>
</html>`;
}
