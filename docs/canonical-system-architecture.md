# Layer 35 — Canonical System Architecture (Master System Map)

Production-level architecture canon. Names and wires together the 6 top-level
**system layers** that compose ETC. This is a **meta layer**: it adds no new
runtime behavior, it formalizes structure so every future feature has exactly
one place to live.

Source of truth: `src/lib/canonical-system-architecture.ts`
Canon id: **G3** (block: governance)

## The 6 System Layers

| # | Layer | Purpose | Sub-engines |
|---|-------|---------|-------------|
| 1 | **Lead Engine** | Generate, capture, score, route demand | funnel · lead_generation · qualification |
| 2 | **AI Setter** | Automated pre-qualification | chat · voice |
| 3 | **Communication Orchestration Layer** *(was: Smart Attendance)* | Single outbound surface | attendance_os · lead_activation · level_messaging · message_library |
| 4 | **Sales Intelligence Layer** | Analytical brain | state_detection · personality_matching · prediction · optimization |
| 5 | **Teamforce Layer** | Human capacity | structure · role_assignment · performance_tracking · scaling |
| 6 | **Revenue & Value** | Outcome / closing loop | closing · compensation · retention |

## Data Flow

```
Lead Engine
    │
    ├─► AI Setter ──┐
    │               │
    └────────────► Communication Orchestration ◄─► Sales Intelligence
                              │                             ▲
                              ▼                             │
                          Teamforce ────────────────────────┘
                              │
                              ▼
                        Revenue & Value ──► Sales Intelligence (feedback)
```

Use `auditConnectivity()` to verify no layer is orphaned.

## Scaling Targets

Every layer must function for all four scaling targets:
- `individual_closer`
- `team`
- `company`
- `scaling_org`

If a feature only works for one target, it does not yet meet the canon.

## Feature Proposal Gate

Every new feature must answer:
1. Which **system layer** does it belong to? (`SystemLayerId`)
2. Which **sub-engine** inside that layer does it extend? (`SubEngine.id`)

Use `validateFeaturePlacement(layer, sub_engine_id)`. A null return = valid.
Otherwise the proposal is rejected and must either pick an existing sub-engine
or formally extend `SYSTEM_LAYERS` via canon amendment.

## Renames absorbed by this layer

- **Smart Attendance** → folded into `communication_orchestration` as the
  `comm.attendance_os` sub-engine. The name "Smart Attendance" is retained in
  user-facing UI for continuity but is no longer canonical.

## Relationship to existing canons

This layer **does not replace** L27..L34. It groups them:

- L27 Attendance OS, L29 Lead Activation, L30 Level Messaging, L31 Message
  Library, L23 Channel Cascade → all live under **Communication Orchestration**.
- L28 AI Setter → split into `ai_setter.chat` + `ai_setter.voice`.
- L32 Message Performance, L33 Voice Performance, L34 Funnel Intelligence,
  Control Engine, OSS/PSP → all live under **Sales Intelligence**.
- Role Naming, Role Definitions, Lead Assignment, OSS, Progression, B2B/SPaaS,
  Capacity → all live under **Teamforce**.
- Closing Engine v24, Compensation, Reactivation → all live under
  **Revenue & Value**.

No data migration. No schema change. Pure structural canon.
