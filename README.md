# Cut The BS News — Full Setup Guide
## Railway + Google Drive + Make.com → TikTok

---

## How It Works
Every day at 5pm UTC (12pm EST):
1. Railway runs the script automatically
2. Claude writes today's news episode
3. ElevenLabs generates Brian's voice
4. Puppeteer renders a 9:16 vertical MP4
5. MP4 uploads to your Google Drive folder
6. Make.com detects the new file → posts to TikTok automatically

**You do nothing. Zero touch.**

---

## PART 1 — Deploy to Railway (15 min)

### Step 1 — Upload to GitHub
1. Go to github.com → click "New repository"
2. Name it "cutthebs" → click "Create repository"
3. Click "uploading an existing file"
4. Upload ALL files from this ZIP (keep the folder structure)
5. Click "Commit changes"

### Step 2 — Deploy on Railway
1. Go to railway.app → sign up → "New Project"
2. Click "Deploy from GitHub repo"
3. Connect your GitHub account → select "cutthebs"
4. Railway will detect the project automatically

### Step 3 — Add Environment Variables
In Railway → your project → "Variables" tab, add these:

**Variable 1:**
```
Name:  ANTHROPIC_API_KEY
Value: (copy from .env.railway file)
```

**Variable 2:**
```
Name:  ELEVENLABS_API_KEY
Value: (copy from .env.railway file)
```

**Variable 3:**
```
Name:  GOOGLE_SERVICE_ACCOUNT
Value: (copy the entire long JSON string from .env.railway file)
```

### Step 4 — Set the Cron Schedule
In Railway → your service → Settings → find "Cron Schedule":
```
0 17 * * *
```
This runs every day at 5pm UTC (noon EST / 9am PST).

### Step 5 — Share Drive Folder with Service Account
**IMPORTANT:** The Google service account needs access to your Drive folder.
1. Go to drive.google.com
2. Right click your "CutTheBSNews" folder → Share
3. Add this email as Editor:
   ```
   cutthebsnews@spry-utility-492018-v2.iam.gserviceaccount.com
   ```
4. Click Send

### Step 6 — Test It
In Railway → your service → click "Run Now"
Watch the logs — the full process takes about 3-4 minutes.
If successful, you'll see the MP4 appear in your Google Drive folder.

---

## PART 2 — Set Up Make.com (15 min)

### Step 1 — Sign Up
Go to make.com → create account → choose "Core" plan ($9/mo)

### Step 2 — Create a New Scenario
1. Click "Create a new scenario"
2. Click the "+" button to add your first module
3. Search for "Google Drive" → select "Watch Files in a Folder"

### Step 3 — Configure Google Drive Module
1. Click "Add" to create a connection
2. Choose "Service Account" authentication
3. Paste the contents of your service account JSON file
4. Set Folder ID to: `1deZ7sbxWlANuXKqfbI45YCKQ9i31ySAa`
5. Set "Watch" to: "New Files Only"
6. Set Maximum number of results: 1

### Step 4 — Add TikTok Module
1. Click the "+" after the Google Drive module
2. Search "TikTok" → select "Create a Post"
3. Connect your TikTok account (it'll open TikTok login)
4. Map the video file from the Google Drive module
5. Set caption to something like: "Daily news, zero BS 🗞️ #CutTheBSNews #fyp"

### Step 5 — Set the Schedule
1. Click the clock icon at the bottom of your scenario
2. Set to run every 15 minutes (Make.com checks Drive every 15 min)
3. Turn the scenario ON

### Step 6 — Test It
Click "Run Once" in Make.com.
If there's already an MP4 in your Drive folder from the Railway test, it should post to TikTok within 15 minutes.

---

## Total Monthly Cost
| Service | Cost |
|---|---|
| Railway | $5/mo |
| Make.com Core | $9/mo |
| Anthropic API | ~$3/mo |
| ElevenLabs Creator | $22/mo |
| **Total** | **~$39/mo** |

---

## Troubleshooting

**Railway says "ffmpeg not found"**
Add this to your railway.toml under [build]:
```
[build]
nixpacksPlan = "ffmpeg"
```

**Drive upload fails**
Make sure you shared the Drive folder with the service account email above.

**Make.com not detecting new files**
Make sure the scenario is turned ON and set to run every 15 minutes.

**TikTok post fails**
Re-authorize your TikTok account in Make.com → Connections.

---

## Changing the Posting Time
Edit railway.toml → change the cron schedule:
- `0 14 * * *` = 2pm UTC / 9am EST
- `0 17 * * *` = 5pm UTC / 12pm EST  ← current setting
- `0 21 * * *` = 9pm UTC / 4pm PST  ← best US evening engagement
