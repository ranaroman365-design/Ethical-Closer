# ETC Operator Economy — Coherence & Integration Layer (V1)

**Status:** Canonical · Non-Destructive · Read/Visibility-Only
**Stack Position:** Layer 9 of the ETC Architecture
**Depends on:** Commission System (existing), Gamification (existing), OSS (Layer 5), PSP (Layer 6), KPI Unification Layer (Layer 7), Admin Decision Console (Layer 8)

---

## 🎯 Objective

Create a unified, coherent representation of the existing Operator Economy that:

- preserves **all existing commission rules** (amounts, percentages, payout logic)
- preserves **all existing gamification mechanics** (leaderboards, badges, progress)
- integrates **OSS** (performance quality) and **PSP** (future potential) as **visibility layers only**
- increases clarity, motivation, and control — without inventing a new economy

---

## ⚠️ Hard Rules (Governance Lock)

| Rule | Status |
|------|--------|
| Modify commission amounts | ❌ Forbidden |
| Modify payout logic / triggers | ❌ Forbidden |
| Introduce new reward systems | ❌ Forbidden |
| Auto-mutate gamification rewards | ❌ Forbidden |
| Aggregate, align, visualize, connect existing data | ✅ Only allowed action |

**Principle:** This layer is a **mirror**, not a **mutator**.

---

## 🧩 Core Principle

```
Commission     = Economic Output    (existing — ground truth)
OSS            = Performance Quality (Layer 5)
PSP            = Future Potential    (Layer 6)
Gamification   = Motivation Layer    (existing — ground truth)
```

The Coherence Layer is the **read model** that joins these four sources into one user-facing and admin-facing narrative.

---

## 1️⃣ Commission Structure (Unchanged, Exposed)

Commission rules remain the canonical source. The layer **exposes** them in a normalized shape per level:

| Level | Role | Commission Model (existing) |
|-------|------|------------------------------|
| L2 | Setter | per qualified call |
| L4 | Junior Closer | % per closed deal |
| L5 | Closer | higher % / volume bonus |
| L6 | Operator | owns funnel economics |
| L7 | Director | override / portfolio share |
| L8 | Partner | B2B revenue share |

### Per-User Display Contract

```
Level:            L4
Commission:       10% per closed deal
Last 30d Revenue: €8,200
Your Earnings:    €820
Next Lever:       +3 deals → +€[computed]
```

All numbers must drill down to existing commission ledger entries — **no derived overrides**.

---

## 2️⃣ OSS Integration (Performance Visibility)

OSS is rendered alongside earnings to make performance economically meaningful.

```
OSS: 74 (Strong)

Breakdown:
- Activity:    68
- Skill:       81
- Revenue:     72
- Consistency: 75

Insight:
You are above average in skill, but below in activity.
→ Increasing call volume would directly increase earnings.
```

**Rule:** Insight strings are deterministic, generated from the lowest sub-component. No free-form AI text.

---

## 3️⃣ PSP Integration (Future Earnings Signal)

PSP frames potential income trajectory.

```
PSP: 82% (High Potential)

Insight:
You are likely to reach L6.
→ Focus on consistency to unlock operator-level income.
```

**Rule:** PSP is shown only for L1–L3 (per Layer 6 spec). Hidden for L4+.

---

## 4️⃣ Gamification (Unified, Not Replaced)

Existing gamification primitives are surfaced through three coherent views:

### A. Leaderboards
- by **OSS** (performance quality)
- by **Revenue** (economic output)
- by **Level** (career progression)

### B. Progress Indicators
```
Next Level: L5
Progress:   72%
Remaining:
  - +3 closed deals
  - OSS > 75
```

### C. Status Labels (deterministic from OSS + PSP)
| Label | Condition |
|-------|-----------|
| Elite | OSS ≥ 85 |
| Strong | OSS 70–84 |
| Developing | OSS 50–69 |
| At Risk | OSS < 50 |

---

## 5️⃣ Per-User Economic Dashboard (Single View)

```
=== YOUR PERFORMANCE ===

Level:               L4
Earnings (30d):      €820
Commission Model:    10% per deal

OSS: 74 (Strong)
PSP: 82% (High Potential)

Leaderboard Position: #6 / 42

Next Level: L5
→ 3 deals + OSS 75 required

Insight:
Increase call volume → +€1,200 potential
```

**Constraint:** All blocks read from existing tables. No new persistence except an optional materialized view for performance.

---

## 6️⃣ Control Engine Connection (Admin View)

The admin surface gains two coherence widgets:

### A. Revenue Distribution
```
Top 20% operators → 65% of revenue
Bottom 40%        → 10% of revenue
```

### B. Talent Allocation
```
High PSP + Low OSS → Underutilized → needs coaching
High OSS + Low PSP → Short-term performer → monitor
```

These map directly into the **Admin Decision Console (Layer 8)** Operator Intelligence section.

---

## 7️⃣ Behavioral Effect

| Stakeholder | Outcome |
|-------------|---------|
| Operator | Sees exactly how performance → income → status |
| Director | Sees where revenue concentrates and where potential is wasted |
| Admin | Allocates attention/budget based on coherent signals, not gut feeling |

---

## 🔒 Integration Contract

| Data Source | Role | Mutation Allowed? |
|-------------|------|-------------------|
| `commissions` table | Earnings ground truth | ❌ Read-only |
| Existing gamification (badges, leaderboards) | Motivation | ❌ Read-only |
| OSS (Layer 5) | Performance compression | ❌ Read-only |
| PSP (Layer 6) | Potential projection | ❌ Read-only |
| KPI thresholds (Layer 7) | Promotion gates | ❌ Read-only |

---

## 🧠 Final Truth

The Operator Economy already exists. This layer makes it **legible** —
turning fragmented signals (money, performance, growth) into one
coherent narrative: **Performance → Progression → Income → Status.**

---

*Layer 9 of 9 — Architectural stack complete. Implementation pending user signal.*
