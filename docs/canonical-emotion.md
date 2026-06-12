# Layer 14 — Emotional & Conversion Canon (ETC)

> **Emotion → Narrative → Proof → Action**
>
> Sits BEFORE the Canonical Narrative on every conversion surface.
> Activates desire, tension, urgency — without changing the Canon.

**Source of truth:** [`src/lib/canonical-emotion.ts`](../src/lib/canonical-emotion.ts)
**Wraps:** Layer 13 — Canonical Narrative (`src/lib/canonical-narrative.ts`)

---

## Hard rules

- ❌ **Do not modify** the Canonical Narrative (Layer 13).
- ❌ **Do not mix** emotion inside the Canon — emotion lives in its own pre-section.
- ❌ **Do not invent** new triggers, hooks, transitions, or CTAs.
- ✅ **Hook always comes before narrative.**
- ✅ **Always end in outcome** (End State from Layer 13).
- ✅ **Proof is mandatory** — missing proof = CRITICAL CONVERSION GAP.

---

## 1. Emotional triggers (fixed set — only these)

| Key            | Trigger        | Line                                                                                |
| -------------- | -------------- | ----------------------------------------------------------------------------------- |
| `frustration`  | A. Frustration | Most people try to learn sales and never make real money.                           |
| `confusion`    | B. Confusion   | There is no clear path. No structure. No system.                                    |
| `wasted_time`  | C. Wasted Time | People spend months learning, but never actually perform.                           |
| `desire`       | D. Desire      | What you actually want is a clear path where performance turns into income.         |
| `control`      | E. Control     | You want to know exactly what to do, what to improve, and how to progress.          |

No new emotional angles allowed.

---

## 2. Hook structures (pick exactly one per surface)

| Type             | Pattern                                                       |
| ---------------- | ------------------------------------------------------------- |
| `contrast`       | Most people [fail pattern]. This system [clear solution].     |
| `problem_path`   | Right now: [problem]. What you need: [path].                  |
| `identity_shift` | Not just a closer → someone trusted to build revenue.         |

---

## 3. Transition lines (mandatory bridge)

- Primary: *"That's exactly why this system exists."*
- Secondary: *"That's where ETC comes in."*

Every conversion surface must include exactly one transition line between the emotional hook and the Canonical Narrative.

---

## 4. CTA canon (only these)

- Primary: **Start Your Application** / *Bewerbung starten*
- Secondary (optional): **See if you qualify** / *Prüfen, ob du qualifiziert bist*

Any other CTA copy is a canon violation.

---

## 5. Canonical landing flow (fixed 9-section order)

```
1. Emotional Hook
2. Problem Amplification
3. Transition → System
4. Canonical Narrative (20s → 60s)
5. Path (visual)
6. Economics
7. End State
8. Proof
9. CTA
```

Every landing/conversion surface must follow this exact order.

---

## 6. Validation — 4 mandatory checks

Run `validateConversionSurface(input)`:

1. **CHECK 1** — Starts with emotion (hook present)
2. **CHECK 2** — Transitions into narrative (transition line present)
3. **CHECK 3** — Ends with outcome (End State present)
4. **CHECK 4** — Avoids internal terminology (reuses Layer 13 forbidden list)

Plus:
- Proof must be present (else: CRITICAL CONVERSION GAP)
- CTA must match `CTA_CANON` (else: warning)

Use `assertConversionSafe(input)` as a dev-mode guard in CI / story tests.

---

## 7. Helpers

| Helper                                  | Returns                                            |
| --------------------------------------- | -------------------------------------------------- |
| `getTrigger(trigger, lang)`             | Localized trigger line                             |
| `getHookExample(hookType, lang)`        | Localized hook example                             |
| `getTransition(variant, lang)`          | Primary / secondary transition line                |
| `getCta(variant, lang)`                 | Primary / secondary CTA                            |
| `validateConversionSurface(input)`      | `{ passed, failures, warnings }`                   |
| `assertConversionSafe(input)`           | Throws in dev when surface violates canon          |

---

## 8. Relationship to other canonical layers

| Layer | Name                          | Role                                       |
| ----- | ----------------------------- | ------------------------------------------ |
| 11    | Canonical Role Naming         | External labels (Senior Closer, …)         |
| 12    | Operational Canon             | Events, KPIs, states, terminology lock     |
| 13    | Canonical Narrative           | The fixed explanation in 4 lengths          |
| 14    | **Emotional & Conversion**    | **Activation layer wrapping Layer 13**      |

Layer 14 never mutates Layer 13 — it precedes it.

---

## Final effect

Before: a perfect **explanation**.
With Layer 14: a perfect **persuasion system**.
