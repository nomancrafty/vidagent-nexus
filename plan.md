# VidAgent Nexus — Full Pipeline
## Claude Code System Prompt & Implementation Guidelines (v2)

---

## WHAT THIS SYSTEM BUILDS

An end-to-end **AI video outreach pipeline** that:

1. Accepts a CSV of prospects
2. Verifies every email via MailTester.Ninja API
3. Uses Claude AI to generate a personalized video script per prospect (based on company description pasted per campaign)
4. Captures the prospect's website as a scrolling video (Puppeteer)
5. Generates a personalized avatar video via HeyGen API (avatar overlaid on website recording)
6. Hosts a personalized landing page per prospect embedding the video
7. Sends the landing page link via ManyReach cold email API
8. Pulls campaign analytics (opens, replies, emails sent, reply rate) back from ManyReach
9. Displays everything in an Analytics dashboard with charts

---

## TECH STACK

Match whatever runtime exists in `nomancrafty/vidagent-nexus`. Assume Node.js / Express.

- **Queue**: BullMQ + Redis (all video jobs are async)
- **DB**: Match existing schema (supabase)
- **Storage**: AWS S3 (all video files)
- **Email Verification**: MailTester.Ninja API
- **Video**: HeyGen API (v2) + Puppeteer + FFmpeg
- **Email Sending**: ManyReach API
- **Script AI**: Claude API (claude-sonnet-4-20250514) or existing AI integration in repo
- **Landing Pages**: Handlebars server-rendered HTML
- **Analytics UI**: Chart.js or Recharts — match what's already in the frontend

---

## FULL MODULE ARCHITECTURE

```
/modules/
  ├── prospects/
  │   ├── routes/
  │   │   └── prospect.routes.js         # POST /api/prospects/upload (CSV)
  │   ├── services/
  │   │   ├── csvParser.service.js        # Parse & validate CSV columns
  │   │   └── emailVerifier.service.js    # MailTester.Ninja integration
  │   └── models/
  │       └── Prospect.model.js           # DB model
  │
  ├── campaigns/
  │   ├── routes/
  │   │   └── campaign.routes.js          # POST /api/campaigns, GET /api/campaigns/:id
  │   ├── services/
  │   │   └── campaign.service.js         # Campaign creation + orchestration
  │   └── models/
  │       └── Campaign.model.js
  │
  ├── video-automation/
  │   ├── routes/
  │   │   ├── videoJob.routes.js          # POST /api/video/generate, GET /api/video/status/:id
  │   │   ├── landingPage.routes.js       # GET /lp/:jobId
  │   │   └── webhook.routes.js           # POST /api/video/webhook (HeyGen callback)
  │   ├── services/
  │   │   ├── heygen.service.js
  │   │   ├── websiteCapture.service.js   # Puppeteer scroll recording
  │   │   ├── videoComposite.service.js   # FFmpeg PiP
  │   │   ├── scriptBuilder.service.js    # Claude AI script generation
  │   │   └── storage.service.js          # S3 helpers
  │   ├── queues/
  │   │   └── videoJob.queue.js           # BullMQ worker
  │   ├── templates/
  │   │   └── landingPage.html            # Personalized landing page
  │   └── models/
  │       └── VideoJob.model.js
  │
  ├── outreach/
  │   ├── routes/
  │   │   └── outreach.routes.js          # POST /api/outreach/send
  │   └── services/
  │       └── manyreach.service.js        # ManyReach API integration
  │
  └── analytics/
      ├── routes/
      │   └── analytics.routes.js         # GET /api/analytics/:campaignId
      └── services/
          └── analytics.service.js        # Pull + aggregate ManyReach stats
```

---

## IMPLEMENTATION STEPS

---

### STEP 1 — Prospect Upload & CSV Parsing

**Route**: `POST /api/prospects/upload`
- Accept `multipart/form-data` with a CSV file
- Required CSV columns: `firstName, lastName, company, website, email, companyDescription`
- Parse with `csv-parse` or `papaparse` (Node)
- Validate: all 6 columns present, email looks like an email, website is a URL
- On validation failure: return row-level errors so the user sees exactly which rows failed
- Store valid rows as `Prospect` documents in DB with `status: 'unverified'`
- Return: `{ total, valid, invalid, prospects: [...] }`

**Prospect model fields:**
```
firstName, lastName, company, website, email,
companyDescription, emailStatus (unverified|valid|invalid|risky),
emailVerifiedAt, campaignId, videoJobId, landingPageUrl, createdAt
```

---

### STEP 2 — Email Verification (MailTester.Ninja)

**Trigger**: After CSV upload, immediately kick off verification for all valid rows.

**MailTester.Ninja API** — call for each email:
```
GET https://api.mailtester.ninja/v1/verify?email=<email>
Headers: { Authorization: Bearer <MAILTESTER_API_KEY> }
```

Response fields to store:
- `result`: `valid` | `invalid` | `unknown`
- `reason`: e.g. `mailbox_not_found`, `domain_invalid`, `catch_all`
- `is_disposable`: boolean
- `is_role_based`: boolean (e.g. info@, support@)
- `mx_found`: boolean

**Categorization rules:**
- `result: valid` AND `is_disposable: false` → set `emailStatus: 'valid'`
- `result: invalid` → set `emailStatus: 'invalid'` — EXCLUDE from sending
- `result: unknown` OR `is_role_based: true` → set `emailStatus: 'risky'` — flag but keep
- `is_disposable: true` → set `emailStatus: 'invalid'`

**Route**: `POST /api/prospects/verify/:uploadBatchId`
- Runs verification for all prospects in a batch
- Rate limit: max 5 concurrent requests to MailTester.Ninja (use `p-limit`)
- Return verification summary: `{ valid: N, invalid: N, risky: N }`

**Important**: Never hard-delete risky emails — just flag them. Let the user decide in the campaign setup whether to include risky emails or not.

---

### STEP 3 — Campaign Creation

**Route**: `POST /api/campaigns`

```json
// Request body:
{
  "name": "Q2 SaaS Outreach",
  "prospectBatchId": "batch_abc",
  "includeRisky": false,
  "senderAvatar": {
    "avatarId": "heygen_avatar_id",
    "voiceId": "heygen_voice_id"
  },
  "campaignDescription": "We help SaaS companies reduce churn by 40% using AI-powered onboarding. Our product plugs directly into their stack in under a day.",
  "emailSubject": "Made this for {{firstName}}",
  "emailTemplate": "Hey {{firstName}},\n\nI made a quick video specifically for {{company}}.\n\n{{landingPageUrl}}\n\nWorth 60 seconds.\n\n— {{senderName}}",
  "videoMode": "website_bg",   // or "plain_bg"
  "manyreachCampaignId": "mr_campaign_xyz"   // pre-created in ManyReach dashboard
}
```

On creation:
- Filter prospects by `emailStatus` (exclude `invalid`, optionally exclude `risky`)
- Create one `VideoJob` per valid prospect in DB with `status: 'queued'`
- Push all jobs to BullMQ queue
- Return: `{ campaignId, totalProspects, jobsQueued }`

---

### STEP 4 — AI Script Generation (Claude API)

**Service**: `scriptBuilder.service.js`

For each prospect, call Claude API to generate a personalized script:

```javascript
const systemPrompt = `You are a world-class B2B sales copywriter. 
Write a SHORT, punchy video script (max 60 seconds when spoken, ~130 words).
The script is spoken by a human to camera. 
Tone: warm, direct, not salesy. No buzzwords.
Output ONLY the script text. No stage directions. No labels.`;

const userPrompt = `
Prospect: ${firstName} ${lastName} at ${company}
Their website: ${website}
What they do (our research): ${companyDescription}

What we offer: ${campaignDescription}

Write a personalized video script that:
1. Opens with something specific about their company (from the description)
2. Bridges to what we offer
3. Ends with a soft CTA to watch the full video on the landing page
`;
```

API call:
```
POST https://api.anthropic.com/v1/messages
Headers: { x-api-key: ANTHROPIC_API_KEY, anthropic-version: 2023-06-01 }
Body: { model: "claude-sonnet-4-20250514", max_tokens: 400, messages: [...] }
```

- Keep scripts under 4500 chars (HeyGen limit is 5000)
- Store `scriptText` in the `VideoJob` document
- If Claude call fails: retry once, then fall back to a simple template string

---

### STEP 5 — Website Capture (Puppeteer)

**Service**: `websiteCapture.service.js`

For each prospect (if `videoMode === 'website_bg'`):

```javascript
async function captureWebsiteScrollVideo(websiteUrl) {
  const browser = await puppeteer.launch({ args: ['--no-sandbox', '--disable-setuid-sandbox'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 720 });

  try {
    await page.goto(normalizeUrl(websiteUrl), {
      waitUntil: 'networkidle2',
      timeout: 15000
    });
  } catch (err) {
    await browser.close();
    return null; // triggers plain_bg fallback
  }

  // Take screenshots every 300ms while scrolling over 10 seconds
  // Use page.evaluate to auto-scroll
  // Collect frames → stitch with FFmpeg into MP4
  // Return: local file path

  await browser.close();
  return videoFilePath;
}
```

Key rules:
- Normalize URLs: ensure `https://` prefix
- If page fails to load within 15s → return `null` → job falls back to `plain_bg`
- Output: 1280×720, 24fps, 10-second scrolling video
- File saved to `/tmp/website-<jobId>.mp4`

---

### STEP 6 — Video Compositing (FFmpeg)

**Service**: `videoComposite.service.js`

Only runs if website video was captured successfully.

```javascript
// Avatar video (downloaded from HeyGen) = foreground PiP, bottom-right
// Website video = full background

ffmpeg()
  .input(websiteVideoPath)
  .input(avatarVideoPath)
  .complexFilter([
    '[1:v]scale=iw*0.28:-1[avatar]',
    '[0:v][avatar]overlay=W-w-24:H-h-24'
  ])
  .audioCodec('aac')
  .output(compositedOutputPath)
  .run();
```

- Upload composited file to S3
- Delete local `/tmp` files after upload
- Store S3 URL in `VideoJob.finalVideoUrl`

---

### STEP 7 — HeyGen Integration

**Service**: `heygen.service.js`

All requests: `x-api-key: HEYGEN_API_KEY`

#### 7a. Generate Avatar Video
```
POST https://api.heygen.com/v2/video/generate
Body: {
  video_inputs: [{
    character: {
      type: "avatar",
      avatar_id: "<avatarId>",
      avatar_style: "normal"
    },
    voice: {
      type: "text",
      input_text: "<scriptText>",
      voice_id: "<voiceId>"
    },
    background: {
      type: "video",
      url: "<S3 URL of website recording>"   // or omit for plain background
    }
  }],
  dimension: { width: 1280, height: 720 }
}
```

Returns `video_id`. Store it in `VideoJob.heygenVideoId`.

#### 7b. Poll Status
```
GET https://api.heygen.com/v1/video_status.get?video_id=<video_id>
```
Poll every 15 seconds. States: `pending` → `processing` → `completed` / `failed`.

On `completed`:
- `video_url` in response — download immediately and re-upload to S3 (HeyGen URLs expire in 7 days)
- Update `VideoJob.status = 'done'`, store S3 URL

#### 7c. HeyGen Webhook (preferred over polling)
Register `POST /api/video/webhook` in HeyGen dashboard.
Event: `avatar_video.success` → update job in DB immediately.
Verify request authenticity using HeyGen signature header.

---

### STEP 8 — Landing Page

**Route**: `GET /lp/:jobId`

Fetch `VideoJob` from DB → render `landingPage.html` with:
- `{{firstName}}` — personalized greeting
- `{{company}}` — their company
- `{{videoUrl}}` — S3 video URL or HeyGen video URL
- `{{senderName}}` — who sent it
- `{{ctaUrl}}` — calendar/booking link (set per campaign)

**Landing page requirements:**
- Full-width video player (autoplay muted, click to unmute)
- Headline: `"Hey {{firstName}}, I made this for {{company}}"`
- CTA button below video
- OG meta tags (title, description, image = video thumbnail)
- Mobile responsive, no JS framework — plain HTML/CSS only
- Page must load under 2 seconds (no heavy assets)

Store landing page URL (`/lp/:jobId`) in `VideoJob.landingPageUrl` and `Prospect.landingPageUrl`.

---

### STEP 9 — ManyReach Email Sending

**Service**: `manyreach.service.js`

ManyReach API uses Bearer token auth. Base URL: `https://api.manyreach.com` (confirm exact base URL from your ManyReach account → API settings).

#### 9a. Add Prospect to ManyReach Campaign
```
POST /api/v1/campaigns/<manyreachCampaignId>/prospects
Headers: { Authorization: Bearer <MANYREACH_API_KEY> }
Body: {
  email: prospect.email,
  firstName: prospect.firstName,
  lastName: prospect.lastName,
  company: prospect.company,
  customVariables: {
    landingPageUrl: prospect.landingPageUrl,
    company: prospect.company
  }
}
```

#### 9b. Trigger Campaign Send (if not on auto-send)
```
POST /api/v1/campaigns/<manyreachCampaignId>/start
```

#### 9c. Pull Campaign Analytics
```
GET /api/v1/campaigns/<manyreachCampaignId>/analytics
```

Expected response fields to store in your DB:
- `emailsSent`
- `opens` / `openRate`
- `clicks` / `clickRate`
- `replies` / `replyRate`
- `bounces` / `bounceRate`
- `unsubscribes`

**Important**: ManyReach's exact API spec is behind their dashboard login. Before implementing, check `Settings → API` in ManyReach to get the actual base URL and endpoint list. Implement a thin adapter layer (`manyreach.service.js`) so endpoints can be updated easily without touching business logic.

---

### STEP 10 — Full Job Queue Worker

**File**: `videoJob.queue.js`

BullMQ worker processes each `VideoJob`. Steps in order:

```
1. GENERATE SCRIPT     → Call Claude API with prospect + campaign data
2. CAPTURE WEBSITE     → Puppeteer scroll recording (skip if plain_bg mode)
3. UPLOAD TO S3        → Upload website video
4. SUBMIT TO HEYGEN    → POST to HeyGen, get video_id
5. POLL / WEBHOOK      → Wait for HeyGen completion (15s poll interval)
6. DOWNLOAD VIDEO      → Download completed video from HeyGen URL
7. COMPOSITE           → FFmpeg PiP if website_bg mode (otherwise skip)
8. UPLOAD FINAL        → Upload final video to S3
9. UPDATE JOB          → Set status='done', save URLs in DB
10. SEND EMAIL         → Add prospect to ManyReach campaign
11. MARK SENT          → Update Prospect.status = 'sent'
```

On any step failure:
- Log error with `{ jobId, step, error, timestamp }`
- Mark job `status: 'failed'`, store `error` string
- Do NOT retry automatically — surface failures in the dashboard for manual retry

---

### STEP 11 — Analytics Module

**Route**: `GET /api/analytics/:campaignId`

Pull from two sources and merge:

**Source A — Internal DB** (real-time):
- Total prospects uploaded
- Email verification breakdown (valid / invalid / risky)
- Video jobs: queued / processing / done / failed
- Emails sent count

**Source B — ManyReach API** (polled every 15 minutes, cached in DB):
- Opens, open rate
- Replies, reply rate
- Clicks, click rate
- Bounces, bounce rate

**Response shape**:
```json
{
  "campaignId": "...",
  "campaignName": "...",
  "emailVerification": {
    "total": 200,
    "valid": 170,
    "invalid": 20,
    "risky": 10
  },
  "videoJobs": {
    "queued": 5,
    "processing": 12,
    "done": 148,
    "failed": 5
  },
  "outreach": {
    "sent": 148,
    "opens": 89,
    "openRate": 0.60,
    "replies": 22,
    "replyRate": 0.149,
    "clicks": 41,
    "clickRate": 0.277,
    "bounces": 3,
    "bounceRate": 0.02
  },
  "lastSyncedAt": "2026-04-19T12:00:00Z"
}
```

**Charts to render on the frontend** (tell the frontend to build these):
1. **Funnel chart**: Uploaded → Verified → Videos done → Sent → Opened → Replied
2. **Line chart**: Opens / Replies over time (daily)
3. **Donut chart**: Email verification breakdown (valid / invalid / risky)
4. **Bar chart**: Video job statuses (queued / processing / done / failed)
5. **KPI cards**: Total sent, Open rate %, Reply rate %, Bounce rate %

---

### STEP 12 — API Route Summary

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/prospects/upload` | Upload CSV |
| POST | `/api/prospects/verify/:batchId` | Run email verification |
| GET | `/api/prospects/:batchId` | List prospects + statuses |
| POST | `/api/campaigns` | Create campaign |
| GET | `/api/campaigns` | List all campaigns |
| GET | `/api/campaigns/:id` | Campaign detail |
| POST | `/api/video/generate` | Queue single video job |
| GET | `/api/video/status/:jobId` | Poll job status |
| POST | `/api/video/webhook` | HeyGen webhook callback |
| GET | `/lp/:jobId` | Serve landing page |
| POST | `/api/outreach/send` | Push to ManyReach |
| GET | `/api/analytics/:campaignId` | Get analytics |
| POST | `/api/analytics/:campaignId/sync` | Force sync ManyReach stats |
| POST | `/api/sender` | Register sender avatar (one-time) |
| GET | `/api/sender` | List registered senders |

---

## DATA FLOW DIAGRAM

```
CSV Upload
    ↓
Parse + Validate rows
    ↓
MailTester.Ninja verification (per email)
    ↓
Campaign created (user picks valid prospects + sets campaign description)
    ↓
BullMQ jobs created (1 per prospect)
    ↓
Per job (parallel, max 5 concurrent):
  Claude → Script
  Puppeteer → Website video
  FFmpeg → Composite
  HeyGen → Avatar video
  S3 → Store video
  DB → Landing page URL
    ↓
ManyReach → Add prospect + send email with landing page link
    ↓
ManyReach → Poll analytics every 15 min → Store in DB
    ↓
Analytics API → Serve to dashboard
```

---

## ENVIRONMENT VARIABLES

```
# HeyGen
HEYGEN_API_KEY=

# MailTester.Ninja
MAILTESTER_API_KEY=

# ManyReach
MANYREACH_API_KEY=

# Anthropic (for script generation)
ANTHROPIC_API_KEY=

# AWS S3
AWS_ACCESS_KEY_ID=
AWS_SECRET_ACCESS_KEY=
AWS_BUCKET_NAME=vidagent-videos
AWS_REGION=us-east-1

# Redis (BullMQ)
REDIS_URL=redis://localhost:6379

# App
BASE_URL=https://yourdomain.com
MAX_CONCURRENT_VIDEO_JOBS=5
ANALYTICS_SYNC_INTERVAL_MINUTES=15
```

---

## ERROR HANDLING RULES

Apply to every service:

| Scenario | Behavior |
|----------|----------|
| MailTester.Ninja 429 (rate limit) | Exponential backoff, max 3 retries |
| Website URL unreachable | Fall back to `plain_bg`, log warning, continue |
| Claude script generation fails | Retry once → fall back to template string |
| HeyGen returns `failed` status | Mark job failed, store error, surface in dashboard |
| HeyGen URL not ready after 15 min | Mark job failed with `timeout` error |
| S3 upload fails | Retry once, then fail job |
| ManyReach API error on send | Mark `outreachStatus: 'failed'`, do not retry automatically |
| ManyReach analytics sync fails | Log, keep last cached data, try again next interval |

---

## PHASE PLAN

### Phase 1 — NOW (build this)
- CSV upload + MailTester.Ninja verification
- Campaign creation with company description input
- Claude AI script generation
- HeyGen Instant Avatar (photo-based) — no Digital Twin yet
- Puppeteer website capture + FFmpeg compositing
- Landing page per prospect
- ManyReach email sending
- Analytics: pull from ManyReach + internal job data
- Dashboard charts (funnel, line, donut, KPI cards)

### Phase 2 — Next
- Batch retry for failed video jobs from dashboard
- A/B test two script variants per campaign
- Conditional follow-up: if no reply in 3 days → send follow-up email automatically
- Export analytics as CSV

### Phase 3 — Later (open source migration)
- Replace HeyGen with self-hosted TTS + avatar (e.g. SadTalker, Coqui TTS)
- Replace MailTester.Ninja with self-hosted MX/SMTP verification
- Replace Puppeteer cloud with local Chromium pool

---

## CODE QUALITY REQUIREMENTS

- All async functions use `try/catch` — zero unhandled rejections
- Structured logging on every job step: `{ jobId, step, status, durationMs, timestamp }`
- All S3 URLs stored in DB — never local paths in production data
- No hardcoded keys — always `process.env.*`
- BullMQ workers handle `SIGTERM` gracefully (drain before exit)
- `p-limit` to cap concurrent Puppeteer instances (max 3) and HeyGen calls (max 5)
- ManyReach analytics cached in DB — never call their API per page load (sync on interval only)

---

## DO NOT

- Do not build frontend UI for these routes — backend + landing page HTML only
- Do not store videos on local disk permanently — `/tmp` only as staging before S3
- Do not use HeyGen deprecated v1 personalized video endpoints (deprecated Jan 2025)
- Do not call ManyReach analytics API on every dashboard load — use cached DB data
- Do not send emails to prospects with `emailStatus: 'invalid'` under any circumstance
- Do not hardcode `avatar_id` or `voice_id` — always read from sender profile in DB
- Do not block the main event loop — all heavy work goes through BullMQ
