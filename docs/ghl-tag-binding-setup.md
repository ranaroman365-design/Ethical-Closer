# GHL Tag Binding Setup — Day 1 Revenue Acceleration Layer

This document is the **operational checklist** for binding the 11 revenue-critical
tags inside GoHighLevel. The Lovable codebase emits these tags via
`process-outbound-events` — but the actual SMS/email send is performed by GHL
workflows. **Without bound workflows, no message ever leaves GHL.**

The agent **cannot** create GHL workflows from code (GHL has no public Workflows
API). You must create them once, manually, in the GHL UI.

To verify the tags themselves exist in your Location, call the
`verify-ghl-tag-bindings` edge function — it returns a per-tag `found / missing`
report.

---

## 1. Required tags (11)

Create each tag in **GHL → Settings → Tags**. Names are case-sensitive.

### Retargeting (no-booking sequence)

| Tag | Trigger window | Channel | Goal |
|---|---|---|---|
| `etc_retarget_sms_2h`     | quiz done + no booking 2h  | SMS   | Soft nudge, link back to booking |
| `etc_retarget_email_24h`  | quiz done + no booking 24h | Email | Re-frame value, scarcity |
| `etc_retarget_sms_48h`    | quiz done + no booking 48h | SMS   | Direct ask, low friction |
| `etc_retarget_email_72h`  | quiz done + no booking 72h | Email | Last call, alternative slot |

### Appointment reminders (show-up stack)

| Tag | Trigger window | Channel | Goal |
|---|---|---|---|
| `etc_appt_reminder_24h` | T-24h | SMS+Email | Confirm intent, send prep PDF |
| `etc_appt_reminder_2h`  | T-2h  | SMS       | Restate join link |
| `etc_appt_reminder_10m` | T-10min | SMS     | One-tap join |

### Payment recovery

| Tag | Trigger | Channel | Goal |
|---|---|---|---|
| `etc_payment_recover_sms`            | payment_status = at_risk | SMS | Recovery link |
| `etc_payment_recover_closer_notify`  | +10 min after at_risk    | Internal | Closer Slack/SMS alert |

### Audience sync

| Tag | Trigger | Goal |
|---|---|---|
| `etc_audience_no_booking` | hourly sync | Build retargeting audience for ads |
| `etc_audience_no_show`    | hourly sync | Build no-show recovery audience |

---

## 2. Per-tag workflow setup (GHL UI)

For **each tag** above, in **GHL → Automation → Workflows → + Create Workflow**:

1. **Trigger:** Contact Tag → *Tag Added* → select the tag.
2. **Filters:** none required (the codebase only applies tags to qualifying leads).
3. **Action(s):**
   - SMS tags → *Send SMS* action. Body templates below.
   - Email tags → *Send Email* action. Subject + body below.
   - `etc_payment_recover_closer_notify` → *Send Internal Notification* (or Slack
     webhook step) to the closer assignment channel — do **not** send to the lead.
   - `etc_audience_*` → *Add to Audience* / Facebook Custom Audience / Google
     Ads sync, depending on which ad platform you mirror to.
4. **Publish** the workflow (toggle to "Publish", not "Draft").

> The tag is the only trigger. Do not chain multiple tags into one workflow —
> each tag = one workflow = one outcome. This keeps the audit trail clean
> because each row in `outbound_events` corresponds 1:1 to a single GHL tag application.

---

## 3. Suggested message bodies

These match the wording the platform expects. Adjust tone if needed but keep
the merge fields and the booking link target.

### `etc_retarget_sms_2h`
> Hi {{contact.first_name}}, dein Quiz-Ergebnis ist freigeschaltet. Sichere dir
> jetzt deinen Slot: https://ethicalcloser.de/booking
> – Antwort STOP zum Abmelden.

### `etc_retarget_email_24h`
**Subject:** Dein Ergebnis wartet — und dein Slot auch
**Body:** Hi {{contact.first_name}}, gestern hast du das Quiz abgeschlossen,
aber noch keinen Termin gebucht. Hier ist dein direkter Link:
https://ethicalcloser.de/booking

### `etc_retarget_sms_48h`
> {{contact.first_name}}, kurze Frage: passt dir 16:00 oder 18:00 besser?
> Slot reservieren: https://ethicalcloser.de/booking

### `etc_retarget_email_72h`
**Subject:** Letzter Hinweis — wir schließen deinen Platz
**Body:** Hi {{contact.first_name}}, falls du noch einsteigen willst:
https://ethicalcloser.de/booking. Sonst geht der Platz an die nächste Person.

### `etc_appt_reminder_24h` (SMS+Email branch)
> {{contact.first_name}}, Erinnerung: Dein Strategiegespräch ist morgen um
> {{appointment.time}}. Join-Link: {{appointment.video_call_link}}.
> Bitte ruhige Umgebung sicherstellen.

### `etc_appt_reminder_2h`
> {{contact.first_name}}, in 2h ist dein Termin. Join-Link:
> {{appointment.video_call_link}}. Bitte 5 Minuten vorher beitreten.

### `etc_appt_reminder_10m`
> Wir starten in 10 Minuten. Direkt beitreten:
> {{appointment.video_call_link}}

### `etc_payment_recover_sms`
> {{contact.first_name}}, deine Zahlung ist nicht durchgekommen — kein Stress.
> Hier sicher abschließen (10 Min gültig): https://ethicalcloser.de/payment-recovery

### `etc_payment_recover_closer_notify` (internal)
> Lead {{contact.full_name}} ({{contact.email}}) — payment at_risk seit 10min.
> Bitte direkt anrufen.

---

## 4. Field mapping the codebase guarantees

`process-outbound-events` upserts the GHL contact with these fields **before**
applying the tag, so your workflows can rely on them:

| Field in GHL | Source |
|---|---|
| `email` | `outbound_events.email` (lowercased) |
| `firstName` / `lastName` / `name` | `leads.name` |
| `phone` | `leads.phone` |
| Custom `last_action` | the canonical event name |
| Custom `lead_id` | `outbound_events.entity_id` |

If a workflow needs the join link or appointment time, GHL's `{{appointment.*}}`
merge fields work because the appointment is mirrored as a GHL appointment via
the booking flow.

---

## 5. Verification flow

1. Run the verifier (admin only):
   ```
   POST {SUPABASE_URL}/functions/v1/verify-ghl-tag-bindings
   ```
   It returns `found: 11, missing: 0` once all tags exist in GHL.
2. Manually trigger one test event per category from the admin Revenue
   Acceleration KPI page (`/members/admin/revenue-acceleration`).
3. Confirm in GHL → Contact → *Activity* that:
   - the tag was applied,
   - the workflow fired,
   - the SMS/email was sent.
4. Check `outbound_events.status = 'sent'` in the database.

If any step fails, the row in `outbound_events` keeps the failure reason in
`last_error` for replay.

---

## 6. Failure rule (acceptance)

Per the Production Hardening spec:

> **If ANY tag is not mapped to a workflow → system status is PARTIAL, not PASS.**

The verifier function only confirms tag existence. Workflow binding must be
visually confirmed once in the GHL UI per tag. Once confirmed, no further
manual checks are needed unless the workflow is edited.
