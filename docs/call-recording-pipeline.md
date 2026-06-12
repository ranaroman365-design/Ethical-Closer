# Call Recording Ingestion Pipeline

> **Status**: Active  
> **Layer**: Intelligence (Call Infrastructure)  
> **Canon Block**: Conversion / Intelligence

---

## Pipeline Overview

```
Recording Source          receive-call-recording       transcribe-call        DB Trigger              process-pending-analyses      analyze-call
(Zoom/Custom/Upload) ──→ (download + store audio) ──→ (AI transcription) ──→ pending_call_analyses ──→ (cron worker) ──────────→ (AI analysis + call_ai_scores)
```

## Supported Sources

### 1. Zoom Webhook (`recording.completed`)
- Webhook URL: `https://<project>.supabase.co/functions/v1/receive-call-recording`
- Requires: `ZOOM_WEBHOOK_SECRET` secret for endpoint validation
- Auto-matches recordings to appointments via `meeting_id`
- Downloads audio, uploads to `call-recordings` bucket

### 2. Custom/Manual Ingestion
```json
POST /functions/v1/receive-call-recording
{
  "call_id": "uuid",
  "audio_url": "https://...",
  "provider": "custom"
}
```

### 3. Direct Transcript Paste
```json
POST /functions/v1/receive-call-recording
{
  "call_id": "uuid",
  "transcript_text": "Closer: Hallo...",
  "provider": "manual"
}
```

## Database Flow

1. **Recording received** → audio stored in `call-recordings` bucket
2. **Transcription** → `calls.transcript` updated via Lovable AI (Gemini)
3. **DB Trigger** (`tg_enqueue_call_analysis`) → inserts into `pending_call_analyses`
4. **Cron Worker** (`process-pending-analyses`) → calls `analyze-call` with service key
5. **Analysis** → writes `call_analysis` + `call_ai_scores` + updates `performance_metrics`

## Tables Involved

| Table | Purpose |
|-------|---------|
| `calls` | Core call record with transcript |
| `pending_call_transcriptions` | Queue for audio → transcript |
| `pending_call_analyses` | Queue for transcript → analysis |
| `call_analysis` | Detailed AI analysis results |
| `call_ai_scores` | Normalized scores for Performance OS |
| `performance_metrics` | Aggregated user performance |
| `video_events` | Webhook event log |

## Scoring (call_ai_scores)

| Dimension | Weight | Source |
|-----------|--------|--------|
| Objection Handling | 20% | objection_score × 10 |
| Trust | 20% | rapport_score × 10 |
| Clarity | 15% | qualification_score × 10 |
| Structure | 15% | (opening + pitch) / 2 × 10 |
| Ethical Alignment | 15% | closing_score × 10 |
| Closing Readiness | 15% | closing_efficiency × 10 |

## Required Secrets

| Secret | Purpose | Required |
|--------|---------|----------|
| `RECORDING_WEBHOOK_SECRET` | Shared secret for webhook auth | Optional |
| `ZOOM_WEBHOOK_SECRET` | Zoom endpoint validation | For Zoom |
| `LOVABLE_API_KEY` | AI transcription + analysis | Yes (auto) |

## Zoom Setup

1. In Zoom Marketplace → Create Webhook-Only App
2. Event: `recording.completed`
3. Webhook URL: `https://pjufhxzjgdnhvuuvltjn.supabase.co/functions/v1/receive-call-recording`
4. Copy Secret Token → add as `ZOOM_WEBHOOK_SECRET` in Lovable Cloud
5. Validate endpoint → Zoom sends `endpoint.url_validation`
