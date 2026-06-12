# Layer 16 — Canonical Lifestyle & Freedom Canon

**Source of truth:** `src/lib/canonical-lifestyle.ts`
**Sits before:** Layer 15 (Charisma) → Layer 14 (Emotion) → Layer 13 (Narrative).

## Core principle

**Lifestyle → Emotion → Narrative → Proof → Action**

Before: *"This is a good opportunity."*
After: *"This is the life I want."*

## Hard rules

- ❌ Do NOT modify the Canonical Narrative (Layer 13).
- ❌ Do NOT exaggerate ("get rich quick", guaranteed income, overnight, passive income).
- ❌ Do NOT invent new desire angles outside the locked set of 7.
- ✅ MUST create aspiration, identity shift, lifestyle → system bridge.
- ✅ Tone: calm, confident, inevitable, high-status.

## Locked desire angles (7, fixed)

1. **Freedom** — exit the 9-to-5
2. **Remote lifestyle** — work from anywhere
3. **Income shift** — performance, not hours
4. **Speed** — weeks, not years
5. **Security through system** — KPIs → predictable progress
6. **Community** — international, ambitious peers
7. **Impact** — guide, don't convince

## Mandatory section order

1. Lifestyle Hook (Layer 16)
2. Desire Expansion (Layer 16)
3. Transition (Layer 16)
4. Canonical Narrative — 20s (Layer 13, untouched)
5. System
6. Path (L1–L8)
7. Economics
8. End State (Layer 15 locked)

## Helpers

- `getDesireAngle(key, lang)`
- `getLifestyleHook(lang)`
- `validateLifestyleSurface(input)` → `{ passed, failures, warnings }`
- `assertLifestyleSafe(input)` → dev-mode throw on canon violation

## Validation checks

1. `lifestyle_hook` present and precedes `canonical_narrative`.
2. `desire_expansion` present.
3. `transition` present.
4. `end_state` present.
5. No hype/get-rich-quick language.
6. Community angle present (warning, not failure).

## Strategic insight

**Lifestyle + Community > Income alone.**
Layer 16 is the strongest top-of-funnel lever — it converts logical interest into identity-level desire.
