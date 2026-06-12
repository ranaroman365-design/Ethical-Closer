# Layer 13 — Canonical Narrative (ETC)

> **One System · One Path · One Language**
>
> The single, immutable explanation of ETC. Same structure, same words, every surface.

**Source of truth:** [`src/lib/canonical-narrative.ts`](../src/lib/canonical-narrative.ts)

---

## Why this exists

Without a fixed narrative:
- Sales messaging drifts
- Users misunderstand the system
- Internal team misaligns
- Trust drops

With it: **Clarity → Trust → Conversion → Retention**

---

## The four lengths

| Length    | Use case                                  | Export              |
| --------- | ----------------------------------------- | ------------------- |
| Tagline   | Hero, footer, meta description, ads       | `NARRATIVE_TAGLINE` |
| 20-second | Landing hero subhead, opening of any call | `NARRATIVE_20S`     |
| 60-second | Sales pitch, About section, onboarding    | `NARRATIVE_60S`     |
| 3-minute  | Full deck, investor brief, team training  | `NARRATIVE_FULL`    |

Always render via `getNarrative(length, lang)` — never inline copies.

---

## The fixed structure (3-minute version)

Six parts, always in this order:

1. **Entry** — Acquisition, qualification, Level 0
2. **Career Path** — L1 → L6 progression
3. **Performance System** — KPIs drive everything
4. **System Support** — Tools, training, automation
5. **Economics** — Pay-for-performance per role
6. **End State** — Senior Closer running own pipeline

Locked in `NARRATIVE_STRUCTURE`. No reordering. No additions. No removals.

---

## The visual flow

```
Lead → Applicant → Trainee → Setter → Closer → Senior Closer
```

Use this exact sequence on landing pages, decks, dashboards, onboarding.

---

## Hard rules

1. **No variations.** Nobody rewrites for their team / call / campaign.
2. **Same structure everywhere.** Entry → System → Progression → Performance → Earnings → Outcome.
3. **No extra complexity.** Forbidden in narrative copy: `OSS`, `PSP`, `Operator`, `Engine`, `Layer`, `Canonical`, `MECE`.
   - **Critical:** `Operator` is internal-only. Externally always `Senior Closer` (per Layer 11).
4. **Align with system.** Levels, KPIs, naming, economics must match Layer 11 + Layer 12.

---

## Internal training requirement

Every team member must be able to deliver:
- 20-second version verbatim
- 60-second version verbatim
- The 6 levels in correct order with correct external names

---

## Integration points

| Surface                | Length     |
| ---------------------- | ---------- |
| Landing hero           | Tagline + 20s |
| Landing "How it works" | Full (6 parts) |
| Onboarding screen 1    | 20s        |
| Onboarding screen 2    | Visual flow |
| Sales call opening     | 20s        |
| Sales call discovery   | 60s        |
| Investor / partner deck | Full + tagline |
| Email footer / about   | Tagline    |

---

## Governance

- **Edits to narrative copy** require updating `src/lib/canonical-narrative.ts` only.
- **`assertNarrativeSafe(text)`** — dev-mode guard that throws if forbidden internal terms leak into narrative copy. Use in CI tests.
- **Never** translate ad-hoc — both `en` and `de` must update together.

---

## Relationship to other canonical layers

| Layer | Name                          | Provides to Narrative                  |
| ----- | ----------------------------- | -------------------------------------- |
| 11    | Canonical Role Naming         | External role labels (Senior Closer…)  |
| 12    | Operational Canon             | KPI names, events, time windows        |
| 13    | **Canonical Narrative**       | **The single explanation, everywhere** |

Layer 13 is the final invariant. With it locked, the system is fully canonical.
