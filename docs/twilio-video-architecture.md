# Twilio Video Architecture — ETC Platform

> **Status**: Post-Launch Feature · NOT Go-Live Critical  
> **Layer**: Revenue Engine (Call Infrastructure)  
> **Canon Block**: Conversion  
> **Last Updated**: 2026-05-02

---

## 1. Grundsatz

Twilio Video ist **kein Go-Live Blocker**. Phase 1 bleibt:
- Google Meet / Zoom Link im Appointment
- Call Context Panel in ETC

Twilio Video wird erst aktiviert, wenn:
- Lead Routing stabil ist
- Payment → Revenue → Commission stabil läuft
- Kalender / Appointments stabil sind
- Dashboards dieselbe Truth nutzen

---

## 2. Zielbild

Calls laufen direkt innerhalb der Plattform. User verlässt ETC nicht.

Während des Calls sichtbar:
- Lead Context, Quiz Antworten, Setter/Closer Notes
- Timeline, Payment Link Button, Outcome Buttons
- Follow-up Actions, No-Show / Show Status

---

## 3. Datenmodell

### appointments (erweitert)
| Feld | Typ | Beschreibung |
|------|-----|-------------|
| video_room_sid | text | Twilio Room SID |
| video_room_name | text | Room Name (`etc_{appointment_id}`) |
| video_room_status | text | created/live/ended/failed |
| video_join_url_internal | text | Internal join URL |
| video_started_at | timestamptz | Call Start |
| video_ended_at | timestamptz | Call Ende |
| video_duration_seconds | int | Dauer |
| recording_enabled | boolean | Recording aktiv |
| recording_sid | text | Twilio Recording SID |
| recording_url | text | Recording URL (intern) |
| transcript_status | text | pending/processing/completed/failed |
| transcript_url | text | Transcript URL |
| video_provider_fallback | boolean | Fallback zu Meet/Zoom |

### video_sessions
Jede Video-Session mit Room-Daten, Status, Dauer, Recording/Transcript-Status.

### video_participants
Jeden Teilnehmer loggen: User/Lead, Typ (lead/setter/closer/operator/admin), Join/Leave, Gerät.

### video_events
Webhook-Events von Twilio (room-created, participant-connected, recording-completed etc.).

### call_reviews
KI-gestützte Call-Analyse: Score, Einwände, gewinnende Phrasen, verpasste Chancen, Trainingsempfehlungen.

---

## 4. Room Creation

Beim Booking:
1. Appointment erstellen
2. Twilio Group Room erstellen
3. `room_sid` / `room_name` speichern
4. `video_sessions` Record anlegen

Room Naming: `etc_{appointment_id}`

---

## 5. Access Token Service

Edge Function: `create-twilio-video-token`

**Input**: appointment_id, participant_type, user_id / lead_token

**Interne User**: auth.uid() + Zugriff auf appointment/operator_unit prüfen  
**Lead**: Sicherer public join token, appointment-spezifisch, zeitlich begrenzt

**Output**: Twilio Access Token, room_name, participant_identity

⚠️ Twilio Secrets niemals im Frontend.

---

## 6. Join Flow

### Interne User
Button: "Call in Plattform starten"  
Route: `/members/calls/:appointment_id`  
→ Lead Context laden → Token holen → Twilio Room verbinden

### Lead (Public)
Route: `/call/:public_token`  
→ Branding → Name bestätigen → Datenschutz/Consent → Join

---

## 7. Call Room UI

| Links/Hauptbereich | Rechts |
|---------------------|--------|
| Video Room | Lead Context Panel |

Right Panel: Name, Telefon, E-Mail, Funnel, Quiz Score, Quiz Antworten, Terminstatus, Setter/Closer Notes, Payment Link erzeugen, Outcome setzen, Follow-up erstellen, No-Show markieren.

---

## 8. Call Status Automation

| Event | Aktion |
|-------|--------|
| Interner Join | call_started_at = now(), status = in_progress |
| Lead Join | attendance_flag = true, status = showed |
| Call Ende | ended_at, duration berechnen |
| Lead nicht joined (X min) | no_show candidate (kein Auto-NoShow) |

---

## 9. Recording

Optional, nur mit Consent UI. Recording Flag pro Appointment.

Access: Closer → eigene | L6 → Unit | L7 → Area | Admin → alles

---

## 10. Transcription & AI Call Review

Nach Recording: Audio → Transcription → AI Review → `call_reviews` mit Score, Objections, Winning Phrases, Missed Opportunities, Training Recommendations.

---

## 11. Webhooks

Edge Function: `twilio-video-webhook`

Events: room-created, room-ended, participant-connected, participant-disconnected, recording-completed, recording-failed → `video_events` + `video_sessions` + `video_participants`

Webhook-Signature validieren.

---

## 12. Security

- Jeder Join braucht Token (appointment-spezifisch, ablaufend)
- Lead Token nicht wiederverwendbar nach Ende
- User Zugriff über operator_unit prüfen
- RLS auf allen Video-Tabellen

---

## 13. RLS Matrix

| Level | Zugriff |
|-------|---------|
| L4 | Eigene Calls |
| L5 | Eigene + gecoachte |
| L6 | Alle Calls eigener Unit |
| L7 | Alle Calls eigener Area |
| L8/Admin | Alles |
| Lead | Nur Public Join, kein DB-Zugriff |

---

## 14. Fallback

Wenn Twilio Room nicht startet:
- Backup-Link (Zoom/Google Meet) anzeigen
- `video_provider_fallback = true`
- Fehler loggen

**Niemals Call verlieren wegen Video-Provider.**

---

## 15. Performance / Reliability

- Loading State, Reconnect Handling, Device Permission Errors
- Camera/Mic Test vor Join
- Mobile Safari Handling + Browser Compatibility Check
- Inkompatibel → Fallback Link

---

## 16. Cost Control

Tracken: Room Duration, Participant Minutes, Recording Minutes, Transcription Cost.

Dashboard: Video Cost per Unit, Cost per Closed Deal, Cost per Call.

---

## 17. Integration mit Revenue OS

Video Call verbunden mit: appointment, lead, call, payment_link, commission, operator_unit.

Nach Call: Outcome Pflicht, Payment Link optional, Follow-up optional, No-close Reason Pflicht bei Lost.

---

## 18. Rollout-Strategie

| Phase | Scope |
|-------|-------|
| A | Admin/Test only |
| B | 1 Operator Unit |
| C | Alle L6 Units |
| D | Recording + AI Review |
| E | Embedded Video als Standard |

---

## 19. Required Secrets (bei Aktivierung)

- `TWILIO_VIDEO_API_KEY_SID`
- `TWILIO_VIDEO_API_KEY_SECRET`
- `TWILIO_ACCOUNT_SID` (bereits vorhanden)

---

## 20. Edge Functions (zu erstellen)

1. `create-twilio-video-token` — Token-Service
2. `twilio-video-webhook` — Webhook-Handler
3. `create-twilio-video-room` — Room Creation bei Booking
