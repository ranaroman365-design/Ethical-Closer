# ETC Admin Decision Console — Canonical V1

> **Status:** Canonical control-surface spec. The single unified admin view that consolidates KPIs, [OSS](./operator-scoring-system.md), [PSM](./predictive-success-model.md), and the [Control Engine](./control-engine-bottleneck-system.md) into immediate, actionable decisions.
>
> **Doctrine:** ETC V6.1. Raw Data → Interpretation → Decision. No new logic, no new KPIs, no workflow changes — pure aggregation, visualization, prioritization.
>
> **Scope:** UX + information contract only. Defines what the console must show, in what order, and how it maps to existing engines. Implementation (routes, components, data hooks) is a separate work item.

---

## 0. Hard Rules (non-negotiable)

1. **No new KPIs.** Console reads only existing metrics via the [KPI Unification Layer](./kpi-unification-layer.md).
2. **No new workflows.** Action recommendations point to existing entries in the [Workflow Registry](./communication-engine-workflows.md).
3. **No new logic.** Decision badges are a pure read of the OSS × PSM matrix and Control Engine output.
4. **One screen, ≤10s read.** The full console must be parseable in under 10 seconds. Anything below the fold = drill-down, not primary signal.
5. **Every number must drill down** to its underlying KPI source. No black-box metrics.
6. **Action ≠ automation.** Recommendations are surfaced; admin still confirms (Autonomous Mode is a separate future spec).

---

## 1. Console Structure (MECE — 4 sections)

The console is divided into exactly 4 sections, in this order:

```
┌─────────────────────────────────────────────────────────┐
│  1. SYSTEM HEALTH         (global, always at top)       │
├─────────────────────────────────────────────────────────┤
│  2. OPERATOR INTELLIGENCE (who drives / blocks)         │
├─────────────────────────────────────────────────────────┤
│  3. BOTTLENECK → LEVER    (problem → action mapping)    │
├─────────────────────────────────────────────────────────┤
│  4. PRIORITY ACTIONS      (ranked next moves)           │
└─────────────────────────────────────────────────────────┘
```

### Section 1 — System Health (Global)
Top-of-fold. Answers: *"Is the system healthy right now?"*

| Element | Source |
|---|---|
| Primary Bottleneck (1 KPI) | Control Engine §3 |
| Δ% vs benchmark | Control Engine §3 |
| Trend arrow (7d) | rolling baseline |
| Severity badge (info/warning/critical) | Control Engine §3 |
| Funnel KPIs strip (LP→Quiz→Book→Show→Close) | existing KPI dashboard |
| Value KPIs strip (L1→L2→L4→L6 progression) | existing KPI dashboard |
| Class label (Traffic / Conversion / Sales / Activation / Retention) | Control Engine §3 |

### Section 2 — Operator Intelligence
Answers: *"Who matters right now?"*

Table columns (canonical):
| Operator | Level | OSS | PSP | Status |
|---|---|---|---|---|

**Required status labels** (mutually compatible — operator can carry multiple):
- `Strong Performer` — OSS > 75
- `High Potential` — PSP > 70
- `At Risk` — OSS < 50
- `Inconsistent` — CS component < 40
- `Late Bloomer` — PSP early-detection flag set
- `Plateau Risk` — PSP early-detection flag set

Default sort: descending by `severity_of_attention_needed` (At Risk + Inconsistent first), then by Decision matrix priority (Invest > Scale > Monitor > Deprioritize).

### Section 3 — Bottleneck → Lever Panel
Answers: *"What action removes the constraint?"*

For each active bottleneck, render:
```
Bottleneck:        <KPI name>
Class:             <A–E>
Δ%:                <value>
Root cause:        <stage transition>
Affected operators: <list with PSP/OSS>
Recommended lever: <existing WF_id>  [Mode: standard | INTENSE]
```

**Lever source:** strict lookup against [Control Engine §5 Bottleneck → Lever map](./control-engine-bottleneck-system.md#5-bottleneck--lever-mapping). Console must NOT invent levers.

### Section 4 — Priority Actions
Numbered, ranked list (max 5). Each action has:
- **What:** plain-language statement
- **Why:** quantified impact (Δ% or operator count)
- **How:** specific lever (workflow id or admin action)
- **Who:** affected operator(s) if scoped

Example:
```
1. Increase Show Rate (−14% vs benchmark)
   → Intensify WF_ACQ_BOOKED_SHOW_SEQUENCE [INTENSE]

2. Support Operator B (PSP 85 / OSS 61) — Decision: INVEST
   → Coaching focus on Skill component

3. Review Operator C (OSS 43 / PSP 30) — Decision: DEPRIORITIZE
   → Reactivation flow eligible
```

---

## 2. Decision Matrix (canonical)

Reads directly from [PSM §8](./predictive-success-model.md#8-oss--psm-decision-matrix). Console is a pure renderer — no recomputation here.

| OSS | PSP | Decision | Default Console Action |
|---|---|---|---|
| High | High | **Scale** | surface for traffic/responsibility increase |
| Low | High | **Invest** | flag for coaching, mentor pairing |
| High | Low | **Monitor** | watch for decay, no immediate action |
| Low | Low | **Deprioritize** | reactivation or managed exit |

Thresholds for High/Low live in OSS V1 + PSM V1. Console references, never redefines.

---

## 3. System Priority Stack

Tier ordering matches [Workflow Registry §6](./communication-engine-workflows.md) and [Control Engine §3](./control-engine-bottleneck-system.md). The console respects this ranking when multiple bottlenecks compete for the top slot:

| Tier | Focus areas |
|---|---|
| **Tier 1** | Show Rate, Close Rate |
| **Tier 2** | Booking Rate, L1 Activation |
| **Tier 3** | LP Conversion, Retention |

Tie-break for Section 1 primary bottleneck: Tier 1 always wins, then largest negative Δ% within tier.

---

## 4. Visual Hierarchy Rules

The console must satisfy the **10-second test**: an admin opening the page can answer "what is the #1 problem and what do I do about it?" in under 10 seconds.

Required ordering on the page:
1. **Primary bottleneck headline** (largest type, top-left)
2. **Quantified impact** (Δ%, severity badge)
3. **Operators affected** (count + first 3 names)
4. **Recommended action** (workflow lever or admin step)

Anything not directly serving this 10-second flow goes below the fold or into drill-downs.

---

## 5. Engine Integration Map

| Engine | Console Section | Data direction |
|---|---|---|
| [Acquisition](./communication-engine-workflows.md) | Section 1 (funnel KPIs) | read |
| [Value (Career L1–L8)](./operator-scoring-system.md) | Section 2 (operator table) | read |
| [Control Engine](./control-engine-bottleneck-system.md) | Sections 1, 3, 4 (bottleneck, lever, priority) | read |
| [Communication](./communication-engine-blueprint.md) | Section 3, 4 (lever recommendation only) | read |
| [KPI Unification](./kpi-unification-layer.md) | All sections (drill-down + benchmarks) | read |

The console is **read-only** at V1. Triggering a lever opens a confirmation flow; it does not auto-execute.

---

## 6. Worked Example — Final Output

```
═══════════════════════════════════════════════
  ETC SYSTEM STATUS                  ⚠ warning
═══════════════════════════════════════════════

  PRIMARY BOTTLENECK
  Show Rate           −14%   Trend: ↓ (7d)
  Class: B (Conversion)

  Funnel:  LP 24% • Quiz 61% • Book 38% • Show 52% ⚠ • Close 28%
  Value:   L1→L2 41% • L2→L4 22% • L4→L6 12%

───────────────────────────────────────────────
  TOP OPERATORS (Decision = Scale)
  A   L4   OSS 82   PSP 78   Strong Performer
  D   L4   OSS 79   PSP 81   Strong + High Potential

  HIGH POTENTIAL (Decision = Invest)
  B   L2   OSS 61   PSP 85   Late Bloomer flag

  AT RISK (Decision = Deprioritize)
  C   L5   OSS 43   PSP 30   Inconsistent

───────────────────────────────────────────────
  BOTTLENECK → LEVER
  Show Rate  →  WF_ACQ_BOOKED_SHOW_SEQUENCE [INTENSE]
  Affected:  B, D, F  (12 leads in window)

───────────────────────────────────────────────
  PRIORITY ACTIONS
  1. Intensify Booking → Show communication
     → WF_ACQ_BOOKED_SHOW_SEQUENCE [INTENSE]
  2. Coach Operator B (Invest)
     → focus Skill component
  3. Review Operator C (Deprioritize)
     → reactivation flow eligible
═══════════════════════════════════════════════
```

---

## 7. Governance

1. **Single screen, single source.** All numbers reconcile to the canonical KPI dashboard via the KPI Unification Layer.
2. **No mutation surface.** V1 is read-only + manual confirm. Auto-execution requires a separate Autonomous Mode spec.
3. **Auditability.** Each rendered recommendation logs `console_view_event { admin_id, primary_bottleneck, recommendations[], timestamp }` for later analysis of decision quality.
4. **Versioning.** Section count, decision matrix, and tier stack are canonical. Changes bump this spec's version.
5. **Access scope.** Admin + L7+ leadership view full console. L4–L6 see scoped subsets (own team / own operators).

---

## 8. Final System Effect

| Capability | Status |
|---|---|
| Deterministic workflows | ✅ Workflow Registry V1 |
| Closed-loop optimization | ✅ Control Engine V1 |
| Present-performance scoring | ✅ OSS V1 |
| Future-potential prediction | ✅ PSM V1 |
| Non-destructive KPI integration | ✅ KPI Unification V1 |
| **Single decision surface** | ✅ **Admin Decision Console V1 (this doc)** |

ETC now exposes: nothing hidden, nothing emotional, everything actionable.

---

## 9. Cross-References

- 5-block model: [`system-architecture-canonical.md`](./system-architecture-canonical.md)
- Behavioral spec: [`communication-engine-blueprint.md`](./communication-engine-blueprint.md)
- Workflow registry: [`communication-engine-workflows.md`](./communication-engine-workflows.md)
- Closed-loop optimizer: [`control-engine-bottleneck-system.md`](./control-engine-bottleneck-system.md)
- Present performance: [`operator-scoring-system.md`](./operator-scoring-system.md)
- Future potential: [`predictive-success-model.md`](./predictive-success-model.md)
- KPI integration: [`kpi-unification-layer.md`](./kpi-unification-layer.md)
- Existing performance views to align with: `mem://features/revenue-command-center-v8`, `mem://features/performance-command-center-l6`, `mem://features/performance-control-admin-layer`

*Canonical V1. Implementation = separate work item. Update only via explicit architectural review.*
