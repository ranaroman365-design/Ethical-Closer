# Manual QA Checklist — Cancelled Appointment Removal in Calendar Clients

The automated test (`src/test/appointment-ics-cancel.test.ts`) verifies the
ICS payload our edge function produces. This checklist verifies that real
calendar clients (Google Calendar, Microsoft Outlook, Apple Calendar) actually
**remove the event from the user's calendar** when they re-import the
cancellation `.ics`.

---

## Why a manual pass is required

Calendar clients implement RFC 5545 inconsistently. Removal only happens when
**all three** of the following are true on the second import:

1. Same `UID` as the original event
2. `METHOD:CANCEL` + `STATUS:CANCELLED`
3. `SEQUENCE` strictly greater than the previously delivered value

Even when the payload is correct, some clients require a fresh download of
the `.ics` (cached responses can mask removal). The automated test asserts
the payload contract; this checklist validates client behaviour.

---

## Endpoint under test

```
GET https://<project>.functions.supabase.co/appointment-ics?id=<appointment_uuid>
```

Or via the public URL: `https://ethical-closing.lovable.app/functions/v1/appointment-ics?id=<uuid>`

---

## Setup (one-time per run)

1. Pick a real appointment row with `appointment_status = 'confirmed'` and
   `starts_at` ≥ 24h in the future. Note its `id`.
2. Open the ICS URL in the browser → file downloads.
3. Import into the target calendar client (see per-client steps below).
4. Confirm the event appears with title **"Ethical Closer Qualifikationsgespräch"**.

---

## Test matrix

Run each row across every client. Mark ✅ / ❌.

| # | DB change                                              | Expected effect on calendar           | Google | Outlook | Apple |
| - | ------------------------------------------------------ | ------------------------------------- | ------ | ------- | ----- |
| 1 | `appointment_status = 'rescheduled'`                   | Event **removed**, reason "verschoben" |        |         |       |
| 2 | `appointment_status = 'deleted'`                       | Event **removed**, reason "gelöscht"   |        |         |       |
| 3 | `appointment_status = 'cancelled'`                     | Event **removed**, reason "abgesagt"   |        |         |       |
| 4 | `appointment_status = 'expired'`                       | Event **removed**, reason "abgelaufen" |        |         |       |
| 5 | `appointment_status = 'no_show'`                       | Event **removed**, reason "No-Show"    |        |         |       |
| 6 | `outcome = 'rescheduled'` (status stays `confirmed`)   | Event **removed**, reason "verschoben" |        |         |       |
| 7 | Re-confirm: revert to `appointment_status='confirmed'` | New `.ics` re-creates event            |        |         |       |

For each removed event, also verify:

- [ ] **Description contains the rebooking link** `https://ethical-closing.lovable.app/booking?src=reschedule`
- [ ] **Description contains the short reason** in German
- [ ] **Title is prefixed `ABGESAGT —`** (visible briefly before client removes it)

---

## Per-client steps

### Google Calendar

1. Open ICS URL → downloads `ethical-closer-<uuid>.ics`.
2. https://calendar.google.com → **Settings → Import & export → Import** → select file → choose target calendar → **Import**.
3. Verify event appears.
4. Update DB (`UPDATE appointments SET appointment_status='rescheduled', updated_at=now() WHERE id='<uuid>'`).
5. Re-download the same ICS URL (force fresh download — clear browser cache or use incognito).
6. Re-import via same flow.
7. **Expected**: Google shows "1 event was cancelled" toast and the slot is empty.
8. Open the (now-removed) event from history if visible → description shows reason + rebook link.

### Microsoft Outlook (Web + Desktop)

1. Open ICS URL → downloads `.ics`.
2. **Outlook Web**: open file → "Add to calendar" → choose calendar → **Save**.
   **Outlook Desktop (Windows/Mac)**: double-click file → **Save & Close**.
3. Verify event appears.
4. Update DB to one of the cancelled states; re-download ICS (incognito).
5. Open the new ICS file.
6. **Expected**:
   - Outlook Web: prompt "This event has been cancelled. Remove from calendar?" → click Yes.
   - Outlook Desktop: meeting opens with strikethrough title and "Removed" banner; click "Remove from Calendar".
7. Confirm slot is empty.

### Apple Calendar (iCloud)

1. Open ICS URL on macOS → opens in Calendar.app.
2. Choose target calendar → **OK**.
3. Update DB to a cancelled state; re-download ICS.
4. Open the new ICS.
5. **Expected**: Calendar.app shows "Update Event" → confirms cancellation; event disappears from the timeline.

---

## Common failure modes & how to diagnose

| Symptom                                       | Likely cause                                                                                | Fix                                                                                                                       |
| --------------------------------------------- | ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Event stays in calendar after re-import       | `SEQUENCE` did not increment (DB `updated_at` unchanged)                                    | Ensure the cancellation write updates `updated_at = now()`. The edge function derives sequence from `updated_at - created_at`. |
| Outlook ignores cancellation                  | Cached ICS in browser/CDN                                                                   | Force fresh download (incognito + `?_=<timestamp>` query suffix).                                                          |
| Google imports cancellation as a NEW event    | UID mismatch                                                                                | Confirm same `id` is used. UID format is `<uuid>@ethical-closing` and must be identical.                                   |
| Description missing reason or rebook link     | Edge function not redeployed after change                                                   | Re-deploy `appointment-ics`; verify with `curl <ics-url> \| grep DESCRIPTION`.                                              |
| Apple Calendar prompts "Add" instead of "Update" | Original event was added under a different account / calendar                            | Re-import to the same calendar that originally received the event.                                                         |

---

## Quick sanity check via curl (no calendar client needed)

```bash
curl -s "https://ethical-closing.lovable.app/functions/v1/appointment-ics?id=<UUID>" \
  | grep -E "METHOD|STATUS|SEQUENCE|SUMMARY|DESCRIPTION|UID"
```

A cancellation should return:

```
METHOD:CANCEL
UID:<uuid>@ethical-closing
SEQUENCE:<n>          ← must be greater than previous SEQUENCE
SUMMARY:ABGESAGT — Ethical Closer Qualifikationsgespräch
DESCRIPTION:Termin wurde <reason>.\n\nNeuen Termin buchen: https://ethical-closing.lovable.app/booking?src=reschedule\n…
STATUS:CANCELLED
```

If those 6 lines look right, the payload contract holds — any client failure
beyond that is a client-side caching or import issue, not a system bug.

---

## When to re-run this checklist

- After any change to `supabase/functions/appointment-ics/index.ts`
- After adding new values to `appointment_status` / `call_status` / `outcome`
- After changing the `CANCELLED_STATES` set or `reasonFor()` mapping
- Before any release that touches reschedule or cancellation flows

The automated test catches payload regressions in CI; this checklist catches
client-behaviour regressions that only surface end-to-end.
