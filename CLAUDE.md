# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev          # Start frontend dev server at http://localhost:8080
npm run build        # Production build
npm run lint         # ESLint on all TS/TSX files
npm run test         # Run tests once (Vitest)
npm run test:watch   # Run tests in watch mode
npm run preview      # Preview production build
```

## What This System Builds

A **personalized Loom-style outreach system at scale** — NOT an AI avatar system.

End-to-end pipeline:
1. CSV prospect upload
2. MailTester.Ninja email verification
3. Puppeteer records a scrolling MP4 video of the prospect's website
4. Video stored locally under `/uploads/videos/{jobId}.mp4`
5. ManyReach API sends a cold email with the video link
6. Analytics pulled from ManyReach (sent + replies + clicks + opens), cached in DB

## Architecture

### Frontend (`vidagent-nexus` — this repo)

Client-side React SPA using Supabase for auth and DB. All heavy work is triggered via API calls to the backend.

- [src/App.tsx](src/App.tsx) — React Router v6 config; all dashboard routes wrapped in `<ProtectedRoute>`
- [src/contexts/AuthContext.tsx](src/contexts/AuthContext.tsx) — Supabase auth provider
- [src/layouts/DashboardLayout.tsx](src/layouts/DashboardLayout.tsx) — sidebar + topnav shell
- [src/services/dataService.ts](src/services/dataService.ts) — CRUD for all entities via Supabase
- [src/types/data.ts](src/types/data.ts) — canonical TypeScript interfaces; update here first when changing data shapes
- `src/components/ui/` — shadcn/ui primitives; regenerate via shadcn CLI, do not edit directly

**Key libraries:** React Hook Form + Zod (forms), TanStack Query (async state), Recharts (charts), Sonner (toasts), Lucide React (icons)

### Backend (Node.js / Express — to be built)

Module layout under `/modules/`:

```
prospects/        CSV parse + Supabase insert
verification/     MailTester.Ninja email verification
recorder/         Puppeteer website video recording
email/            ManyReach campaign creation + email send + CSV export
analytics/        Aggregate ManyReach stats, cache in DB
cleanup/          Daily cron to delete videos older than 7 days
```

**Queue**: BullMQ + Redis — all video recordings are async, max 3–5 concurrent jobs (`MAX_CONCURRENT_RECORDINGS`).
**DB**: Supabase — prospects, email_logs, analytics, campaigns.
**Storage**: Local disk — `/uploads/videos/{jobId}.mp4`, served via `express.static`.

---

## Module Breakdown

### 1. Prospect Upload Module

**Input**: CSV with columns: `firstName, email, company, website`

**Output** — stored in Supabase `prospects` table:
```json
{
  "id": "uuid",
  "firstName": "string",
  "email": "string",
  "company": "string",
  "website": "string",
  "emailStatus": "pending"
}
```

### 2. Email Verification Module

**API**: MailTester.Ninja (`https://happy.mailtester.ninja/ninja`)

**Logic**:
- Code `ok` + message `Accepted` → `emailStatus: 'valid'`
- Code `ko` → `emailStatus: 'invalid'`
- Code `mb` (catch-all) → `emailStatus: 'risky'`

**Hard Rule**: Never send email if `emailStatus !== 'valid'`

**Rate limiting**: Max 10 requests per 10 seconds (batches of 5 per 600ms)

### 3. Website Video Recorder (Core Feature)

**Goal**: Produce a smooth, Loom-style scrolling MP4 of the prospect's website.

**Tech**: `puppeteer` + `puppeteer-screen-recorder`

**Input**: `website URL`, `jobId`

**Output**: `/uploads/videos/{jobId}.mp4`

**Recording Behavior**:
1. Open URL, wait for `networkidle2`
2. Start recording
3. Pause 2 seconds at top
4. Smooth scroll through full page (~10–20 seconds of scrolling)
5. Stop recording
6. Save file locally

**Timing rules**:
- Total video: max 30–40 seconds
- Scrolling must look natural, not robotic

**Signature**:
```ts
recordWebsite(url: string, jobId: string): Promise<string> // returns videoPath
```

**Storage**:
```
/uploads/
  └── videos/
        └── {jobId}.mp4
```

**Serve files**:
```js
app.use('/uploads', express.static('uploads'));
```

**Video URL format**:
```
${BASE_URL}/uploads/videos/${jobId}.mp4
```

### 4. Email Sending Module

**API**: ManyReach

**Steps**:
1. Create campaign in ManyReach
2. Upload leads to campaign
3. Send emails

**Email Template**:
```
Subject: Quick idea for {{company}}

Hi {{firstName}},

I recorded a quick walkthrough of your website:

{{videoUrl}}

I noticed a few areas that could improve conversions.

Worth a quick chat?

Best,
{{senderName}}
```

**Email log** — stored in Supabase `email_logs` table:
```json
{
  "id": "uuid",
  "prospectId": "string",
  "campaignId": "string",
  "status": "sent | failed",
  "sentAt": "ISO timestamp",
  "messageId": "string",
  "videoPath": "string"
}
```

**CSV Export**: Support exporting leads + video URLs as CSV for manual ManyReach upload if needed.

### 5. Analytics Module

**Track only**:
- Total Emails Sent
- Total Replies
- Total Clicked
- Total Opened

**Calculations**:
```
replyRate = (totalReplies / totalSent) * 100
```

**Analytics record** — stored in Supabase `analytics` table:
```json
{
  "campaignId": "string",
  "totalSent": "number",
  "totalReplies": "number",
  "totalClicked": "number",
  "totalOpened": "number",
  "replyRate": "number",
  "lastSyncedAt": "ISO timestamp"
}
```

**Sync Rule**: Pull from ManyReach every 15 minutes and cache in DB. Never call ManyReach API on every dashboard load.

---

## Frontend Dashboard Requirements

### KPI Cards
- Total Sent
- Total Replies
- Reply Rate %
- Total Opened / Clicked

### Charts (Recharts)
1. **Line/Area**: Emails Sent Over Time (daily)
2. **Line/Area**: Replies Over Time (daily)
3. **Line**: Reply Rate Trend

---

## Video Job Pipeline (BullMQ worker steps in order)

```
Prospect selected → Puppeteer records website → Save MP4 to /uploads/videos/{jobId}.mp4
→ DB update (videoPath, status: 'done') → ManyReach email sent → Prospect marked 'sent'
```

On failure: log `{ jobId, step, error, timestamp }`, set `status: 'failed'`, surface in dashboard for manual retry.

---

## Key API Routes

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/prospects/upload` | Upload and parse CSV |
| POST | `/api/prospects/verify/:batchId` | Run MailTester.Ninja verification |
| POST | `/api/recordings/start` | Queue website recording jobs |
| GET | `/api/recordings/status/:jobId` | Poll recording job status |
| POST | `/api/email/send/:campaignId` | Send emails via ManyReach |
| GET | `/api/email/export/:campaignId` | Export campaign CSV |
| GET | `/api/analytics/:campaignId` | Get cached analytics |
| POST | `/api/analytics/:campaignId/sync` | Force sync ManyReach stats |
| GET | `/uploads/videos/:jobId.mp4` | Serve recorded video (static) |

---

## Optional Feature (if time permits)

**Landing Page**: `GET /lp/:jobId`
- Simple HTML page (Handlebars or plain HTML)
- Embeds the prospect's video
- CTA button below video
- Must load under 2 seconds
- Variables: `{{firstName}}`, `{{company}}`, `{{videoUrl}}`, `{{senderName}}`, `{{ctaUrl}}`

---

## Cleanup Job (Important)

Run a daily cron job:
- Delete all video files under `/uploads/videos/` older than 7 days
- Update DB records accordingly

---

## Error Handling

On any step failure, log:
```json
{
  "jobId": "string",
  "step": "recording | email | verification",
  "error": "string",
  "timestamp": "ISO timestamp"
}
```

Set prospect/job `status: 'failed'` and surface in dashboard for manual retry. No automatic retries unless explicitly noted.

---

## Environment Variables

```
# Supabase
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=

# Backend services
MAILTESTER_API_KEY=
MANYREACH_API_KEY=

# Server
BASE_URL=https://yourdomain.com
PORT=3000
REDIS_URL=redis://localhost:6379
MAX_CONCURRENT_RECORDINGS=5

# Analytics
ANALYTICS_SYNC_INTERVAL_MINUTES=15
```

---

## Hard Rules

- **Never** send email to a prospect where `emailStatus !== 'valid'`
- **Never** use HeyGen, S3, or AI avatars — this is a Puppeteer-based recording system
- **Never** store video files permanently in `/tmp` — save to `/uploads/videos/`
- **Never** call ManyReach analytics API on every page load — use cached DB data
- **Never** block the main event loop — all recordings go through BullMQ
- **Always** limit concurrent recordings to `MAX_CONCURRENT_RECORDINGS` (3–5)
- **Always** log structured errors on every job step: `{ jobId, step, error, timestamp }`
- **Always** clean up videos older than 7 days via the daily cron job

---

## Testing

Tests use Vitest with jsdom. Test files match `src/**/*.{test,spec}.{ts,tsx}`. Setup file at [src/test/setup.ts](src/test/setup.ts) polyfills `window.matchMedia`.

---

## What This Is NOT

This is **not** an AI avatar video system.
This is a **"Personalized Loom-style outreach system at scale"**.

Focus on:
- Speed of recording
- Stability of the Puppeteer recorder
- Clean, smooth video output
- Reliable email sending
- Accurate analytics
